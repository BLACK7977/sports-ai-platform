import type { PredictionExplanationPayload } from "@/lib/ai/prediction-explanation-schema";

/**
 * Minimal typed interface for rendering a persisted explanation.
 *
 * FREE shows only `summary`; PRO shows the full structured content. The plan
 * to use is decided server-side (never trusted from client-only state) via
 * `presentExplanation`.
 */
export type ExplanationPlan = "free" | "pro";

export interface FreeExplanationView {
  plan: "free";
  summary: string;
}

export interface ProExplanationView {
  plan: "pro";
  summary: string;
  keyFactors: string[];
  modelReading: string;
}

export type PredictionExplanationView =
  | FreeExplanationView
  | ProExplanationView;

export function presentExplanation(
  payload: PredictionExplanationPayload,
  plan: ExplanationPlan,
): PredictionExplanationView {
  if (plan === "pro") {
    return {
      plan: "pro",
      summary: payload.summary,
      keyFactors: payload.key_factors,
      modelReading: payload.model_reading,
    };
  }
  return { plan: "free", summary: payload.summary };
}