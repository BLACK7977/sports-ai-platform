import "server-only";
import { createSupabaseServerClient, AuthConfigError } from "@/lib/supabase/server";

export type UserRole = "free" | "premium";

export interface SessionUser {
  id: string;
  email: string | null;
}

export interface UserProfile {
  userId: string;
  role: UserRole;
}

/** Resultado tipado de lectura de perfil. Distingue ok/missing/error. */
export type ProfileResult =
  | { status: "ok"; profile: UserProfile }
  | { status: "missing" }
  | { status: "error"; message: string };

/** Cliente mínimo inyectable (tests/fakes). Compatible con Supabase SSR. */
export interface SessionAuthClient {
  auth: {
    getUser(): Promise<{ data: { user: { id: string; email?: string | null } | null }; error: unknown }>;
  };
  from(table: string): {
    select(columns?: string): {
      eq(column: string, value: unknown): {
        maybeSingle(): Promise<{ data: { role?: unknown } | null; error: unknown }>;
      };
    };
    upsert(row: Record<string, unknown>, opts?: { onConflict?: string }): Promise<{ error: unknown }>;
  };
}

function isValidRole(value: unknown): value is UserRole {
  return value === "free" || value === "premium";
}

async function defaultClient(): Promise<SessionAuthClient> {
  return (await createSupabaseServerClient()) as unknown as SessionAuthClient;
}

/** null si no hay sesión o auth no configurado (degrada a visitante). */
export async function getCurrentUser(
  client?: SessionAuthClient,
): Promise<SessionUser | null> {
  let supabase: SessionAuthClient;
  try {
    supabase = client ?? (await defaultClient());
  } catch (err) {
    if (err instanceof AuthConfigError) return null;
    throw err;
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

/**
 * Lee el perfil del usuario. Distingue explícitamente:
 * - ok: perfil válido
 * - missing: usuario sin perfil (no existe fila)
 * - error: fallo de lectura (Supabase, RLS, red, etc.)
 *
 * Nunca lanza. Fail-closed para premium.
 */
export async function getCurrentProfile(
  userId: string,
  client?: SessionAuthClient,
): Promise<ProfileResult> {
  let supabase: SessionAuthClient;
  try {
    supabase = client ?? (await defaultClient());
  } catch (err) {
    if (err instanceof AuthConfigError) return { status: "error", message: "Auth no configurada." };
    console.error("[auth] getCurrentProfile: client creation failed.", err);
    return { status: "error", message: "No se pudo conectar al servicio de auth." };
  }
  const { data, error } = await supabase.from("profiles").select("user_id, role").eq("user_id", userId).maybeSingle();
  if (error) {
    console.error("[auth] getCurrentProfile: query failed.", error);
    return { status: "error", message: "No se pudo leer el perfil." };
  }
  if (!data) return { status: "missing" };
  if (!isValidRole(data.role)) {
    console.error("[auth] getCurrentProfile: invalid role value.", data.role);
    return { status: "error", message: "Perfil con rol inválido." };
  }
  return { status: "ok", profile: { userId, role: data.role } };
}

export class AuthRequiredError extends Error {
  constructor() {
    super("Se requiere autenticación.");
    this.name = "AuthRequiredError";
  }
}

export class PremiumRequiredError extends Error {
  constructor() {
    super("Se requiere plan Premium.");
    this.name = "PremiumRequiredError";
  }
}

/** Lanza AuthRequiredError si no hay sesión válida. */
export async function requireAuth(client?: SessionAuthClient): Promise<SessionUser> {
  const user = await getCurrentUser(client);
  if (!user) throw new AuthRequiredError();
  return user;
}

/**
 * Lanza AuthRequiredError sin sesión, PremiumRequiredError sin rol premium.
 * Fail-closed: error de lectura → NO permite premium.
 * El rol se lee SIEMPRE server-side desde profiles; jamás de body/cookies
 * manipulables ni de metadata editable por el cliente.
 */
export async function requirePremium(client?: SessionAuthClient): Promise<{ user: SessionUser; profile: UserProfile }> {
  const user = await requireAuth(client);
  const result = await getCurrentProfile(user.id, client);
  if (result.status !== "ok" || result.profile.role !== "premium") throw new PremiumRequiredError();
  return { user, profile: result.profile };
}

// ── Server Action authorization (reuses the same session/profile logic) ──

/** Resultado de autorización de una Server Action. */
export type ActionAccess =
  | { status: "anonymous" }
  | { status: "authenticated"; role: UserRole; user: SessionUser };

/**
 * Autoriza una Server Action. Reutiliza exactamente la misma cadena que el
 * render (getCurrentUser → getCurrentProfile → resolvePremiumAccess); no crea
 * un segundo sistema de autorización. Fail-closed:
 *   - sin sesión / auth no configurada → anonymous
 *   - perfil missing/error             → authenticated con rol "free"
 * El rol se lee SIEMPRE server-side desde profiles; jamás de argumentos,
 * cookies manipulables ni metadata editable por el cliente.
 */
export async function resolveActionAccess(client?: SessionAuthClient): Promise<ActionAccess> {
  const user = await getCurrentUser(client);
  if (!user) return { status: "anonymous" };
  const profile = await getCurrentProfile(user.id, client);
  return {
    status: "authenticated",
    role: resolvePremiumAccess(profile).allowed ? "premium" : "free",
    user,
  };
}

// ── Pure helpers (reused by header, premium gate, tests) ──

/** Resuelve el plan visible en el header desde un ProfileResult. */
export function resolveHeaderPlan(result: ProfileResult): UserRole | null {
  return result.status === "ok" ? result.profile.role : null;
}

/** Resultado del gating premium. */
export type PremiumAccess =
  | { allowed: true; role: UserRole }
  | { allowed: false; reason: "free" | "missing" | "error" };

/**
 * Resuelve acceso premium desde un ProfileResult (puro, sin side-effects).
 * Fail-closed: missing/error → denied.
 */
export function resolvePremiumAccess(result: ProfileResult): PremiumAccess {
  if (result.status !== "ok") {
    return { allowed: false, reason: result.status };
  }
  if (result.profile.role === "premium") {
    return { allowed: true, role: "premium" };
  }
  return { allowed: false, reason: "free" };
}
