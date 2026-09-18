import "server-only";
import {
  EXPLANATION_LANGUAGE,
  EXPLANATION_PROMPT_SCHEMA,
  EXPLANATION_PROMPT_VERSION,
  predictionExplanationPayloadSchema,
  type PredictionExplanationPayload,
} from "@/lib/ai/prediction-explanation-schema";
import {
  buildCanonicalContext,
  buildExplanationPrompt,
  computeExplanationFingerprint,
  type CanonicalExplanationSource,
} from "@/lib/ai/prediction-explanation-context";
import type {
  GeminiProviderResult,
} from "@/lib/ai/providers/gemini-provider";
import type { PredictionExplanationRepo } from "@/lib/db/repositories/prediction-explanation-repo";

/**
 * PREDICTION EXPLANATION SERVICE (server-only).
 *
 * The SPORTS AI mathematical model owns ALL quantitative outputs. Gemini only
 * EXPLAINS an already-persisted canonical prediction. Flow:
 *
 *   canonical prediction exists
 *   → generated explanation exists?  YES → return persisted (0 Gemini calls)
 *   → build frozen allowed inputs + fingerprint
 *   → provider call (bounded, sanitized)
 *   → Zod validation of the structured JSON
 *   → persist generated (race-safe) / persist failed (sanitized)
 *
 * NEVER invoked during SSR; only after an explicit action/internal job.
 * NEVER mutates the prediction row: this module only READS predictions and
 * WRITES prediction_explanations rows.
 */

export const EXPLANATION_PROVIDER = "google-generative-ai";

export interface ExplanationReadDeps {
  repo: Pick<PredictionExplanationRepo, "getGeneratedExplanation">;
}

/**
 * READ-ONLY persisted-explanation read for page render.
 *
 * This is the ONLY explanation read allowed on the render path: it never
 * touches a provider, never generates, never fabricates. It returns the
 * validated persisted payload or null (no explanation yet). Deliberately
 * separate from `generatePredictionExplanation` so SSR/RSC/navigation cannot
 * accidentally trigger a provider call.
 *
 * Strict Zod validation on the read keeps corrupt/out-of-schema rows out of
 * the UI: a row that no longer validates renders as "not available".
 */
export async function readPersistedExplanation(
  deps: ExplanationReadDeps,
  input: { predictionId: number },
): Promise<PredictionExplanationPayload | null> {
  const row = await deps.repo.getGeneratedExplanation({
    predictionId: input.predictionId,
    promptSchema: EXPLANATION_PROMPT_SCHEMA,
    promptVersion: EXPLANATION_PROMPT_VERSION,
    language: EXPLANATION_LANGUAGE,
  });
  if (!row) return null;
  const parsed = predictionExplanationPayloadSchema.safeParse(row.payload);
  return parsed.success ? parsed.data : null;
}

export interface ExplanationProviderLike {
  generate(request: {
    prompt: string;
    apiKey?: string;
    model?: string;
  }): Promise<GeminiProviderResult>;
}

export interface ExplanationGenerationInput extends CanonicalExplanationSource {}

export interface ExplanationServiceDeps {
  repo: Pick<
    PredictionExplanationRepo,
    "getGeneratedExplanation" | "insertGenerated" | "insertFailed"
  >;
  provider: ExplanationProviderLike;
  modelName: string;
  apiKey?: string;
}

export type ExplanationUnavailableReason =
  | "missing-key"
  | "timeout"
  | "http"
  | "network"
  | "validation"
  | "malformed";

export type ExplanationGenerationResult =
  | {
      ok: true;
      explanation: PredictionExplanationPayload;
      fingerprint: string;
      generated: boolean;
    }
  | {
      ok: false;
      reason: ExplanationUnavailableReason;
      status?: number;
    };

function parseExplanationJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Solitary valid JSON inside a fenced code block (provider safety net).
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

export async function generatePredictionExplanation(
  deps: ExplanationServiceDeps,
  input: ExplanationGenerationInput,
): Promise<ExplanationGenerationResult> {
  if (!deps.apiKey) {
    return { ok: false, reason: "missing-key" };
  }

  const context = buildCanonicalContext(input);
  const fingerprint = computeExplanationFingerprint(context);

  const existing = await deps.repo.getGeneratedExplanation({
    predictionId: context.predictionId,
    promptSchema: EXPLANATION_PROMPT_SCHEMA,
    promptVersion: EXPLANATION_PROMPT_VERSION,
    language: EXPLANATION_LANGUAGE,
  });
  if (existing) {
    const parsed = predictionExplanationPayloadSchema.safeParse(existing.payload);
    if (!parsed.success) {
      return { ok: false, reason: "validation" };
    }
    return {
      ok: true,
      explanation: parsed.data,
      fingerprint: existing.inputFingerprint ?? fingerprint,
      generated: false,
    };
  }

  const prompt = buildExplanationPrompt(context);
  const result = await deps.provider.generate({
    prompt,
    apiKey: deps.apiKey,
    model: deps.modelName,
  });

  if (!result.ok) {
    const failure = result.failure;
    await deps.repo.insertFailed({
      predictionId: context.predictionId,
      provider: EXPLANATION_PROVIDER,
      modelName: deps.modelName,
      promptSchema: EXPLANATION_PROMPT_SCHEMA,
      promptVersion: EXPLANATION_PROMPT_VERSION,
      language: EXPLANATION_LANGUAGE,
      inputFingerprint: fingerprint,
      errorClass: failure.kind + (failure.status ? `:${failure.status}` : ""),
    });
    return {
      ok: false,
      reason: failure.kind,
      status: failure.status,
    };
  }

  const parsedJson = parseExplanationJson(result.text);
  const validated = predictionExplanationPayloadSchema.safeParse(parsedJson);
  if (!validated.success) {
    await deps.repo.insertFailed({
      predictionId: context.predictionId,
      provider: EXPLANATION_PROVIDER,
      modelName: deps.modelName,
      promptSchema: EXPLANATION_PROMPT_SCHEMA,
      promptVersion: EXPLANATION_PROMPT_VERSION,
      language: EXPLANATION_LANGUAGE,
      inputFingerprint: fingerprint,
      errorClass: "validation",
    });
    return { ok: false, reason: "validation" };
  }

  const { row, created } = await deps.repo.insertGenerated({
    predictionId: context.predictionId,
    provider: EXPLANATION_PROVIDER,
    modelName: deps.modelName,
    promptSchema: EXPLANATION_PROMPT_SCHEMA,
    promptVersion: EXPLANATION_PROMPT_VERSION,
    language: EXPLANATION_LANGUAGE,
    payload: validated.data as unknown as Record<string, unknown>,
    inputFingerprint: fingerprint,
  });

  return {
    ok: true,
    explanation: validated.data,
    fingerprint: row.inputFingerprint ?? fingerprint,
    generated: created,
  };
}