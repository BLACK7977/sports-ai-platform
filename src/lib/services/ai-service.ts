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
} from "@/lib/ai/factory";
import {
  buildSoccerMatchAnalysisPrompt,
  buildSoccerMatchPredictionPrompt,
  buildSoccerPlayerReportPrompt,
} from "@/lib/ai/prompts/soccer-prompts";
import { getMatchById, getMatchesByTeamId } from "@/lib/db/repositories/matches-repo";
import { getTeamById } from "@/lib/db/repositories/teams-repo";
import { getPlayerById } from "@/lib/db/repositories/players-repo";
import {
  getStatsByMatchId,
} from "@/lib/db/repositories/player-stats-repo";
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

async function chatWithFallback(
  providerHint: "mock" | "openai" | undefined,
  messages: ChatMessage[],
  options: ChatOptions,
): Promise<string> {
  const provider = getLlmProvider(providerHint);
  try {
    return await provider.chat(messages, options);
  } catch (error) {
    if (provider.id === "mock") throw error;
    console.warn(
      `[AI] ${provider.name} failed; falling back to Mock LLM: ${error instanceof Error ? error.message : String(error)}`,
    );
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
    home_score?: number;
    away_score?: number;
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
  const cacheKey = hashCacheKey(["ai", "analysis", sportId, matchId]);
  const cached = getCachedAiResult<MatchAnalysisResult>(cacheKey);
  if (cached) return cached;

  const match = await getMatchById(matchId);
  if (!match) {
    const empty: MatchAnalysisResult = {
      matchId,
      summary: "Partido no encontrado.",
      keyInsights: [],
      narrative: "",
    };
    return setCachedAiResult(cacheKey, empty);
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
    return setCachedAiResult(cacheKey, empty);
  }

  const agg = collectGoalAssistRating(statsForMatch);
  const idsOrder = [...new Set(statsForMatch.map((s) => s.player_id))];
  const [allPlayers, homeMatches, awayMatches] = await Promise.all([
    Promise.all(idsOrder.map((id) => getPlayerById(id))),
    getMatchesByTeamId(home.id),
    getMatchesByTeamId(away.id),
  ]);
  const byId = new Map(allPlayers.filter(Boolean).map((p) => [p!.id, p!]));
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
  return setCachedAiResult(cacheKey, result);
}

export async function predictMatch(
  sportId: SportId,
  leagueId: string,
  seasonId: string,
  matchId: string,
  providerHint?: "mock" | "openai",
): Promise<MatchPredictionResult> {
  const cacheKey = hashCacheKey([
    "ai",
    "prediction",
    sportId,
    leagueId,
    seasonId,
    matchId,
  ]);
  const cached = getCachedAiResult<MatchPredictionResult>(cacheKey);
  if (cached) return cached;

  const rawMatch = await getMatchById(matchId);
  const standings = await getTeamStandings(sportId, leagueId, seasonId);

  const match = rawMatch ?? {
    id: matchId,
    home_team_id: "",
    away_team_id: "",
    match_date: new Date().toISOString(),
    status: "scheduled",
  };

  const [home, away] = await Promise.all([
    getTeamById(match.home_team_id),
    getTeamById(match.away_team_id),
  ]);

  const h2h: Array<{
    date: string;
    homeName: string;
    awayName: string;
    hs: number;
    as: number;
  }> = [];
  const hForm: ("W" | "D" | "L")[] = [];
  const aForm: ("W" | "D" | "L")[] = [];

  if (home && away) {
    const [hm, am] = await Promise.all([
      getMatchesByTeamId(home.id),
      getMatchesByTeamId(away.id),
    ]);
    const finished = [...hm, ...am]
      .filter(
        (m, idx, arr) =>
          m.status === "finished" &&
          arr.findIndex((x) => x.id === m.id) === idx,
      )
      .filter(
        (m) =>
          (m.home_team_id === home.id && m.away_team_id === away.id) ||
          (m.home_team_id === away.id && m.away_team_id === home.id),
      )
      .sort((a, b) => (a.match_date < b.match_date ? 1 : -1))
      .slice(0, 5);
    for (const m of finished) {
      h2h.push({
        date: m.match_date,
        homeName:
          m.home_team_id === home.id
            ? home.name
            : (await getTeamById(m.home_team_id))?.name ?? m.home_team_id,
        awayName:
          m.away_team_id === away.id
            ? away.name
            : (await getTeamById(m.away_team_id))?.name ?? m.away_team_id,
        hs: m.home_score ?? 0,
        as: m.away_score ?? 0,
      });
    }
    hForm.push(...recentFormOf(hm, home.id, 5));
    aForm.push(...recentFormOf(am, away.id, 5));
  }

  const h = home ?? ({ id: match.home_team_id, name: "Local", short_name: "L" } as Team);
  const a = away ?? ({ id: match.away_team_id, name: "Visita", short_name: "V" } as Team);

  const { system, user } = buildSoccerMatchPredictionPrompt({
    match,
    home: h,
    away: a,
    standings,
    h2hLast5: h2h,
    last5Home: hForm,
    last5Away: aForm,
  });

  const text = await chatWithFallback(
    providerHint,
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.4, maxTokens: 800 },
  );
  const parsed = safeJsonParse<{
    predictedHomeScore?: unknown;
    predictedAwayScore?: unknown;
    homeWinProbability?: unknown;
    drawProbability?: unknown;
    awayWinProbability?: unknown;
    explanation?: unknown;
  }>(text, {
    predictedHomeScore: 1,
    predictedAwayScore: 1,
    homeWinProbability: 33,
    drawProbability: 34,
    awayWinProbability: 33,
    explanation:
      "Pronóstico genérico por defecto (parsing LLM no disponible).",
  });

  const toNum = (v: unknown, def: number) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : def;
  };
  const clampProb = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

  let hwp = clampProb(toNum(parsed.homeWinProbability, 33));
  let dp = clampProb(toNum(parsed.drawProbability, 34));
  let awp = clampProb(toNum(parsed.awayWinProbability, 33));
  const total = hwp + dp + awp;
  if (total <= 0) {
    hwp = 33;
    dp = 34;
    awp = 33;
  } else if (total !== 100) {
    // Normalizar a 100, distribuyendo diferencia en home para mantener enteros.
    const factor = 100 / total;
    hwp = clampProb(Math.round(hwp * factor));
    dp = clampProb(Math.round(dp * factor));
    awp = 100 - hwp - dp;
    if (awp < 0) {
      awp = 0;
      dp = 100 - hwp;
    }
  }

  const result: MatchPredictionResult = {
    matchId,
    predictedHomeScore: Math.max(0, Math.round(toNum(parsed.predictedHomeScore, hwp > awp ? 2 : 1))),
    predictedAwayScore: Math.max(0, Math.round(toNum(parsed.predictedAwayScore, awp > hwp ? 2 : 1))),
    homeWinProbability: hwp,
    drawProbability: dp,
    awayWinProbability: awp,
    explanation:
      typeof parsed.explanation === "string" && parsed.explanation.length > 0
        ? parsed.explanation
        : "Pronóstico basado en forma reciente y H2H.",
  };
  return setCachedAiResult(cacheKey, result);
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
  ]);
  const cached = getCachedAiResult<PlayerInsightResult>(cacheKey);
  if (cached) return cached;

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
  return setCachedAiResult(cacheKey, result);
}
