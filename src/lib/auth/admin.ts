import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getEnv, getSupabaseProjectUrl } from "@/lib/config/env";
import { isThemeId, type ThemeId } from "@/lib/themes";
import type { UserRole } from "@/lib/auth/session";

/**
 * Administración de roles y temas server-side. Usa service_role DIRECTO
 * (nunca pasa por anon/authenticated ni por RLS). NO importar desde
 * componentes cliente ni exponer vía acciones llamadas con datos del usuario
 * para el role. setProfileTheme se invoca SOLO después de que la entidad
 * autorizadora (runSetProfileTheme) verificó sesión y entitlement.
 */
export async function setUserRole(userId: string, role: UserRole): Promise<void> {
  if (typeof userId !== "string" || userId.length === 0 || userId.length > 100) {
    throw new Error("[auth-admin] userId inválido.");
  }
  if (role !== "free" && role !== "premium") {
    throw new Error("[auth-admin] role inválido (solo free/premium).");
  }
  const env = getEnv();
  const projectUrl = getSupabaseProjectUrl();
  if (!projectUrl || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("[auth-admin] sin credenciales service_role.");
  }
  const supabase = createClient(projectUrl, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await supabase.from("profiles").upsert({ user_id: userId, role }, { onConflict: "user_id" });
  if (error) throw new Error("[auth-admin] no se pudo actualizar el role.");
}

/**
 * Persiste el tema del usuario en profiles.theme con un UPDATE ONLY.
 *
 * Contrato de persistencia:
 *   - NUNCA escribe profiles.role: la autorización (FREE solo cyan / PREMIUM
 *     cualquier tema) la resuelve la entidad autorizadora
 *     (runSetProfileTheme → resolveActionAccess) leyendo el role server-side.
 *     Acá solo llega el userId y el theme ya autorizado.
 *   - NUNCA inserta una fila: si el perfil no existe, el UPDATE no toca
 *     ninguna fila y se detecta vía el SELECT de retorno para fallar-cerrado
 *     (error, sin persistir).
 *
 * La DB trigger `enforce_profile_theme_for_role` sigue como defense-in-depth
 * y NO se modifica; refuerza free → cyan incluso si alguien escribiera theme
 * directo.
 */
export async function setProfileTheme(userId: string, theme: ThemeId): Promise<void> {
  if (typeof userId !== "string" || userId.length === 0 || userId.length > 100) {
    throw new Error("[auth-admin] userId inválido.");
  }
  if (!isThemeId(theme)) {
    throw new Error("[auth-admin] theme inválido.");
  }
  const env = getEnv();
  const projectUrl = getSupabaseProjectUrl();
  if (!projectUrl || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("[auth-admin] sin credenciales service_role.");
  }
  const supabase = createClient(projectUrl, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase
    .from("profiles")
    .update({ theme })
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle();
  if (error) throw new Error("[auth-admin] no se pudo actualizar el theme.");
  if (!data) throw new Error("[auth-admin] perfil no encontrado; theme no persistido.");
}
