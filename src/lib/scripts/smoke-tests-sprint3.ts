import fs from "node:fs";
import {
  getCurrentUser,
  getCurrentProfile,
  requireAuth,
  requirePremium,
  AuthRequiredError,
  PremiumRequiredError,
  type SessionAuthClient,
} from "@/lib/auth/session";
import { isSafeNextPath, safeNextPath } from "@/lib/auth/redirects";
import { toSafeAuthErrorMessage } from "@/lib/auth/errors";
import { buildLoginPayload, buildSignUpPayload } from "@/lib/auth/credentials";
import { setUserRole } from "@/lib/auth/admin";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, details?: string): void {
  if (condition) {
    console.log(`[PASS] ${name}`);
    passed++;
  } else {
    console.log(`[FAIL] ${name}${details ? ` - ${details}` : ""}`);
    failed++;
  }
}

function readRepoFile(path: string): string {
  return fs.readFileSync(
    `C:/Users/Dark/Desktop/sports-ai-platform-transfer/${path}`,
    "utf8",
  );
}

function fakeClient(user: { id: string; email?: string | null } | null, role?: unknown, authError?: unknown): SessionAuthClient {
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: authError ?? null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: role === undefined ? null : { role }, error: null }),
        }),
      }),
      upsert: async () => ({ error: null }),
    }),
  } as unknown as SessionAuthClient;
}

