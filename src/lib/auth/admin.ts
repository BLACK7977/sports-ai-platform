import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getEnv, getSupabaseProjectUrl } from "@/lib/config/env";
import type { UserRole } from "@/lib/auth/session";

/**
 * Administración de roles server-side. Usa service_role DIRECTO (nunca pasa
 * por anon/authenticated ni por RLS). NO importar desde componentes cliente
 * ni exponer vía acciones llamadas con datos del usuario para el role.
 * No existe UI que lo invoque: solo uso administrativo controlado futuro.
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
