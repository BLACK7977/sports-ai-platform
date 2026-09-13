import "server-only";
import { getMatchById } from "@/lib/db/repositories/matches-repo";
import { getMatchesByLeagueSeason } from "@/lib/db/repositories/matches-repo";
import { getTeamsByLeagueId } from "@/lib/db/repositories/teams-repo";
import { getTeamStandings } from "@/lib/services/statistics-service";
import type { Match, Team } from "@/types/db/tables";
import type { SportId } from "@/types/core/sport";
import type { SoccerStandingsRow } from "@/types/core/stats";
import type { ModelInput, ModelResult, ModelParameters, HistoricalMatch } from "@/lib/ai/probability-model";
import { computeModelV1, getDefaultParameters } from "@/lib/ai/probability-model";

function toHistoricalMatch(m: Match): HistoricalMatch {
  return {
    id: m.id,
    matchDate: m.match_date,
    homeTeamId: m.home_team_id,
    awayTeamId: m.away_team_id,
    homeScore: m.home_score ?? 0,
    awayScore: m.away_score ?? 0,
    status: m.status,
  };
}

export async function prepareModelInput(
  sportId: SportId,
  leagueId: string,
  seasonId: string,
  matchId: string
): Promise<{
  input: ModelInput;
  allMatches: HistoricalMatch[];
  teams: Team[];
  standings: SoccerStandingsRow[];
}> {
  const [match, allMatches, teams, standings] = await Promise.all([
    getMatchById(matchId),
    getMatchesByLeagueSeason(leagueId, seasonId),
    getTeamsByLeagueId(leagueId),
    getTeamStandings(sportId, leagueId, seasonId),
  ]);

  if (!match) {
    throw new Error(`Match ${matchId} not found`);
  }

  const input: ModelInput = {
    homeTeamId: match.home_team_id,
    awayTeamId: match.away_team_id,
    leagueId,
    seasonId,
    kickoffAt: match.match_date,
    homeTeamName: teams.find((t) => t.id === match.home_team_id)?.name,
    awayTeamName: teams.find((t) => t.id === match.away_team_id)?.name,
  };

  const historicalMatches = allMatches.map(toHistoricalMatch);

  return { input, allMatches: historicalMatches, teams, standings };
}

export async function runProbabilityModel(
  sportId: SportId,
  leagueId: string,
  seasonId: string,
  matchId: string,
  customParams?: Partial<ModelParameters>
): Promise<ModelResult> {
  const { input, allMatches, teams, standings } = await prepareModelInput(
    sportId,
    leagueId,
    seasonId,
    matchId
  );

  const params = { ...getDefaultParameters(), ...customParams };
  return computeModelV1(input, allMatches, teams, standings, params);
}