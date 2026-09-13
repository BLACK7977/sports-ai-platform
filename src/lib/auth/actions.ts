"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, AuthConfigError } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/redirects";
import { toSafeAuthErrorMessage } from "@/lib/auth/errors";
import { buildLoginPayload, buildSignUpPayload } from "@/lib/auth/credentials";

export type AuthActionState = { ok: true; needsConfirmation?: boolean } | { ok: false; error: string };

function configUnavailable(): AuthActionState {
  return { ok: false, error: "Autenticación no configurada. Avisá al administrador." };
}

export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  let credentials: { email: string; password: string };
  try {
    credentials = buildLoginPayload({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Datos inválidos." };
  }
  const next = safeNextPath(formData.get("next"));
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    if (err instanceof AuthConfigError) return configUnavailable();
    throw err;
  }
  const { error } = await supabase.auth.signInWithPassword(credentials);
  if (error) return { ok: false, error: toSafeAuthErrorMessage(error) };
  revalidatePath("/", "layout");
  redirect(next);
}

export async function registerAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  let signup: { email: string; password: string };
  try {
    signup = buildSignUpPayload({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      confirm: String(formData.get("confirm") ?? ""),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Datos inválidos." };
  }
  // Anti-abuso silencioso: cualquier campo "role" enviado por el cliente se
  // ignora por completo (buildSignUpPayload no lo acepta). El trigger de DB
  // fuerza role='free'.
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    if (err instanceof AuthConfigError) return configUnavailable();
    throw err;
  }
  const { data, error } = await supabase.auth.signUp(signup);
  if (error) return { ok: false, error: toSafeAuthErrorMessage(error) };
  // Sin sesión => email confirmation activada: avisar, no loguear.
  if (!data.session) {
    return { ok: true, needsConfirmation: true };
  }
  revalidatePath("/", "layout");
  redirect(safeNextPath(formData.get("next")));
}

export async function logoutAction(): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // Logout best-effort incluso sin configuración.
  }
  revalidatePath("/", "layout");
  redirect("/");
}
