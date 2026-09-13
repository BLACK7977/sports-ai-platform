process.env.ENABLE_OFFLINE_MODE = "true";
process.env.USE_LLM_MOCK = "false";
process.env.NEXT_PUBLIC_SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.OPENAI_API_KEY = "";

import {
  checkAiRateLimit,
  getClientIp,
  resetRateLimiter,
  AiRateLimitExceededError,
  AI_RATE_LIMITS,
} from "@/lib/ai/rate-limiter";
import {
  resetAiCache,
  resetInFlight,
  getCachedAiResult,
  setCachedAiResult,
  dedupeAiRequest,
} from "@/lib/ai/factory";
import {
  resolveProviderForFeature,
  AiFeatureUnavailableError,
} from "@/lib/ai/ai-guard";
import { runCachedAi } from "@/lib/services/ai-service";

let okAll = true;
function check(name: string, cond: boolean, detail?: string) {
  const ok = !!cond;
  if (!ok) okAll = false;
  console.log(`[${name}] ${ok ? "PASS ✅" : "FAIL ❌"} ${detail ?? ""}`);
  return ok;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function isRateBlocked(fn: () => void): Promise<boolean> {
  try {
    fn();
    return false;
  } catch (err) {
    return err instanceof AiRateLimitExceededError;
  }
}

async function retryOf(fn: () => void): Promise<number | null> {
  try {
    fn();
    return null;
  } catch (err) {
    if (err instanceof AiRateLimitExceededError) {
      return err.retryAfterSeconds;
    }
    throw err;
  }
}

async function main() {
  console.log("=".repeat(70));
  console.log("  SMOKE TESTS — Bloque 5 (rate limit 2 ventanas + cache + dedup + policy)");
  console.log("=".repeat(70));

  // ====== 1. Límite por MINUTO (ventana corta) ======
  console.log("\n--- 1. Límites por minuto (3 / 3 / 2) ---");
  resetRateLimiter();

  const minuteLimits = {
    "match-analysis": AI_RATE_LIMITS["match-analysis"].minute.max,
    "match-prediction": AI_RATE_LIMITS["match-prediction"].minute.max,
    "player-report": AI_RATE_LIMITS["player-report"].minute.max,
  } as const;

  check(
    "1a límites configurados = analysis 3 / prediction 3 / report 2",
    minuteLimits["match-analysis"] === 3 &&
      minuteLimits["match-prediction"] === 3 &&
      minuteLimits["player-report"] === 2,
    JSON.stringify(minuteLimits),
  );

  // analysis: 3 ok, 4ª bloqueada
  let analysisRetry = 0;
  for (let i = 0; i < 3; i++) checkAiRateLimit("match-analysis", "ip-min-a", i * 1000);
  check("1b analysis: 3 requests en el minuto permitidos", true);
  analysisRetry = (await retryOf(() =>
    checkAiRateLimit("match-analysis", "ip-min-a", 4000),
  )) ?? -1;
  check("1c analysis: 4º del mismo minuto bloqueado", analysisRetry > 0, `retryAfter=${analysisRetry}s`);

  // prediction: 3 ok, 4ª bloqueada
  for (let i = 0; i < 3; i++) {
    checkAiRateLimit("match-prediction", "ip-min-p", i * 1000);
  }
  check("1d prediction: 3 requests en el minuto permitidos", true);
  check(
    "1e prediction: 4º del mismo minuto bloqueado",
    await isRateBlocked(() => checkAiRateLimit("match-prediction", "ip-min-p", 4000)),
  );

  // player-report: 2 ok, 3ª bloqueada
  for (let i = 0; i < 2; i++) {
    checkAiRateLimit("player-report", "ip-min-r", i * 1000);
  }
  check("1f player-report: 2 requests en el minuto permitidos", true);
  check(
    "1g player-report: 3º del mismo minuto bloqueado",
    await isRateBlocked(() => checkAiRateLimit("player-report", "ip-min-r", 3000)),
  );

  // ====== 2. Límite por HORA (ventana larga) ======
  console.log("\n--- 2. Límites por hora (20 / 20 / 10) ---");
  resetRateLimiter();
  const hourLimits = {
    analysis: AI_RATE_LIMITS["match-analysis"].hour.max,
    prediction: AI_RATE_LIMITS["match-prediction"].hour.max,
    report: AI_RATE_LIMITS["player-report"].hour.max,
  } as const;
  check(
    "2a cuotas hora = analysis 20 / prediction 20 / report 10",
    hourLimits.analysis === 20 && hourLimits.prediction === 20 && hourLimits.report === 10,
    JSON.stringify(hourLimits),
  );

  // analysis: 20 en la hora (espaciados 60s → el minuto SIEMPRE se resetea)
  for (let i = 0; i < hourLimits.analysis; i++) {
    checkAiRateLimit("match-analysis", "ip-hour-a", i * 60_000);
  }
  check("2b analysis: 20 requests en la hora permitidos", true);
  const hourBlockedAt = await retryOf(() =>
    checkAiRateLimit("match-analysis", "ip-hour-a", hourLimits.analysis * 60_000),
  );
  check(
    "2c analysis: 21º en la misma hora bloqueado por ventana HORA",
    hourBlockedAt !== null && hourBlockedAt > 0,
    `retryAfter=${hourBlockedAt ?? 0}s`,
  );

  // player-report: 10 en la hora, 11ª bloqueada
  resetRateLimiter();
  for (let i = 0; i < hourLimits.report; i++) {
    checkAiRateLimit("player-report", "ip-hour-r", i * 60_000);
  }
  check("2d player-report: 10 requests en la hora permitidos", true);
  check(
    "2e player-report: 11º en la misma hora bloqueado",
    await isRateBlocked(() =>
      checkAiRateLimit("player-report", "ip-hour-r", hourLimits.report * 60_000),
    ),
  );

  // ====== 3. Reset de ventana ======
  console.log("\n--- 3. Reset de ventanas ---");
  resetRateLimiter();
  for (let i = 0; i < 3; i++) checkAiRateLimit("match-analysis", "ip-reset-m", i * 1000);
  check(
    "3a tras ventana de minuto (60s) se permite de nuevo",
    !(await isRateBlocked(() => checkAiRateLimit("match-analysis", "ip-reset-m", 61_000))),
  );

  resetRateLimiter();
  for (let i = 0; i < hourLimits.analysis; i++) {
    checkAiRateLimit("match-analysis", "ip-reset-h", i * 60_000);
  }
  check(
    "3b ventana de HORA agotada durante la hora",
    await isRateBlocked(() =>
      checkAiRateLimit("match-analysis", "ip-reset-h", hourLimits.analysis * 60_000),
    ),
  );
  check(
    "3c tras 3600s= ventana de hora nueva → permite",
    !(await isRateBlocked(() =>
      checkAiRateLimit("match-analysis", "ip-reset-h", 3_600_001),
    )),
  );

  // ====== 4. Acciones independientes ======
  console.log("\n--- 4. Acciones independientes ---");
  resetRateLimiter();
  for (let i = 0; i < 3; i++) checkAiRateLimit("match-analysis", "ip-acts", i * 1000);
  check(
    "4a 1ª prediction del mismo cliente NO bloqueada (contador separado)",
    !(await isRateBlocked(() => checkAiRateLimit("match-prediction", "ip-acts", 1))),
  );
  check(
    "4b analysis sigue bloqueado para el mismo cliente",
    await isRateBlocked(() => checkAiRateLimit("match-analysis", "ip-acts", 5000)),
  );

  // ====== 5. IPs / clientes independientes ======
  console.log("\n--- 5. Clientes independientes ---");
  resetRateLimiter();
  for (let i = 0; i < 3; i++) checkAiRateLimit("match-analysis", "ip-one", i * 1000);
  check(
    "5a cliente2 no comparte el límite de cliente1 (1ª llamada permitida)",
    !(await isRateBlocked(() => checkAiRateLimit("match-analysis", "ip-two", 1))),
  );
  check(
    "5b cliente1 bloqueado en su 4ª llamada del minuto",
    await isRateBlocked(() => checkAiRateLimit("match-analysis", "ip-one", 5000)),
  );

  // ====== 6. 30 concurrentes idénticos → 1 generación, 3 tokens, 27 bloqueados ======
  console.log("\n--- 6. Concurrencia: rate limit + dedup ---");
  resetRateLimiter();
  resetInFlight();
  let genCalls = 0;
  const produce = async () => {
    await sleep(15);
    genCalls++;
    return { ok: true as const };
  };
  const outcomes = await Promise.all(
    Array.from({ length: 30 }, () =>
      (async () => {
        try {
          checkAiRateLimit("match-analysis", "ip-30");
          await runCachedAi("conc|analysis|m30", produce);
          return "ok" as const;
        } catch {
          return "blocked" as const;
        }
      })(),
    ),
  );
  const admitted = outcomes.filter((o) => o === "ok").length;
  const blocked = outcomes.length - admitted;
  check("6a 30 concurrentes → 1 sola generación", genCalls === 1, `genCalls=${genCalls}`);
  check(
    "6b solo 3 admitidos por el rate limit (minuto max=3)",
    admitted === 3 && blocked === 27,
    `admitted=${admitted} blocked=${blocked}`,
  );
  check(
    "6c los 30 NO saltan el rate limit (4º+ bloqueados)",
    blocked === 27,
  );
  check(
    "6d tras los 30, un request nuevo del cliente también se bloquea",
    await isRateBlocked(() => checkAiRateLimit("match-analysis", "ip-30")),
  );

  // dedup puro (sin rate limit): N concurrentes → 1 generación
  resetInFlight();
  let rawCalls = 0;
  const rawProduce = async () => {
    await sleep(15);
    rawCalls++;
    return "ok";
  };
  const rawOutcomes = await Promise.all(
    Array.from({ length: 30 }, () => dedupeAiRequest("raw|dedup|k", rawProduce)),
  );
  check(
    "6e dedup crudo: 30 concurrentes → 1 generación",
    rawCalls === 1 && rawOutcomes.every((r) => r === "ok"),
    `rawCalls=${rawCalls}`,
  );

  // ====== 7. Errores NO quedan cacheados ======
  console.log("\n--- 7. Errores no cacheados ---");
  resetAiCache();
  let errCalls = 0;
  const flakyProduce = async () => {
    errCalls++;
    if (errCalls === 1) throw new Error("boom");
    return { ok: true as const };
  };
  let firstThrew = false;
  try {
    await runCachedAi("err|analysis|m2", flakyProduce);
  } catch {
    firstThrew = true;
  }
  const notCachedAfterError = getCachedAiResult("err|analysis|m2") === undefined;
  const recovered = await runCachedAi("err|analysis|m2", flakyProduce);
  check("7a 1ª llamada que lanza propaga el error", firstThrew);
  check("7b tras el error la entrada NO queda cacheadada", notCachedAfterError);
  check(
    "7c la siguiente llamada vuelve a producir (y funciona)",
    recovered.ok === true && errCalls === 2,
    `errCalls=${errCalls}`,
  );

  // ====== 8. Cache hit NO llama al provider ======
  console.log("\n--- 8. Cache hit no llama al provider ---");
  resetAiCache();
  let providerCalls = 0;
  const genOnce = async () => {
    providerCalls++;
    await sleep(5);
    return { v: 1 };
  };
  const first = await runCachedAi("ch|analysis|m1", genOnce);
  const second = await runCachedAi("ch|analysis|m1", genOnce);
  check(
    "8a cache hit devuelve el mismo valor sin llamar al provider",
    first.v === 1 && second.v === 1 && providerCalls === 1,
    `providerCalls=${providerCalls}`,
  );

  // TTL directo (factory)
  resetAiCache();
  setCachedAiResult("ttl|analysis|k", 42, 200);
  check("8b hit antes del TTL", getCachedAiResult<number>("ttl|analysis|k") === 42);
  await sleep(250);
  check("8c expira tras el TTL", getCachedAiResult<number>("ttl|analysis|k") === undefined);

  // ====== 9. getClientIp (orden + rightmost + fallbacks) ======
  console.log("\n--- 9. getClientIp ---");
  const h1 = new Headers();
  h1.set("x-forwarded-for", "1.2.3.4, 10.0.0.5");
  check("9a usa el valor MÁS A LA DERECHA (proxy cercano)", getClientIp(h1) === "10.0.0.5", getClientIp(h1));
  const h2 = new Headers();
  h2.set("x-forwarded-for", "20.1.1.1");
  h2.set("x-vercel-forwarded-for", "9.9.9.9");
  check(
    "9b en Vercel prefiere x-vercel-forwarded-for sobre x-forwarded-for",
    getClientIp(h2) === "9.9.9.9",
    getClientIp(h2),
  );
  const h3 = new Headers();
  check("9c sin headers → 'local' (localhost/dev)", getClientIp(h3) === "local");
  const h4 = new Headers();
  h4.set("x-forwarded-for", "\u0059".repeat(500));
  check("9d valor gigante acotado (≤64)", getClientIp(h4).length <= 64, `len=${getClientIp(h4).length}`);

  // ====== 10. Política de provider (dev/prod, sin OPENAI_API_KEY) ======
  console.log("\n--- 10. Política provider ---");
  const devAuto = resolveProviderForFeature();
  check("10a dev sin key → mock", devAuto.id === "mock", `id=${devAuto.id}`);
  check("10b hint mock siempre mock", resolveProviderForFeature("mock").id === "mock");
  let openaiThrew = false;
  try {
    resolveProviderForFeature("openai");
  } catch (err) {
    openaiThrew = err instanceof AiFeatureUnavailableError;
  }
  check("10c hint openai sin key → AiFeatureUnavailableError", openaiThrew);

  const envVar = process.env as { NODE_ENV?: string };
  const savedNodeEnv = envVar.NODE_ENV;
  envVar.NODE_ENV = "production";
  try {
    check("10d prod + mock explícito → mock", resolveProviderForFeature("mock").id === "mock");
    let prodAutoThrew = false;
    try {
      resolveProviderForFeature();
    } catch (err) {
      prodAutoThrew = err instanceof AiFeatureUnavailableError;
    }
    check(
      "10e prod sin key → NO mock silencioso (AiFeatureUnavailableError)",
      prodAutoThrew,
    );
  } finally {
    envVar.NODE_ENV = savedNodeEnv;
  }

  console.log("-".repeat(70));
  console.log(
    okAll
      ? "RESULTADO FINAL BLOQUE 5: TODOS LOS TESTS PASARON ✅✅✅"
      : "RESULTADO FINAL BLOQUE 5: ALGUNOS TESTS FALLARON ❌",
  );
  console.log("=".repeat(70));
  if (!okAll) process.exit(1);
}

main().catch((e) => {
  console.error("ERROR en smoke tests bloque 5:", e);
  process.exit(1);
});