import "server-only";
import type { SportId } from "@/types/core/sport";
import type {
  ChatMessage,
  ChatOptions,
  MatchAnalysisResult,
  MatchPredictionResult,
  PlayerInsightResult,
} from "@/types/ai";
import {
  getLlmProvider,
  getCachedAiResult,
  setCachedAiResult,
  dedupeAiRequest,
} from "@/lib/ai/factory";
import {
  resolveProviderForFeature,
} from "@/lib/ai/ai-guard";
import {
  buildSoccerMatchAnalysisPrompt,
  buildSoccerMatchPredictionPrompt,
  buildSoccerPlayerReportPrompt,
} from "@/lib/ai/prompts/soccer-prompts";
import { getMatchById, getMatchesByTeamId } from "@/lib/db/repositories/matches-repo";
import { getTeamById, getTeamsByIds } from "@/lib/db/repositories/teams-repo";
import { getPlayersByIds, getPlayerById } from "@/lib/db/repositories/players-repo";
import {
  getStatsByMatchId,
} from "@/lib/db/repositories/player-stats-repo";
import { getCanonicalPredictionRow } from "@/lib/db/repositories/predictions-repo";
import { DEFAULT_MARKET_ID, DEFAULT_MODEL_VERSION_ID } from "@/lib/ai/prediction-service";
import { assertValidModelProbs } from "@/lib/ai/evaluation-service";
import {
  getTeamStandings,
  getPlayerSeasonRanking,
  getPlayerCareerStats,
} from "@/lib/services/statistics-service";
import type { PlayerMatchStats, Team } from "@/types/db/tables";

function hashCacheKey(parts: (string | number | boolean | undefined)[]): string {
  return parts
    .map((p) => {
      if (p === undefined || p === null) return "";
      return String(p);
    })
    .filter(Boolean)
    .join("|");
}

/**
 * Busca la predicción canónica persistida para un match.
 * Filtra explícitamente por market_id + model_version_id.
 * Valida probabilidades y xG antes de retornar.
 * Retorna null si no existe o si los datos son inválidos.
 */
async function getCanonicalPredictionForMatch(
  matchId: string,
): Promise<{
  probabilities: { home: number; draw: number; away: number };
  expectedGoals: { home: number; away: number } | null;
  modelVersion: string;
} | null> {
  const row = await getCanonicalPredictionRow(matchId, DEFAULT_MARKET_ID, DEFAULT_MODEL_VERSION_ID);
  if (!row) return null;

  // Validate probabilities using centralized validation.
  try {
    assertValidModelProbs(row.model_probabilities);
  } catch {
    console.warn(`[ai-service] canonical prediction for ${matchId} has invalid probabilities — returning null.`);
    return null;
  }
  const probs = row.model_probabilities as { home: number; draw: number; away: number };

  // Validate expected goals if present.
  const snapshot = row.data_snapshot as Record<string, unknown> | null;
  const xgObj = snapshot?.expectedGoals as Record<string, unknown> | undefined;
  let expectedGoals: { home: number; away: number } | null = null;
  if (xgObj) {
    const xgHome = typeof xgObj.home === "number" ? xgObj.home : null;
    const xgAway = typeof xgObj.away === "number" ? xgObj.away : null;
    if (
      xgHome !== null && xgAway !== null &&
      Number.isFinite(xgHome) && Number.isFinite(xgAway) &&
      xgHome >= 0 && xgAway >= 0
    ) {
      expectedGoals = { home: xgHome, away: xgAway };
    }
  }

  return {
    probabilities: { home: probs.home, draw: probs.draw, away: probs.away },
    expectedGoals,
    modelVersion: row.model_version_id,
  };
}

function safeJsonParse<T>(
  text: string | undefined | null,
  fallback: T,
): T {
  if (!text || typeof text !== "string") return fallback;
  try {
    const trimmed = text.trim();
    const startBrace = trimmed.indexOf("{");
    const endBrace = trimmed.lastIndexOf("}");
    if (startBrace >= 0 && endBrace > startBrace) {
      return JSON.parse(trimmed.slice(startBrace, endBrace + 1)) as T;
    }
    return JSON.parse(trimmed) as T;
  } catch {
    return fallback;
  }
}

/** TTL por tipo de feature AI (resultados basados en datos que cambian). */
const AI_FEATURE_TTL_MS: Record<string, number> = {
  analysis: 10 * 60_000,
  prediction: 5 * 60_000,
  player: 15 * 60_000,
};

