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

/** null si no hay perfil o no es legible. Nunca lanza por RLS denegado. */
export async function getCurrentProfile(
  userId: string,
  client?: SessionAuthClient,
): Promise<UserProfile | null> {
  let supabase: SessionAuthClient;
  try {
    supabase = client ?? (await defaultClient());
  } catch (err) {
    if (err instanceof AuthConfigError) return null;
    throw err;
  }
  const { data, error } = await supabase.from("profiles").select("user_id, role").eq("user_id", userId).maybeSingle();
  if (error || !data || !isValidRole(data.role)) return null;
  return { userId, role: data.role };
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
 * El rol se lee SIEMPRE server-side desde profiles; jamás de body/cookies
 * manipulables ni de metadata editable por el cliente.
 */
export async function requirePremium(client?: SessionAuthClient): Promise<{ user: SessionUser; profile: UserProfile }> {
  const user = await requireAuth(client);
  const profile = await getCurrentProfile(user.id, client);
  if (!profile || profile.role !== "premium") throw new PremiumRequiredError();
  return { user, profile };
}
