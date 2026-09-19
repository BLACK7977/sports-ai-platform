import "server-only";
import { isThemeId, resolveTheme, THEME_IDS, type ThemeId } from "@/lib/themes";
import { resolveActionAccess, type SessionAuthClient } from "@/lib/auth/session";
import {
  AUTH_REQUIRED_ERROR,
  PRO_REQUIRED_ERROR,
  GENERIC_ERROR,
} from "@/lib/services/action-errors";
import { setProfileTheme } from "@/lib/auth/admin";
import type { UserRole } from "@/lib/auth/session";

/**
 * Testable core of the "set profile theme" Server Action.
 *
 * The exported action in `src/app/account/actions.ts` is a thin wrapper that
 * delegates here, so the authorization/entitlement gate can be exercised
 * offline with injected mocks while the public action signature stays exactly
 * as before.
 *
 * SECURITY INVARIANT — effective order is ALWAYS:
 *   request → server-side auth → role entitlement over the theme → persist
 * A FREE user may only ever set "cyan" (fail-closed). A PREMIUM user may set
 * any of the five themes. The role is read server-side from profiles, never
 * from client input; the persisted theme is never trusted as-is (the DB
 * trigger additionally forces free → cyan).
 */

export type ThemeUpdateResult =
  | { ok: true; theme: ThemeId; role: UserRole; appliedPreview: ThemeId }
  | {
      ok: false;
      code: "UNAUTHORIZED" | "PRO_REQUIRED" | "GENERIC";
      error: string;
    };

export interface ThemeUpdateDeps {
  /** Injectado en tests; en producción se usa la sesión real. */
  authClient?: SessionAuthClient;
  /**
   * Persistencia del tema. En producción se usa el service_role admin; en
   * tests se inyecta un spy que nunca toca la DB.
   *
   * Contrato con la DB: UPDATE-only sobre `{ theme }` con `user_id = userId`.
   * NUNCA recibe el role: la autorización (FREE solo cyan / PREMIUM cualquier
   * tema) ya la resolvió `resolveActionAccess` leyendo profiles.role
   * server-side; acá sólo se persiste el tema autorizado. Tampoco inserta
   * perfiles: si la fila no existe, `setProfileTheme` falla-cerrado sin
   * persistir. La trigger `enforce_profile_theme_for_role` sigue como
   * defense-in-depth (free → cyan) y no se modifica.
   */
  persist?: (userId: string, theme: ThemeId) => Promise<void>;
}

export async function runSetProfileTheme(
  requested: unknown,
  deps: ThemeUpdateDeps = {},
): Promise<ThemeUpdateResult> {
  if (!isThemeId(requested)) {
    return { ok: false as const, code: "GENERIC" as const, error: GENERIC_ERROR };
  }

  const access = await resolveActionAccess(deps.authClient);
  if (access.status === "anonymous") {
    return { ok: false as const, code: "UNAUTHORIZED" as const, error: AUTH_REQUIRED_ERROR };
  }

  // Entitlement ANTES de cualquier persistencia: FREE solo cyan.
  const allowed = resolveTheme(access.role, requested);
  if (allowed !== requested) {
    return { ok: false as const, code: "PRO_REQUIRED" as const, error: PRO_REQUIRED_ERROR };
  }

  try {
    const persist = deps.persist ?? setProfileTheme;
    await persist(access.user.id, allowed);
  } catch (err) {
    console.warn("[theme] runSetProfileTheme: persist failed.", err);
    return { ok: false as const, code: "GENERIC" as const, error: GENERIC_ERROR };
  }

  return { ok: true as const, theme: allowed, role: access.role, appliedPreview: allowed };
}

export { THEME_IDS };