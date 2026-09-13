import type { Match, Team as DbTeam } from "@/types/db/tables";
import type { SoccerStandingsRow as DbSoccerStandingsRow } from "@/types/core/stats";

export type Team = DbTeam;
export type SoccerStandingsRow = DbSoccerStandingsRow;

export interface ModelParameters {
  lookbackMatches: number;
  minMatchesRequired: number;
  recencyHalfLife: number;
  homeAdvFactor: number;
  homeAdvEstimation: "fixed" | "league_average";
  dcEnabled: boolean;
  dcRho: number;
  maxGoals: number;
  fallbackMethod: "league_average";
  normalizeToUnity: boolean;
  minLambda: number;
  maxLambda: number;
}

export interface TeamStrengths {
  attack: number;
  defense: number;
  matchesUsed: number;
}

export interface ModelInput {
  homeTeamId: string;
  awayTeamId: string;
  leagueId: string;
  seasonId: string;
  kickoffAt: string;
  homeTeamName?: string;
  awayTeamName?: string;
}

export interface HistoricalMatch {
  id: string;
  matchDate: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  status: Match["status"];
}

/**
 * Snapshot de inputs para reproducibilidad a nivel de modelo.
 *
 * Con este snapshot + effectiveParameters se puede recomputar EXACTAMENTE
 * λ → P(1X2) sin acceder a la DB. Límite documentado: NO incluye la lista
 * completa de partidos de la liga usada para los promedios (solo sus valores
 * agregados + conteo), por lo que la re-derivación de strengths desde filas
 * crudas requeriría re-leer la liga. Nivel: "reproducibility-model-level".
 */
export interface HistoricalMatchRef {
  id: string;
  date: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
}

export interface TeamInputsSnapshot {
  matches: HistoricalMatchRef[];
  attack: number;
  defense: number;
}

export interface ModelInputsSnapshot {
  /** Cutoff temporal: solo partidos con date < cutoff fueron usados. */
  cutoff: string;
  home: TeamInputsSnapshot;
  away: TeamInputsSnapshot;
  leagueAverages: {
    avgHomeGoals: number;
    avgAwayGoals: number;
    avgGoalsScored: number;
    leagueMatchesUsed: number;
  };
}

export interface ModelResult {
  modelVersionId: string;
  probabilities: {
    home: number;
    draw: number;
    away: number;
  };
  expectedGoals: {
    home: number;
    away: number;
  };
  usedFallback: boolean;
  fallbackReason: string;
  dataQuality: {
    homeMatchesUsed: number;
    awayMatchesUsed: number;
    leagueMatchesUsed: number;
  };
  parameters: ModelParameters;
  inputs: ModelInputsSnapshot;
}

export interface LeagueAverages {
  avgGoalsScored: number;
  avgGoalsConceded: number;
  avgHomeGoals: number;
  avgAwayGoals: number;
  totalMatches: number;
}

function poisson(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return Math.exp(-lambda + k * Math.log(lambda) - logFactorial(k));
}

const logFactorialCache = new Map<number, number>();
function logFactorial(n: number): number {
  if (n <= 1) return 0;
  if (logFactorialCache.has(n)) return logFactorialCache.get(n)!;
  let sum = 0;
  for (let i = 2; i <= n; i++) sum += Math.log(i);
  logFactorialCache.set(n, sum);
  return sum;
}

function getWeight(index: number, halfLife: number): number {
  return Math.pow(0.5, index / halfLife);
}

function computeWeightedAverage(values: number[], halfLife: number): number {
  if (values.length === 0) return 0;
  let weightedSum = 0;
  let weightSum = 0;
  for (let i = 0; i < values.length; i++) {
    const w = getWeight(i, halfLife);
    weightedSum += values[i] * w;
    weightSum += w;
  }
  return weightSum > 0 ? weightedSum / weightSum : values[0];
}

function extractTeamMatches(
  matches: HistoricalMatch[],
  teamId: string,
  kickoffAt: string,
  lookback: number
): { home: HistoricalMatch[]; away: HistoricalMatch[]; combined: HistoricalMatch[] } {
  const relevant = matches
    .filter((m) => m.matchDate < kickoffAt && m.status === "finished")
    .filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)
    .sort((a, b) => (b.matchDate > a.matchDate ? 1 : -1))
    .slice(0, lookback);

  const home = relevant.filter((m) => m.homeTeamId === teamId);
  const away = relevant.filter((m) => m.awayTeamId === teamId);
  return { home, away, combined: relevant };
}

