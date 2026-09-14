process.env.ENABLE_OFFLINE_MODE = "true";
process.env.USE_LLM_MOCK = "true";
process.env.NEXT_PUBLIC_SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.OPENAI_API_KEY = "";

import { ensureDbReady } from "@/lib/db/client";
import {
  generateMatchAnalysis,
  predictMatch,
  generatePlayerReport,
} from "@/lib/services/ai-service";
import { getMatchesByLeagueSeason } from "@/lib/db/repositories/matches-repo";
import { getTeamsByLeagueId } from "@/lib/db/repositories/teams-repo";
import {
  getAiCacheStats,
  resetAiCache,
  getLlmProvider,
} from "@/lib/ai/factory";

const SPORT_ID = "soccer";
const LEAGUE1_ID = "demo-liga-1";
const SEASON1_ID = "season-2026-1";

let okAll = true;
function check(name: string, cond: boolean, detail?: string) {
  const ok = !!cond;
  if (!ok) okAll = false;
  console.log(`[${name}] ${ok ? "PASS ✅" : "FAIL ❌"} ${detail ?? ""}`);
  return ok;
}

async function main() {
  console.log("=".repeat(70));
  console.log("  SMOKE TESTS — Bloque 4 (LLM providers + AI services + cache)");
  console.log("=".repeat(70));

  const db = await ensureDbReady();
  console.log("[DB] offline =", db.isOffline());

  resetAiCache();

  // ====== 4.2 Provider mock check ======
  const provider = getLlmProvider();
  console.log(`[Provider] id=${provider.id}, name=${provider.name}`);
  check("4.2a mock provider selected", provider.id === "mock", `id=${provider.id}`);

  const echo = await provider.chat([
    { role: "system", content: "ok" },
    { role: "user", content: "ping" },
  ]);
  check("4.2b provider.chat() retorna string", typeof echo === "string" && echo.length > 0);

  // ====== Setup data local ======
  const [liga1, teams, allMatches] = await Promise.all([
    getMatchesByLeagueSeason(LEAGUE1_ID, SEASON1_ID),
    getTeamsByLeagueId(LEAGUE1_ID),
    getMatchesByLeagueSeason(LEAGUE1_ID, SEASON1_ID),
  ]);
  void allMatches;
  const finishedLiga1 = liga1.filter((m) => m.status === "finished");
  const scheduledMatch = liga1.find((m) => m.status === "scheduled") ?? finishedLiga1[0];
  const matchId = finishedLiga1[finishedLiga1.length - 1]?.id ?? "m-l1-10";
  const playerId = teams[0]?.id
    ? `p-${teams[0].id}-1`
    : "p-aguilas-fc-1";
  console.log(
    `Data: liga1 finished=${finishedLiga1.length}, matchId=${matchId}, playerId=${playerId}`,
  );

  // ====== 4.6a generateMatchAnalysis ======
  console.log("\n--- 4.6a generateMatchAnalysis (MockProvider, 1ª llamada: cache MISS) ---");
  const analysis = await generateMatchAnalysis(SPORT_ID, matchId, "mock");
  console.log(
    `analysis: matchId=${analysis.matchId} summaryLen=${analysis.summary.length} insights=${analysis.keyInsights.length} narrativeLen=${analysis.narrative.length}`,
  );
  check("4.6a matchId", analysis.matchId === matchId, `got ${analysis.matchId}`);
  check("4.6b summary not empty", analysis.summary.length > 0);
  check("4.6c keyInsights array len>0", Array.isArray(analysis.keyInsights) && analysis.keyInsights.length > 0);
  check("4.6d narrative not empty", analysis.narrative.length > 0);

  // ====== 4.4 AI cache HIT ======
  const cacheAfterOne = getAiCacheStats();
  console.log(`[Cache after analysis 1] misses=${cacheAfterOne.misses} hits=${cacheAfterOne.hits} size=${cacheAfterOne.size}`);
  check(
    "4.4a cache miss primera llamada",
    cacheAfterOne.misses >= 1,
    `misses=${cacheAfterOne.misses}`,
  );

  const analysis2 = await generateMatchAnalysis(SPORT_ID, matchId, "mock");
  const cacheAfterTwo = getAiCacheStats();
  console.log(`[Cache after analysis 2] misses=${cacheAfterTwo.misses} hits=${cacheAfterTwo.hits}`);
  check(
    "4.4b cache HIT segunda llamada (sin cambiar provider)",
    cacheAfterTwo.hits >= 1,
    `hits=${cacheAfterTwo.hits}`,
  );
  check(
    "4.4c cache idempotente (mismo contenido)",
    analysis.summary === analysis2.summary &&
      analysis.keyInsights.length === analysis2.keyInsights.length,
  );

  // ====== 4.6b predictMatch ======
  console.log("\n--- 4.6b predictMatch ---");
  const pred = await predictMatch(
    SPORT_ID,
    LEAGUE1_ID,
    SEASON1_ID,
    scheduledMatch.id,
    "mock",
  );
  check("4.6d predict matchId", pred.matchId === scheduledMatch.id, `got ${pred.matchId}`);
  if (pred.canonical) {
    console.log(
      `pred: ${pred.predictedHomeScore}-${pred.predictedAwayScore} probs=${pred.homeWinProbability}/${pred.drawProbability}/${pred.awayWinProbability} expLen=${pred.explanation.length}`,
    );
    check(
      "4.6e probabilidades suman 100 (±2 por redondeo)",
      Math.abs(
        pred.homeWinProbability + pred.drawProbability + pred.awayWinProbability - 100,
      ) <= 2,
      `suma=${pred.homeWinProbability + pred.drawProbability + pred.awayWinProbability}`,
    );
    check(
      "4.6f probabilidades clamp (0-100)",
      pred.homeWinProbability >= 0 &&
        pred.homeWinProbability <= 100 &&
        pred.drawProbability >= 0 &&
        pred.drawProbability <= 100 &&
        pred.awayWinProbability >= 0 &&
        pred.awayWinProbability <= 100,
    );
    check("4.6g explanation no vacía", pred.explanation.length > 0);
  } else {
    console.log(`pred: canonical=false reason=${pred.reason} (no canonical prediction for offline match)`);
    check("4.6e no-cánónica → reason not_available", pred.reason === "not_available");
  }

  // ====== 4.6c generatePlayerReport ======
  console.log("\n--- 4.6c generatePlayerReport ---");
  const report = await generatePlayerReport(
    SPORT_ID,
    LEAGUE1_ID,
    SEASON1_ID,
    playerId,
    "mock",
  );
  console.log(
    `report: playerId=${report.playerId} strengths=${report.strengths.length} weaknesses=${report.weaknesses.length} summaryLen=${report.performanceSummary.length} outlookLen=${report.outlook.length}`,
  );
  check("4.6h report playerId", report.playerId === playerId, `got ${report.playerId}`);
  check(
    "4.6i strengths array no vacío",
    Array.isArray(report.strengths) && report.strengths.length > 0,
  );
  check(
    "4.6j weaknesses array no vacío",
    Array.isArray(report.weaknesses) && report.weaknesses.length > 0,
  );
  check("4.6k performance summary + outlook", report.performanceSummary.length > 0 && report.outlook.length > 0);

  // ====== 4.4 Factory fallback ======
  console.log("\n--- 4.4 Factory fallback (force mock) ---");
  const forced = getLlmProvider("mock");
  check("4.4d force mock retorna MockProvider", forced.id === "mock");

  console.log("\n[Cache final]", getAiCacheStats());

  console.log("-".repeat(70));
  console.log(
    okAll
      ? "RESULTADO FINAL BLOQUE 4: TODOS LOS TESTS PASARON ✅✅✅"
      : "RESULTADO FINAL BLOQUE 4: ALGUNOS TESTS FALLARON ❌",
  );
  console.log("=".repeat(70));
  if (!okAll) process.exit(1);
}

main().catch((e) => {
  console.error("ERROR en smoke tests bloque 4:", e);
  process.exit(1);
});
