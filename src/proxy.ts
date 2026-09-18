import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refresh de sesión Supabase en cada request (Next 16: proxy.ts).
 * Sin esto, las sesiones expiran y el server las ve como ausentes.
 * No redirige ni bloquea: solo sincroniza cookies. El gating real vive en
 * cada ruta server-side (requireAuth/requirePremium).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/?rest\/v1\/?$/, "").replace(/\/$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;
  const isProd = process.env.NODE_ENV === "production";
  const supabase = createServerClient(url, anonKey, {
    cookieOptions: {
      sameSite: "lax",
      httpOnly: true,
      secure: isProd,
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