function calculateLeagueAverages(
  matches: HistoricalMatch[],
  kickoffAt: string
): LeagueAverages {
  const finished = matches.filter(
    (m) => m.matchDate < kickoffAt && m.status === "finished"
  );
  if (finished.length === 0) {
    return {
      avgGoalsScored: 1.3,
      avgGoalsConceded: 1.3,
      avgHomeGoals: 1.5,
      avgAwayGoals: 1.1,
      totalMatches: 0,
    };
  }
  let totalHomeGoals = 0;
  let totalAwayGoals = 0;
  for (const m of finished) {
    totalHomeGoals += m.homeScore;
    totalAwayGoals += m.awayScore;
  }
  const n = finished.length;
  return {
    avgGoalsScored: (totalHomeGoals + totalAwayGoals) / (2 * n),
    avgGoalsConceded: (totalHomeGoals + totalAwayGoals) / (2 * n),
    avgHomeGoals: totalHomeGoals / n,
    avgAwayGoals: totalAwayGoals / n,
    totalMatches: n,
  };
}

function calculateTeamStrengths(
  teamMatches: { home: HistoricalMatch[]; away: HistoricalMatch[]; combined: HistoricalMatch[] },
  leagueAvgs: LeagueAverages,
  isHomeTeam: boolean,
  halfLife: number
): TeamStrengths {
  const { home, away, combined } = teamMatches;
  const nCombined = combined.length;

  if (nCombined === 0) {
    return { attack: 1, defense: 1, matchesUsed: 0 };
  }

  const homeGoalsScored = home.map((m) => m.homeScore);
  const homeGoalsConceded = home.map((m) => m.awayScore);
  const awayGoalsScored = away.map((m) => m.awayScore);
  const awayGoalsConceded = away.map((m) => m.homeScore);

  const allGoalsScored = [...homeGoalsScored, ...awayGoalsScored].reverse();
  const allGoalsConceded = [...homeGoalsConceded, ...awayGoalsConceded].reverse();

  const avgGoalsScored = computeWeightedAverage(allGoalsScored, halfLife);
  const avgGoalsConceded = computeWeightedAverage(allGoalsConceded, halfLife);

  const attack = leagueAvgs.avgGoalsScored > 0 ? avgGoalsScored / leagueAvgs.avgGoalsScored : 1;
  const defense = leagueAvgs.avgGoalsConceded > 0 ? avgGoalsConceded / leagueAvgs.avgGoalsConceded : 1;

  return {
    attack: Math.max(0.1, attack),
    defense: Math.max(0.1, defense),
    matchesUsed: nCombined,
  };
}

/**
 * Dixon-Coles tau correction for low-scoring outcomes.
 * 
 * Standard formulation (Dixon & Coles 1997):
 *   tau(0,0) = 1 - lambdaH * lambdaA * rho
 *   tau(0,1) = 1 + lambdaH * rho
 *   tau(1,0) = 1 + lambdaA * rho
 *   tau(1,1) = 1 - rho
 * 
 * With rho < 0 (typical -0.1 to -0.15):
 * - tau(0,0) increases (more 0-0 draws)
 * - tau(0,1) and tau(1,0) decrease (fewer 0-1 and 1-0)
 * - tau(1,1) increases
 * 
 * With rho = -0.13 and maxLambda = 5.0:
 * - tau(0,0) = 1 - lambdaH*lambdaA*(-0.13) = 1 + 0.13*lambdaH*lambdaA > 1 (always positive)
 * - tau(0,1) = 1 - 0.13*lambdaH >= 1 - 0.65 = 0.35 (positive with maxLambda=5)
 * - tau(1,0) = 1 - 0.13*lambdaA >= 0.35 (positive with maxLambda=5)
 * - tau(1,1) = 1.13 (always positive)
 * 
 * Math.max(0, tau) is kept as defensive safeguard for future parameter changes
 * where rho might be more negative or maxLambda larger.
 */
function dixonColesTau(h: number, a: number, lambdaH: number, lambdaA: number, rho: number): number {
  let tau: number;
  if (h === 0 && a === 0) tau = 1 - lambdaH * lambdaA * rho;
  else if (h === 0 && a === 1) tau = 1 + lambdaH * rho;
  else if (h === 1 && a === 0) tau = 1 + lambdaA * rho;
  else if (h === 1 && a === 1) tau = 1 - rho;
  else tau = 1;
  return Math.max(0, tau);
}