function cacheActionOf(cacheKey: string): string {
  return cacheKey.split("|")[1] ?? "unknown";
}

// ============================================================================
// POLÍTICA DE ORDEN POR REQUEST AI (decidida explícitamente en fase 3):
//
//   A) RATE LIMIT   — en la Server Action, ANTES de cache/DB/generación
//   B) CACHE        — getCachedAiResult: cache hit ⇒ 0 llamadas al provider
//   C) DEDUPE       — dedupeAiRequest: N concurrentes idénticas ⇒ 1 generación
//   D) GENERACIÓN   — resolveProviderForFeature + provider.chat
//
// Por qué A va ANTES de B (el diseño elegido):
//  - Cache hit NO genera costo de OpenAI (objetivo 1).
//  - Pero un cache hit SÍ consume 1 token del rate limiter (objetivo 2):
//    nadie puede pedir la misma página en bucle infinito y generar carga
//    gratuita sin costo. Con los límites actuales (3/min, 20/hora) un
//    usuario normal jamás los roza.
// Los errores NUNCA quedan cacheados: si produce() lanza, la excepción
// propaga y no se escribe entrada.
// ============================================================================

/**
 * Cache + deduplicación concurrente. Primero cache (hit/miss), luego comparte
 * la misma promesa entre requests simultáneos con la misma key. Nunca cachea
 * errores: si produce() lanza, la excepción se propaga y no hay entrada.
 */
export async function runCachedAi<T>(
  cacheKey: string,
  produce: () => Promise<T>,
): Promise<T> {
  const action = cacheActionOf(cacheKey);
  const ttlMs =
    AI_FEATURE_TTL_MS[action] ?? (10 * 60_000);
  const cached = getCachedAiResult<T>(cacheKey);
  if (cached) {
    console.log(`[AI] cache action=${action} hit=true providerN/A`);
    return cached;
  }
  console.log(`[AI] cache action=${action} hit=false`);
  return dedupeAiRequest(cacheKey, async () => {
    const value = await produce();
    setCachedAiResult(cacheKey, value, ttlMs);
    return value;
  });
}