async function runTests(): Promise<void> {
  console.log("=== SMOKE TESTS — Sprint 3 (auth + roles) ===\n");

  const migration = readRepoFile("supabase/migrations/007_user_profiles_and_roles.sql");

  console.log("--- A/B. Registro y default free (contrato migration) ---");
  check("A: trigger fuerza role 'free' literal", /VALUES \(NEW\.id, 'free'\)/.test(migration));
  check("A2: payload de signup no tiene role", !("role" in buildSignUpPayload({ email: "a@b.com", password: "secreta1", confirm: "secreta1" })));
  check("B: DEFAULT free + CHECK free/premium", /DEFAULT 'free'/.test(migration) && /CHECK \(role IN \('free',\s*'premium'\)\)/.test(migration));

  console.log("\n--- C/D/F/G. Sesión con fakes ---");
  check("C: login válido → usuario", (await getCurrentUser(fakeClient({ id: "u1", email: "a@b.com" })))?.id === "u1");
  check("D: login inválido → null", (await getCurrentUser(fakeClient(null, undefined, { code: "invalid_credentials" }))) === null);
  check("F: sesión válida detectada", (await getCurrentUser(fakeClient({ id: "u1" }))) !== null);
  check("G: sesión ausente → null", (await getCurrentUser(fakeClient(null))) === null);

  console.log("\n--- E. Logout (contrato código) ---");
  const actionsSrc = readRepoFile("src/lib/auth/actions.ts");
  check("E: logout llama signOut y redirige a /", actionsSrc.includes("supabase.auth.signOut()") && actionsSrc.includes('redirect("/")'));

  console.log("\n--- H/I/J. Gating server-side ---");
  let hThrew = false;
  try {
    await requireAuth(fakeClient(null));
  } catch (err) {
    hThrew = err instanceof AuthRequiredError;
  }
  check("H: sin auth bloqueado en premium", hThrew);
  let iThrew = false;
  try {
    await requirePremium(fakeClient({ id: "u1" }, "free"));
  } catch (err) {
    iThrew = err instanceof PremiumRequiredError;
  }
  check("I: FREE bloqueado de premium", iThrew);
  const premium = await requirePremium(fakeClient({ id: "u1", email: "p@b.com" }, "premium"));
  check("J: PREMIUM permitido", premium.user.id === "u1" && premium.profile.role === "premium");

  console.log("\n--- K/L/M. Cliente no escala, RLS ---");
  let kThrew = false;
  try {
    await setUserRole("u1", "superadmin" as never);
  } catch (err) {
    kThrew = err instanceof Error && /role inválido/.test(err.message);
  }
  check("K: role inválido rechazado antes de env/red", kThrew);
  check("K2: sin policies INSERT/UPDATE/DELETE para authenticated", !/FOR (INSERT|UPDATE|DELETE)[\s\S]{0,120}TO authenticated/.test(migration));
  check("L: SELECT propio via auth.uid()=user_id", /USING \(auth\.uid\(\) = user_id\)/.test(migration));
  const seenEq: Array<{ column: string; value: unknown }> = [];
  let seenSelect: string | null = null;
  const capturing = fakeClient({ id: "u7" }, "free");
  const origFrom = capturing.from.bind(capturing);
  capturing.from = ((table: string) => {
    const origChain = origFrom(table);
    return {
      ...origChain,
      select: (columns?: string) => {
        seenSelect = columns ?? null;
        const eqChain = origChain.select(columns);
        return {
          ...eqChain,
          eq: (column: string, value: unknown) => {
            seenEq.push({ column, value });
            return eqChain.eq(column, value);
          },
        };
      },
    };
  }) as typeof capturing.from;
  await getCurrentProfile("u7", capturing);
  check("L2: profile se lee filtrado por user_id", seenEq.some((e) => e.column === "user_id" && e.value === "u7"));
  check("L3: select incluye columnas necesarias", seenSelect === "user_id, role");
  check("M: anon sin acceso (REVOKE + sin policy anon)", /REVOKE ALL ON TABLE profiles FROM anon, authenticated/.test(migration) && !/TO anon/.test(migration));

  console.log("\n--- M2. Contrato GRANT + RLS explícito ---");
  check("M2a: GRANT SELECT a authenticated (policies no bastan)", /GRANT SELECT ON TABLE profiles TO authenticated/.test(migration));
  check("M2b: service_role con acceso administrativo", /GRANT ALL ON TABLE profiles TO service_role/.test(migration));
  check("M2c: sin GRANT de escritura a authenticated/anon", !/GRANT\s+(ALL|INSERT|UPDATE|DELETE)[^\n]*TO (anon|authenticated)/.test(migration));
  check("M2d: definer no invocable directamente", /REVOKE ALL ON FUNCTION public\.handle_new_user\(\) FROM PUBLIC, anon, authenticated/.test(migration));
  check("M2e: trigger fuerza literal free (sin user_metadata)", /VALUES \(NEW\.id, 'free'\)/.test(migration) && !/raw_user_meta_data/.test(migration));
  check("M2f: definer con search_path fijo y schema-qualified", /SECURITY DEFINER SET search_path = public/.test(migration) && /INSERT INTO public\.profiles/.test(migration));

  console.log("\n--- N. Resolución de rol ---");
  check("N1: free resuelto", (await getCurrentProfile("u1", fakeClient({ id: "u1" }, "free")))?.role === "free");
  check("N2: premium resuelto", (await getCurrentProfile("u1", fakeClient({ id: "u1" }, "premium")))?.role === "premium");
  check("N3: role inválido en DB → null", (await getCurrentProfile("u1", fakeClient({ id: "u1" }, "admin"))) === null);

  console.log("\n--- O/P/Q. Redirects seguros ---");
  check("O: interno permitido", isSafeNextPath("/soccer/premium-test") && safeNextPath("/soccer/premium-test") === "/soccer/premium-test");
  check("O2: raíz permitida", isSafeNextPath("/"));
  check("P: absoluto rechazado", !isSafeNextPath("https://sitio-malicioso.com") && safeNextPath("https://sitio-malicioso.com") === "/");
  check("P2: protocol-relative rechazado", !isSafeNextPath("//sitio-malicioso.com"));
  check("Q: javascript:/data: rechazados", !isSafeNextPath("javascript:alert(1)") && !isSafeNextPath("data:text/html,x"));
  check("Q2: escapes y backslash rechazados", !isSafeNextPath("/%2Fevil") && !isSafeNextPath("/\\evil"));

  console.log("\n--- R/S/T. Bundle, errores, signup ---");
  const clientFiles = [
    "src/components/auth/auth-form.tsx",
    "src/components/auth/logout-button.tsx",
    "src/app/login/page.tsx",
    "src/app/register/page.tsx",
    "src/app/[sport]/premium-test/page.tsx",
  ].map(readRepoFile).join("\n");
  check("R: sin service_role en bundle cliente/rutas", !/service_role|SERVICE_ROLE_KEY|supabase\/server|auth\/admin/.test(clientFiles));
  const secretMsg = toSafeAuthErrorMessage({ code: "algo-nuevo", detail: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.firma-secreta" });
  check("S: errores no filtran secretos", !secretMsg.includes("eyJ") && !secretMsg.includes("firma-secreta"));
  check("S2: credenciales inválidas mapeadas", toSafeAuthErrorMessage({ code: "invalid_credentials" }) === "Email o contraseña incorrectos.");
  const signup = buildSignUpPayload({ email: "x@y.com", password: "secreta1", confirm: "secreta1" });
  check("T: register ignora role=premium del cliente", !("role" in signup) && signup.email === "x@y.com");
  let loginThrow = false;
  try {
    buildLoginPayload({ email: "no-email", password: "secreta1" });
  } catch {
    loginThrow = true;
  }
  check("T2: email inválido rechazado en builder", loginThrow);

  console.log("\n======================================================================");
  console.log(
    `RESULTADO FINAL SPRINT 3: ${failed === 0 ? "TODOS LOS TESTS PASARON ✅✅✅" : `${failed} FALLARON ❌`}`,
  );
  console.log(`Pasaron: ${passed}, Fallaron: ${failed}`);
  console.log("======================================================================");

  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