export function computeModelV1(
  input: ModelInput,
  allMatches: HistoricalMatch[],
  teams: Team[],
  standings: SoccerStandingsRow[],
  params: ModelParameters
): ModelResult {
  const { homeTeamId, awayTeamId, kickoffAt } = input;

  const leagueAvgs = calculateLeagueAverages(allMatches, kickoffAt);

  const homeTeamMatches = extractTeamMatches(allMatches, homeTeamId, kickoffAt, params.lookbackMatches);
  const awayTeamMatches = extractTeamMatches(allMatches, awayTeamId, kickoffAt, params.lookbackMatches);

  const homeStrengths = calculateTeamStrengths(homeTeamMatches, leagueAvgs, true, params.recencyHalfLife);
  const awayStrengths = calculateTeamStrengths(awayTeamMatches, leagueAvgs, false, params.recencyHalfLife);

  const homeMatchesUsed = homeStrengths.matchesUsed;
  const awayMatchesUsed = awayStrengths.matchesUsed;

  let usedFallback = false;
  let fallbackReason = "";

  if (homeMatchesUsed < params.minMatchesRequired || awayMatchesUsed < params.minMatchesRequired) {
    usedFallback = true;
    const reasons = [];
    if (homeMatchesUsed < params.minMatchesRequired) {
      reasons.push(`home team only ${homeMatchesUsed}/${params.minMatchesRequired} matches`);
    }
    if (awayMatchesUsed < params.minMatchesRequired) {
      reasons.push(`away team only ${awayMatchesUsed}/${params.minMatchesRequired} matches`);
    }
    fallbackReason = reasons.join("; ");

    if (params.fallbackMethod === "league_average") {
      homeStrengths.attack = 1;
      homeStrengths.defense = 1;
      awayStrengths.attack = 1;
      awayStrengths.defense = 1;
    }
  }

  /**
 * Expected goals (lambda) calculation.
 * 
 * IMPORTANT: Home advantage is derived EXCLUSIVELY from the data:
 * - leagueAvgHomeGoals = historical average goals scored by home teams in this league
 * - leagueAvgAwayGoals = historical average goals scored by away teams in this league
 * 
 * The parameter `homeAdvFactor` is RETAINED in ModelParameters for compatibility
 * and future model versions, but is NOT applied in V1.
 * 
 * Effective additional home advantage factor in V1 = 1.0 (no extra multiplier).
 * 
 * Before persisting predictions, ensure model_versions.parameters reflects
 * the actual effective behavior for full reproducibility.
 */
  const lambdaHomeRaw = leagueAvgs.avgHomeGoals * homeStrengths.attack * awayStrengths.defense;
  const lambdaAwayRaw = leagueAvgs.avgAwayGoals * awayStrengths.attack * homeStrengths.defense;

  const lambdaHome = Math.min(params.maxLambda, Math.max(params.minLambda, lambdaHomeRaw));
  const lambdaAway = Math.min(params.maxLambda, Math.max(params.minLambda, lambdaAwayRaw));

  const maxGoals = params.maxGoals;
  const matrix: number[][] = [];
  let totalProb = 0;

  for (let h = 0; h <= maxGoals; h++) {
    matrix[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      let prob = poisson(h, lambdaHome) * poisson(a, lambdaAway);
      if (params.dcEnabled) {
        prob *= dixonColesTau(h, a, lambdaHome, lambdaAway, params.dcRho);
      }
      matrix[h][a] = Math.max(0, prob);
      totalProb += matrix[h][a];
    }
  }

  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const prob = matrix[h][a] / totalProb;
      if (h > a) pHome += prob;
      else if (h === a) pDraw += prob;
      else pAway += prob;
    }
  }

  if (params.normalizeToUnity) {
    const sum = pHome + pDraw + pAway;
    if (sum > 0) {
      pHome /= sum;
      pDraw /= sum;
      pAway /= sum;
    }
  }

  pHome = Math.max(0, Math.min(1, pHome));
  pDraw = Math.max(0, Math.min(1, pDraw));
  pAway = Math.max(0, Math.min(1, pAway));

  const toRef = (m: HistoricalMatch): HistoricalMatchRef => ({
    id: m.id,
    date: m.matchDate,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
  });

  return {
    modelVersionId: "v1-dixon-coles-2026-01",
    probabilities: { home: pHome, draw: pDraw, away: pAway },
    expectedGoals: { home: lambdaHome, away: lambdaAway },
    usedFallback,
    fallbackReason,
    dataQuality: {
      homeMatchesUsed,
      awayMatchesUsed,
      leagueMatchesUsed: leagueAvgs.totalMatches,
    },
    parameters: params,
    inputs: {
      cutoff: kickoffAt,
      home: {
        matches: homeTeamMatches.combined.map(toRef),
        attack: homeStrengths.attack,
        defense: homeStrengths.defense,
      },
      away: {
        matches: awayTeamMatches.combined.map(toRef),
        attack: awayStrengths.attack,
        defense: awayStrengths.defense,
      },
      leagueAverages: {
        avgHomeGoals: leagueAvgs.avgHomeGoals,
        avgAwayGoals: leagueAvgs.avgAwayGoals,
        avgGoalsScored: leagueAvgs.avgGoalsScored,
        leagueMatchesUsed: leagueAvgs.totalMatches,
      },
    },
  };
}

export function getDefaultParameters(): ModelParameters {
  return {
    lookbackMatches: 20,
    minMatchesRequired: 6,
    recencyHalfLife: 7,
    homeAdvFactor: 1.25,
    homeAdvEstimation: "fixed",
    dcEnabled: true,
    dcRho: -0.13,
    maxGoals: 10,
    fallbackMethod: "league_average",
    normalizeToUnity: true,
    minLambda: 0.05,
    maxLambda: 5.0,
  };
}