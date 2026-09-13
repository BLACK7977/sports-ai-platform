/**
 * Tests de inicialización de env/config (AU-AX).
 *
 * Proceso DEDICADO (smoke:env): AU fija un éxito con valores sintéticos en la
 * caché de env.ts y muta process.env; aislarlo evita interferir con otros
 * suites. 100% offline, sin red, sin writes, sin secretos reales.
 */

import { getEnv, hasSupabase } from "@/lib/config/env";

// NOTA: NODE_ENV se excluye a propósito (@types/node lo declara readonly y el
// schema le aplica default "development" si falta; no necesitamos mutarlo).
const KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "ENABLE_OFFLINE_MODE",
  "USE_LLM_MOCK",
  "SPORTMONKS_API_TOKEN",
  "SPORTMONKS_BASE_URL",
] as const;

const saved = new Map<string, string | undefined>();

function snapshot(): void {
  saved.clear();
  for (const k of KEYS) saved.set(k, process.env[k]);
}

function restore(): void {
  for (const k of KEYS) {
    const v = saved.get(k);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function clearEnv(): void {
  for (const k of KEYS) delete process.env[k];
}

function setFakeValidEnv(): void {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://env-init-test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "env-init-fake-service-key";
}

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

async function runTests(): Promise<void> {
  console.log("=== SMOKE TESTS — Env init (AU-AX) ===\n");
  snapshot();

  try {
    // AW primero: necesita un fallo REAL (antes de que cualquier éxito se cachee).
    console.log("--- AW. Errores sin secretos ---");
    clearEnv();
    const secretMarker = "ruleta-secreta-aw-12345";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "not-a-valid-url";
    process.env.SUPABASE_SERVICE_ROLE_KEY = `clave-${secretMarker}`;
    let message = "";
    try {
      getEnv();
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    check("AW1: env inválido lanza error", message.length > 0);
    check("AW2: el mensaje NO contiene el valor secreto", !message.includes(secretMarker), message.slice(0, 200));
    check("AW3: el mensaje NO contiene la URL inválida", !message.includes("not-a-valid-url"));

    console.log("\n--- AU. Fallo inicial no contamina; recuperación posterior ---");
    clearEnv();
    check("AU1: sin env, Supabase no detectado", hasSupabase() === false);
    let threw = false;
    try {
      getEnv();
    } catch {
      threw = true;
    }
    check("AU2: sin env, getEnv() lanza", threw);
    // El fallo anterior NO debe quedar cacheado: al aparecer env válido, recupera.
    setFakeValidEnv();
    check("AU3: con env válido posterior, Supabase detectado", hasSupabase() === true);
    check("AU4: getEnv() recupera valores", getEnv().SUPABASE_SERVICE_ROLE_KEY === "env-init-fake-service-key");

    console.log("\n--- AV. Config válida reutilizable ---");
    const first = getEnv();
    const second = getEnv();
    check("AV1: misma instancia cacheada", first === second);
    check("AV2: valores correctos", second.NEXT_PUBLIC_SUPABASE_URL === "https://env-init-test.supabase.co");
  } finally {
    restore();
  }

  restore();

  console.log("\n======================================================================");
  console.log(
    `RESULTADO FINAL ENV-INIT: ${failed === 0 ? "TODOS LOS TESTS PASARON ✅✅✅" : `${failed} FALLARON ❌`}`,
  );
  console.log(`Pasaron: ${passed}, Fallaron: ${failed}`);
  console.log("======================================================================");

  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  try {
    restore();
  } catch {
    /* noop */
  }
  process.exit(1);
});
