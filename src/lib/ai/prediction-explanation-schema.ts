import { z } from "zod";

/**
 * STRICT server-side validation for persisted prediction explanations.
 *
 * Gemini NEVER produces or modifies quantitative outputs: it only explains an
 * already-persisted canonical prediction. This schema is the contract for what
 * we are willing to persist from a provider response. Unknown/extra keys are
 * REJECTED (z.strictObject). Only the validated payload is stored.
 */

export const EXPLANATION_PROMPT_SCHEMA = "sports-ai-explanation-v1";
export const EXPLANATION_PROMPT_VERSION = 1;
export const EXPLANATION_LANGUAGE = "es";

export const EXPLANATION_SUMMARY_MAX_CHARS = 300;
export const EXPLANATION_FACTOR_MAX_CHARS = 140;
export const EXPLANATION_MODEL_READING_MAX_CHARS = 240;
export const EXPLANATION_MIN_FACTORS = 2;
export const EXPLANATION_MAX_FACTORS = 4;

const trimmedBounded = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => s.length > 0, "El texto no puede estar vacío");

export const predictionExplanationPayloadSchema = z.strictObject({
  summary: trimmedBounded(EXPLANATION_SUMMARY_MAX_CHARS),
  key_factors: z
    .array(trimmedBounded(EXPLANATION_FACTOR_MAX_CHARS))
    .min(EXPLANATION_MIN_FACTORS)
    .max(EXPLANATION_MAX_FACTORS),
  model_reading: trimmedBounded(EXPLANATION_MODEL_READING_MAX_CHARS),
});

export type PredictionExplanationPayload = z.infer<
  typeof predictionExplanationPayloadSchema
>;