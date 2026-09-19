import "server-only";
import { resolveTheme, type ThemeId } from "@/lib/themes";
import { getCurrentUser, getCurrentProfile } from "@/lib/auth/session";

/**
 * Server-side FREE/PRO decision for any render path (panels, headers,
 * selectors). Single funnel: session + profiles.role. Fail-closed:
 *   - no session / anonymous → "free"
 *   - profile missing/error  → "free"
 *   - profile role premium   → "pro"
 *   - anything throwing      → "free" (render never breaks on auth)
 */
export async function resolveViewerPlanForRender(): Promise<"free" | "pro"> {
  try {
    const user = await getCurrentUser();
    if (!user) return "free";
    const result = await getCurrentProfile(user.id);
    return result.status === "ok" && result.profile.role === "premium"
      ? "pro"
      : "free";
  } catch {
    return "free";
  }
}

/**
 * Server-side theme for the render. Fail-closed:
 *   - no session / anonymous       → cyan
 *   - profile missing/error        → cyan
 *   - FREE (cualquier valor)       → cyan (profiles.theme ignorado)
 *   - PREMIUM + theme válido       → ese tema
 *   - PREMIUM + theme inválido/falta → cyan
 * El valor persistido nunca se respeta como-is: pasa por resolveTheme.
 */
export async function resolveViewerThemeForRender(): Promise<ThemeId> {
  try {
    const user = await getCurrentUser();
    if (!user) return "cyan";
    const result = await getCurrentProfile(user.id);
    if (result.status !== "ok") return "cyan";
    return resolveTheme(result.profile.role, result.profile.theme);
  } catch {
    return "cyan";
  }
}