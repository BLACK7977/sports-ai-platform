import "server-only";
import { resolveViewerPlanForRender } from "@/lib/presentation/theme";
import type { ExplanationPlan } from "@/lib/types/prediction-explanation";

/**
 * Server-side FREE/PRO decision for the persisted-explanation render path.
 *
 * Delegates to the shared resolveViewerPlanForRender funnel so every part of
 * the app uses the same session + profiles.role logic. Never trusted from
 * client input. Fail-closed: anonymous / missing / error → "free".
 */
export async function resolveExplanationPlanForRender(): Promise<ExplanationPlan> {
  return resolveViewerPlanForRender();
}