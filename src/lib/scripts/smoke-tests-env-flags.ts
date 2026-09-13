/**
 * Tests de flags lazy (AX) — proceso DEDICADO (smoke:env-flags).
 *
 * Requiere caché de env pristine: la primera lectura exitosa fija los flags,
 * por lo que no puede compartir proceso con AU (que también necesita ser la
 * primera lectura). Proceso fresco + env ausente al importar el módulo.
 * 100% offline, sin red, sin writes, sin secretos reales.
 */

import { getFeatureFlag } from "@/lib/config/feature-flags";

// NOTA: NODE_ENV excluido (@types/node readonly; el schema aplica default).
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
  console.log("=== SMOKE TESTS — Env flags lazy (AX) ===\n");
  snapshot();

  try {
    // El import de arriba ocurrió con env ausente (tsx no autocarga .env.local).
    // Con el diseño viejo (const congelada al import), los flags quedarían en
    // defaults para siempre aunque luego aparezca env válido.
    clearEnv();
    check("AX0: sin env, flag en default seguro", getFeatureFlag("USE_LLM_MOCK") === false);

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://env-flags-test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "env-flags-fake-key";
    process.env.USE_LLM_MOCK = "true";
    check(
      "AX1: flag refleja env posterior al import (lazy, primera lectura exitosa)",
      getFeatureFlag("USE_LLM_MOCK") === true,
    );
    check(
      "AX2: lecturas repetidas consistentes con la config cacheada",
      getFeatureFlag("USE_LLM_MOCK") === true && getFeatureFlag("ENABLE_OFFLINE_MODE") === false,
    );
  } finally {
    restore();
  }

  console.log("\n======================================================================");
  console.log(
    `RESULTADO FINAL ENV-FLAGS: ${failed === 0 ? "TODOS LOS TESTS PASARON ✅✅✅" : `${failed} FALLARON ❌`}`,
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
