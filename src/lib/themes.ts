/**
 * NYVORX theme model (pure, no server-only deps).
 *
 * Single source of truth for the five allowed UI themes and the FREE/PREMIUM
 * entitlement over them:
 *   - FREE   → only "cyan" may be applied (fail-closed to "cyan").
 *   - PREMIUM→ all five themes may be applied.
 *
 * The stored profile value is NEVER trusted as-is: `resolveTheme` reassesses
 * entitlement server-side. A FREE user with a stored "gold" falls back to
 * "cyan".
 */

export type ThemeId = "cyan" | "gold" | "pink" | "green" | "red";

export const THEME_IDS: readonly ThemeId[] = [
  "cyan",
  "gold",
  "pink",
  "green",
  "red",
];

export const DEFAULT_THEME: ThemeId = "cyan";

export const FREE_THEME_ID: ThemeId = "cyan";

export const THEME_LABELS: Record<ThemeId, string> = {
  cyan: "Cian",
  gold: "Oro",
  pink: "Rosa",
  green: "Verde",
  red: "Rojo",
};

export function isThemeId(value: unknown): value is ThemeId {
  return (
    typeof value === "string" &&
    (THEME_IDS as readonly string[]).includes(value)
  );
}

/** Normaliza cualquier valor a un ThemeId válido; falla cerrado a cyan. */
export function normalizeTheme(value: unknown): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME;
}

/**
 * Resuelve el tema que se puede APLICAR para un rol dado (fail-closed):
 * - free     → SOLO cyan (aunque el perfil tenga otro valor persistido).
 * - premium  → normalizeTheme(stored).
 */
export function resolveTheme(
  role: "free" | "premium",
  stored: unknown,
): ThemeId {
  return role === "premium" ? normalizeTheme(stored) : FREE_THEME_ID;
}