async function chatWithFallback(
  providerHint: "mock" | "openai" | undefined,
  feature: string,
  messages: ChatMessage[],
  options: ChatOptions,
): Promise<string> {
  const provider = resolveProviderForFeature(providerHint);
  console.log(`[AI] provider=${provider.id} feature=${feature}`);
  try {
    return await provider.chat(messages, options);
  } catch (error) {
    if (provider.id === "mock") throw error;
    // Nunca se presentan prompts ni respuestas en logs.
    console.warn(
      `[AI] feature=${feature} provider=${provider.id} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    if (process.env.NODE_ENV === "production") throw error;
    console.warn(`[AI] feature=${feature} falling back to mock (dev only)`);
    return getLlmProvider("mock").chat(messages, options);
  }
}
function collectGoalAssistRating(
  playerStats: PlayerMatchStats[],
): Record<
  string,
  { goals: number; assists: number; minutes: number; ratingSum: number; count: number }
> {
  const acc: Record<
    string,
    { goals: number; assists: number; minutes: number; ratingSum: number; count: number }
  > = {};
  for (const ps of playerStats) {
    const sp = (ps.sport_specific ?? {}) as Record<string, unknown>;
    const g = Number(sp.goals ?? 0) || 0;
    const a = Number(sp.assists ?? 0) || 0;
    const rt = Number(sp.rating);
    const prior = acc[ps.player_id] ?? {
      goals: 0,
      assists: 0,
      minutes: 0,
      ratingSum: 0,
      count: 0,
    };
    prior.goals += g;
    prior.assists += a;
    prior.minutes += ps.minutes_played;
    if (Number.isFinite(rt)) {
      prior.ratingSum += rt;
      prior.count++;
    }
    acc[ps.player_id] = prior;
  }
  return acc;
}

function recentFormOf(
  matches: {
    match_date: string;
    status: string;
    home_team_id: string;
    away_team_id: string;
    home_score?: number | null;
    away_score?: number | null;
  }[],
  teamId: string,
  n = 5,
): ("W" | "D" | "L")[] {
  const sorted = [...matches]
    .filter(
      (m) =>
        m.status === "finished" &&
        (m.home_team_id === teamId || m.away_team_id === teamId),
    )
    .sort((a, b) => (a.match_date < b.match_date ? 1 : -1));
  return sorted.slice(0, n).map((m) => {
    const isHome = m.home_team_id === teamId;
    const hs = m.home_score ?? 0;
    const as = m.away_score ?? 0;
    if (hs === as) return "D";
    const won = isHome ? hs > as : as > hs;
    return won ? "W" : "L";
  });
}

export async function generateMatchAnalysis(
  sportId: SportId,
  matchId: string,
  providerHint?: "mock" | "openai",
): Promise<MatchAnalysisResult> {
  const cacheKey = hashCacheKey([
    "ai",
    "analysis",
    sportId,
    matchId,
    providerHint ?? "auto",
  ]);
  return runCachedAi(cacheKey, async () => {
    const match = await getMatchById(matchId);
    if (!match) {
      const empty: MatchAnalysisResult = {
        matchId,
        summary: "Partido no encontrado.",
        keyInsights: [],
        narrative: "",
      };
      return empty;
    }

    const [home, away, statsForMatch] = await Promise.all([
      getTeamById(match.home_team_id),
      getTeamById(match.away_team_id),
      getStatsByMatchId(matchId),
    ]);
    if (!home || !away) {
      const empty: MatchAnalysisResult = {
        matchId,
        summary: "Datos de equipos incompletos para análisis.",
        keyInsights: [],
        narrative: "",
      };
      return empty;
    }

  const agg = collectGoalAssistRating(statsForMatch);
  const idsOrder = [...new Set(statsForMatch.map((s) => s.player_id))];
  const [allPlayers, homeMatches, awayMatches] = await Promise.all([
    getPlayersByIds(idsOrder),
    getMatchesByTeamId(home.id),
    getMatchesByTeamId(away.id),
  ]);
  const byId = new Map(allPlayers.filter(Boolean).map((p) => [p.id, p]));
  const buildPlayerList = (teamId: string) =>
    statsForMatch
      .filter((s) => s.team_id === teamId)
      .map((s) => {
        const player = byId.get(s.player_id);
        const a = agg[s.player_id] ?? {
          goals: 0,
          assists: 0,
          minutes: 0,
          ratingSum: 0,
          count: 0,
        };
        return {
          player:
            player ??
            ({
              id: s.player_id,
              full_name: s.player_id,
              position: "Unknown",
              team_id: s.team_id,
            } as ReturnType<typeof byId.get> extends infer R
              ? R extends NonNullable<R>
                ? R
                : never
              : never),
          goals: a.goals,
          assists: a.assists,
          minutes: s.minutes_played,
          rating: a.count > 0 ? a.ratingSum / a.count : 6.5,
        };
      })
      .sort((a, b) => b.minutes - a.minutes);

  const homePlayers = buildPlayerList(home.id);
  const awayPlayers = buildPlayerList(away.id);
  const hForm = recentFormOf(homeMatches, home.id, 5);
  const aForm = recentFormOf(awayMatches, away.id, 5);

  const { system, user } = buildSoccerMatchAnalysisPrompt({
    match,
    home,
    away,
    homePlayers,
    awayPlayers,
    recentHomeForm: hForm,
    recentAwayForm: aForm,
  });

  const text = await chatWithFallback(
    providerHint,
    "analysis",
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.3, maxTokens: 1500 },
  );
  const parsed = safeJsonParse<Partial<MatchAnalysisResult>>(text, {
    matchId,
    summary: "Sin análisis disponible.",
    keyInsights: [],
    narrative: "",
  });

  const result: MatchAnalysisResult = {
    matchId,
    summary: parsed.summary ?? "Sin resumen disponible.",
    keyInsights: Array.isArray(parsed.keyInsights) ? parsed.keyInsights : [],
    narrative: parsed.narrative ?? "",
  };
  return result;
  });
}

export type CanonicalLookupFn = (matchId: string) => Promise<{
  probabilities: { home: number; draw: number; away: number };
  expectedGoals: { home: number; away: number } | null;
  modelVersion: string;
} | null>;

export interface PredictMatchDeps {
  lookupCanonical?: CanonicalLookupFn;
}

export async function predictMatch(
  sportId: SportId,
  leagueId: string,
  seasonId: string,
  matchId: string,
  providerHint?: "mock" | "openai",
  deps?: PredictMatchDeps,
): Promise<MatchPredictionResult> {
  const cacheKey = hashCacheKey([
    "ai",
    "prediction",
    sportId,
    leagueId,
    seasonId,
    matchId,
    providerHint ?? "auto",
  ]);
  return runCachedAi(cacheKey, async () => {

  // ------------------------------------------------------------------
  // 1. Canonical prediction (persisted production model v1-dixon-coles-2026-01)
  // ------------------------------------------------------------------
  const lookup = deps?.lookupCanonical ?? getCanonicalPredictionForMatch;
  const canonical = await lookup(matchId);
  if (canonical) {
    const hp = Math.round(canonical.probabilities.home * 100);
    const dp = Math.round(canonical.probabilities.draw * 100);
    const ap = 100 - hp - dp;
    const xgHome = canonical.expectedGoals?.home ?? 0;
    const xgAway = canonical.expectedGoals?.away ?? 0;
    return {
      matchId,
      canonical: true,
      predictedHomeScore: Math.round(xgHome),
      predictedAwayScore: Math.round(xgAway),
      homeWinProbability: hp,
      drawProbability: dp,
      awayWinProbability: Math.max(0, ap),
      explanation: `Pronóstico del modelo ${canonical.modelVersion} (experimental).`,
      expectedGoals: canonical.expectedGoals ?? undefined,
      modelVersion: canonical.modelVersion,
    };
  }

  // ------------------------------------------------------------------
  // 2. No canonical prediction → unavailable (NO fabricar 33/34/33)
  // ------------------------------------------------------------------
  return {
    matchId,
    canonical: false,
    reason: "not_available",
  };
  });
}

export async function generatePlayerReport(
  sportId: SportId,
  leagueId: string,
  seasonId: string,
  playerId: string,
  providerHint?: "mock" | "openai",
): Promise<PlayerInsightResult> {
  const cacheKey = hashCacheKey([
    "ai",
    "player",
    sportId,
    leagueId,
    seasonId,
    playerId,
    providerHint ?? "auto",
  ]);
  return runCachedAi(cacheKey, async () => {
  const [player, seasonRanking, career] = await Promise.all([
    getPlayerById(playerId),
    getPlayerSeasonRanking(sportId, leagueId, seasonId),
    getPlayerCareerStats(sportId, playerId),
  ]);

  const agg = seasonRanking.find((r) => r.playerId === playerId) ?? {
    matchesPlayed: career.matchesPlayed,
    totalMinutes: career.totalMinutes,
    goals: career.goals,
    assists: career.assists,
    yellowCards: career.yellowCards,
    redCards: career.redCards,
    avgPassAccuracyPct: 75,
  };

  const team: Team = player
    ? (await getTeamById(player.team_id)) ?? {
        id: player.team_id,
        name: "Equipo",
        short_name: "EQ",
        league_id: leagueId,
        sport_id: sportId,
        created_at: "",
        updated_at: "",
        sport_specific: {},
      }
    : ({
        id: "unknown",
        name: "Equipo",
        short_name: "EQ",
        league_id: leagueId,
        sport_id: sportId,
        created_at: "",
        updated_at: "",
        sport_specific: {},
      });

  const p = player ?? {
    id: playerId,
    team_id: team.id,
    full_name: "Jugador",
    position: "Unknown",
    sport_id: sportId,
    created_at: "",
    updated_at: "",
    sport_specific: {},
  };

  const perMatch = career.matches.map((m) => ({
    date: m.matchDate,
    opponent: m.opponent,
    minutes: m.minutes,
    goals: m.goals,
    assists: m.assists,
    rating: career.ratingAvg > 0 ? career.ratingAvg + ((m.goals + m.assists) * 0.2) : 6.5,
  }));

  const { system, user } = buildSoccerPlayerReportPrompt({
    player: p,
    team,
    seasonAgg: {
      matchesPlayed: agg.matchesPlayed,
      totalMinutes: agg.totalMinutes,
      goals: agg.goals,
      assists: agg.assists,
      yellowCards: agg.yellowCards,
      redCards: agg.redCards,
      avgPassAccuracyPct: agg.avgPassAccuracyPct ?? 75,
    },
    perMatch,
  });

  const text = await chatWithFallback(
    providerHint,
    "player",
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.3, maxTokens: 1000 },
  );
  const parsed = safeJsonParse<Partial<PlayerInsightResult>>(text, {
    playerId,
    strengths: [],
    weaknesses: [],
    performanceSummary: "",
    outlook: "",
  });

  const result: PlayerInsightResult = {
    playerId,
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
    weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
    performanceSummary:
      parsed.performanceSummary ??
      `Temporada: ${agg.matchesPlayed} partidos, ${agg.goals}G ${agg.assists}A.`,
    outlook: parsed.outlook ?? "Mantener regularidad.",
  };
  return result;
  });
}
