import "server-only";
import type { ActiveCompetition } from "@/lib/db/repositories/active-competition-repo";
import { getMatchesByLeagueSeason, isFutureScheduledMatch } from "@/lib/db/repositories/matches-repo";
import { getTeamsByLeagueId } from "@/lib/db/repositories/teams-repo";
import { listPredictionRowsByMatchIds } from "@/lib/db/repositories/predictions-repo";
import { assertValidModelProbs } from "@/lib/ai/evaluation-service";
import { soccerStandingsCalculator } from "@/sports/soccer/statistics/calculators";
import { validFinishedResult } from "@/lib/presentation/match-result";
import type { Match, Team } from "@/types/db/tables";

type Probabilities = { home: number; draw: number; away: number };
export type AvailableAnalysis = {
  match: Match; probabilities: Probabilities; modelVersion: string;
  predictedAt: string; expectedGoals: { home: number; away: number } | null;
};
export type CompetitionIntelligence = {
  active: ActiveCompetition | null;
  teams: Team[];
  upcoming: Match[];
  results: Array<{ match: Match; homeScore: number; awayScore: number }>;
  standings: ReturnType<typeof soccerStandingsCalculator.compute>;
  finishedCount: number;
  goalsCount: number;
  analysis: AvailableAnalysis | null;
};

function expectedGoals(value: unknown): AvailableAnalysis["expectedGoals"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const snapshot = value as Record<string, unknown>;
  const xg = snapshot.expectedGoals;
  if (typeof xg !== "object" || xg === null || Array.isArray(xg)) return null;
  const record = xg as Record<string, unknown>;
  const home = record.home;
  const away = record.away;
  return typeof home === "number" && Number.isFinite(home) && home >= 0 &&
    typeof away === "number" && Number.isFinite(away) && away >= 0
    ? { home, away } : null;
}

/** Reads one scoped season and its teams once; never runs a model or an LLM. */
export async function getCompetitionIntelligence(
  active: ActiveCompetition | null,
): Promise<CompetitionIntelligence> {
  const empty: CompetitionIntelligence = {
    active, teams: [], upcoming: [], results: [], standings: [],
    finishedCount: 0, goalsCount: 0, analysis: null,
  };
  if (!active) return empty;
  const [matches, teams] = await Promise.all([
    getMatchesByLeagueSeason(active.league.id, active.season.id),
    getTeamsByLeagueId(active.league.id),
  ]);
  const teamIds = new Set(teams.map(team => team.id));
  const scopedMatches = matches.filter(match =>
    match.sport_id === active.league.sport_id &&
    match.league_id === active.league.id && match.season_id === active.season.id &&
    teamIds.has(match.home_team_id) && teamIds.has(match.away_team_id),
  );
  const valid = scopedMatches.flatMap(match => {
    const score = validFinishedResult(match);
    return score ? [{ match, ...score }] : [];
  });
  const standings = valid.length > 0
    ? soccerStandingsCalculator.compute({ matches: valid.map(({ match }) => match), teams })
    : [];
  const now = Date.now();
  const upcoming = scopedMatches.filter(match =>
    isFutureScheduledMatch(match, now),
  ).sort((a, b) => a.match_date.localeCompare(b.match_date)).slice(0, 5);
  const results = valid.sort((a, b) => b.match.match_date.localeCompare(a.match.match_date))
    .slice(0, 5).map(({ match, home, away }) => ({ match, homeScore: home, awayScore: away }));
  const matchMap = new Map(scopedMatches.map(match => [match.id, match]));
  const rows = await listPredictionRowsByMatchIds(scopedMatches.map(match => match.id), 20);
  let analysis: AvailableAnalysis | null = null;
  for (const row of rows) {
    const match = matchMap.get(row.match_id);
    if (!match || row.market_id.toLowerCase() !== "1x2" || !row.model_version_id.trim()) continue;
    const predicted = Date.parse(row.predicted_at);
    const kickoff = Date.parse(row.kickoff_at);
    if (!Number.isFinite(predicted) || !Number.isFinite(kickoff) || predicted >= kickoff) continue;
    try { assertValidModelProbs(row.model_probabilities); }
    catch { continue; }
    analysis = {
      match, probabilities: {
        home: row.model_probabilities.home,
        draw: row.model_probabilities.draw,
        away: row.model_probabilities.away,
      },
      modelVersion: row.model_version_id, predictedAt: row.predicted_at,
      expectedGoals: expectedGoals(row.data_snapshot),
    };
    break;
  }
  return {
    active, teams, upcoming, results, standings,
    finishedCount: valid.length,
    goalsCount: valid.reduce((total, { home, away }) => total + home + away, 0),
    analysis,
  };
}
