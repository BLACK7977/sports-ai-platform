import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getEnv, getSupabaseProjectUrl } from "@/lib/config/env";

export class AuthConfigError extends Error {
  constructor() {
    super("Autenticación no configurada (falta NEXT_PUBLIC_SUPABASE_ANON_KEY).");
    this.name = "AuthConfigError";
  }
}

/**
 * Cliente Supabase para Server Components/Actions/Routes, con cookies de
 * sesión. Requiere anon key (segura para este uso server-side; nunca exponer
 * service_role en cliente). Lanza AuthConfigError si falta configuración.
 */
export async function createSupabaseServerClient() {
  const env = getEnv();
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const projectUrl = getSupabaseProjectUrl();
  if (!anonKey || !projectUrl) throw new AuthConfigError();
  const cookieStore = await cookies();
  return createServerClient(projectUrl, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // setAll desde un Server Component (sinmutación permitida): la
          // sesión se refresca igual vía proxy/middleware.
        }
      },
    },
  });
}
