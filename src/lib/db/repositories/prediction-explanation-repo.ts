import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv, getSupabaseProjectUrl } from "@/lib/config/env";

/**
 * Repository for prediction_explanations (migration 014). APPEND-ONLY:
 * SELECT + INSERT only, NEVER UPDATE/DELETE.
 *
 * Canonical idempotency: the DB partial unique index
 * (prediction_id, prompt_schema, prompt_version, language) WHERE status='generated'
 * guarantees ONE generated explanation. On a concurrent insert race we re-read
 * the winning row and reuse it (never overwrite).
 */
function client(): SupabaseClient {
  const env = getEnv();
  const url = getSupabaseProjectUrl();
  if (!url) throw new Error("PredictionExplanationRepo: Supabase no configurado");
  return createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

export interface GeneratedExplanationRow {
  id: number;
  predictionId: number;
  provider: string;
  modelName: string;
  promptSchema: string;
  promptVersion: number;
  language: string;
  payload: Record<string, unknown>;
  inputFingerprint: string | null;
  generatedAt: string;
}

export interface GeneratedInsertInput {
  predictionId: number;
  provider: string;
  modelName: string;
  promptSchema: string;
  promptVersion: number;
  language: string;
  payload: Record<string, unknown>;
  inputFingerprint: string | null;
}

export interface FailedInsertInput {
  predictionId: number;
  provider: string;
  modelName: string;
  promptSchema: string;
  promptVersion: number;
  language: string;
  inputFingerprint: string | null;
  errorClass: string;
}

export interface PredictionExplanationRepo {
  getGeneratedExplanation(
    input: {
      predictionId: number;
      promptSchema: string;
      promptVersion: number;
      language: string;
    },
  ): Promise<GeneratedExplanationRow | null>;
  insertGenerated(
    input: GeneratedInsertInput,
  ): Promise<{ row: GeneratedExplanationRow; created: boolean }>;
  insertFailed(input: FailedInsertInput): Promise<void>;
}

interface ExplanationDbRow {
  id: number;
  prediction_id: number;
  provider: string;
  model_name: string;
  prompt_schema: string;
  prompt_version: number;
  language: string;
  payload: Record<string, unknown> | null;
  input_fingerprint: string | null;
  generated_at: string;
}

function toGeneratedRow(row: ExplanationDbRow): GeneratedExplanationRow {
  return {
    id: row.id,
    predictionId: row.prediction_id,
    provider: row.provider,
    modelName: row.model_name,
    promptSchema: row.prompt_schema,
    promptVersion: row.prompt_version,
    language: row.language,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    inputFingerprint: row.input_fingerprint ?? null,
    generatedAt: row.generated_at,
  };
}

const GEN_FILTERS = (
  input: { predictionId: number; promptSchema: string; promptVersion: number; language: string },
) => ({
  prediction_id: input.predictionId,
  status: "generated",
  prompt_schema: input.promptSchema,
  prompt_version: input.promptVersion,
  language: input.language,
});

export function createProductionPredictionExplanationRepo(
  sb: SupabaseClient = client(),
): PredictionExplanationRepo {
  const getGenerated = async (input: {
    predictionId: number;
    promptSchema: string;
    promptVersion: number;
    language: string;
  }): Promise<GeneratedExplanationRow | null> => {
    let query = sb.from("prediction_explanations").select("*");
    for (const [key, value] of Object.entries(GEN_FILTERS(input))) {
      query = query.eq(key, value);
    }
    const { data, error } = await query
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`prediction_explanations read: ${error.message}`);
    return data ? toGeneratedRow(data as unknown as ExplanationDbRow) : null;
  };

  return {
    getGeneratedExplanation: getGenerated,
    insertGenerated: async (input) => {
      const row = {
        prediction_id: input.predictionId,
        provider: input.provider,
        model_name: input.modelName,
        prompt_schema: input.promptSchema,
        prompt_version: input.promptVersion,
        language: input.language,
        payload: input.payload,
        status: "generated",
        input_fingerprint: input.inputFingerprint,
        error_class: null,
      } as const;
      try {
        const { data, error } = await sb
          .from("prediction_explanations")
          .insert(row)
          .select("*")
          .single();
        if (error) {
          throw new Error(`prediction_explanations insert: ${error.message}`);
        }
        return {
          row: toGeneratedRow(data as unknown as ExplanationDbRow),
          created: true,
        };
      } catch (err) {
        // Race with a concurrent generator: the DB partial unique index
        // rejects the loser. Re-read the canonical winner and reuse it.
        if (!isDuplicateViolation(err)) throw err;
        const winner = await getGenerated({
          predictionId: input.predictionId,
          promptSchema: input.promptSchema,
          promptVersion: input.promptVersion,
          language: input.language,
        });
        if (!winner) throw err;
        return { row: winner, created: false };
      }
    },
    insertFailed: async (input) => {
      const row = {
        prediction_id: input.predictionId,
        provider: input.provider,
        model_name: input.modelName,
        prompt_schema: input.promptSchema,
        prompt_version: input.promptVersion,
        language: input.language,
        payload: null,
        status: "failed",
        input_fingerprint: input.inputFingerprint,
        error_class: input.errorClass,
      } as const;
      const { error } = await sb.from("prediction_explanations").insert(row);
      if (error) throw new Error(`prediction_explanations insert failed: ${error.message}`);
    },
  };
}

function isDuplicateViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as Error & { code?: unknown }).code;
  return code === "23505" || /duplicate key value/i.test(err.message);
}