import "server-only";
import {
  getCurrentUser,
  getCurrentProfile,
  resolvePremiumAccess,
} from "@/lib/auth/session";
import type { ExplanationPlan } from "@/lib/types/prediction-explanation";

/**
 * Server-side FREE/PRO decision for the persisted-explanation render path.
 *
 * Decided here, in the server component, from the session + profiles table.
 * Never trusted from client input. Fail-closed:
 *   - no session / anonymous  → "free"
 *   - profile missing/error   → "free"
 *   - profile role premium    → "pro"
 *   - anything throwing       → "free" (render never breaks on auth)
 */
export async function resolveExplanationPlanForRender(): Promise<ExplanationPlan> {
  try {
    const user = await getCurrentUser();
    if (!user) return "free";
    const profile = await getCurrentProfile(user.id);
    return resolvePremiumAccess(profile).allowed ? "pro" : "free";
  } catch {
    return "free";
  }
}