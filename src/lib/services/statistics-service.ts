import "server-only";
import { getSportOrThrow } from "@/lib/config/sports-registry";
import type { SportId } from "@/types/core/sport";
import { getMatchesByLeagueSeason } from "@/lib/db/repositories/matches-repo";
import { getTeamsByLeagueId } from "@/lib/db/repositories/teams-repo";
import {
  getPlayersByIds,
  getPlayersByTeamId,
} from "@/lib/db/repositories/players-repo";
import {
  getStatsByMatchId,
  getStatsByMatchIds,
  getStatsByPlayerId,
  getStatsByTeamIdMatchId,
} from "@/lib/db/repositories/player-stats-repo";
import type {
  Match,
  PlayerMatchStats,
  SoccerPlayerSeasonAggregate,
  SoccerStandingsRow,
} from "@/types/core/stats";

// Cast seguro: MVP tiene 1 solo deporte. StandingsInput/Output tipados ya en calculators.
type StandingsCalculatorInput = { matches: unknown; teams: unknown };
type PlayerAggregateInput = {
  matches: unknown;
  playerStats: Array<{
    match_id: string;
    player_id: string;
    team_id: string;
    full_name: string;
    position: string;
    minutes_played: number;
    sport_specific: Record<string, unknown>;
  }>;
};

export async function getTeamStandings(
  sportId: SportId,
  leagueId: string,
  seasonId: string,
): Promise<SoccerStandingsRow[]> {
  const sport = getSportOrThrow(sportId);
  const calc = sport.calculators["standings"];
  if (!calc) {
    throw new Error(
      `[statistics] Sport '${sportId}' no tiene calculator 'standings'.`,
    );
  }

  const [matches, teams] = await Promise.all([
    getMatchesByLeagueSeason(leagueId, seasonId),
    getTeamsByLeagueId(leagueId),
  ]);

  const input: StandingsCalculatorInput = {
    matches,
    teams,
  };
  return (calc.compute as unknown as (
    p: StandingsCalculatorInput,
  ) => SoccerStandingsRow[])(input);
}

export async function getPlayerSeasonRanking(
  sportId: SportId,
  leagueId: string,
  seasonId: string,
): Promise<SoccerPlayerSeasonAggregate[]> {
  const sport = getSportOrThrow(sportId);
  const calc = sport.calculators["playerAggregate"];
  if (!calc) {
    throw new Error(
      `[statistics] Sport '${sportId}' no tiene calculator 'playerAggregate'.`,
    );
  }

  const [matches, teams] = await Promise.all([
    getMatchesByLeagueSeason(leagueId, seasonId),
    getTeamsByLeagueId(leagueId),
  ]);
  const matchStats = await getStatsByMatchIds(matches.map((match) => match.id));
  const players = await getPlayersByIds([
    ...new Set(matchStats.map((stat) => stat.player_id)),
  ]);

  const playerMap = new Map<string, { full_name: string; position: string }>();
  for (const p of players) {
    playerMap.set(p.id, { full_name: p.full_name, position: p.position });
  }
  const teamSet = new Set(teams.map((t) => t.id));
  const enriched = matchStats
    .filter((ps) => teamSet.has(ps.team_id))
    .map((ps) => {
      const p = playerMap.get(ps.player_id) ?? {
        full_name: `Player ${ps.player_id}`,
        position: "Unknown",
      };
      return {
        match_id: ps.match_id,
        player_id: ps.player_id,
        team_id: ps.team_id,
        full_name: p.full_name,
        position: p.position,
        minutes_played: ps.minutes_played,
        sport_specific:
          (ps.sport_specific as Record<string, unknown> | undefined) ?? {},
      };
    });

  const input: PlayerAggregateInput = {
    matches,
    playerStats: enriched,
  };
  return (calc.compute as unknown as (
    p: PlayerAggregateInput,
  ) => SoccerPlayerSeasonAggregate[])(input);
}

export async function getMatchWithStats(
  sportId: SportId,
  matchId: string,
): Promise<{
  match: Match;
  home: {
    teamId: string;
    players: PlayerMatchStats[];
  };
  away: {
    teamId: string;
    players: PlayerMatchStats[];
  };
} | null> {
  void sportId;
  const { getMatchById } = await import("@/lib/db/repositories/matches-repo");
  const match = await getMatchById(matchId);
  if (!match) return null;
  const [home, away] = await Promise.all([
    getStatsByTeamIdMatchId(match.home_team_id, match.id),
    getStatsByTeamIdMatchId(match.away_team_id, match.id),
  ]);
  return {
    match: match as Match,
    home: { teamId: match.home_team_id, players: home as PlayerMatchStats[] },
    away: { teamId: match.away_team_id, players: away as PlayerMatchStats[] },
  };
}

export async function getPlayerCareerStats(
  sportId: SportId,
  playerId: string,
): Promise<{
  matchesPlayed: number;
  totalMinutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  ratingAvg: number;
  matches: { matchDate: string; opponent: string; minutes: number; goals: number; assists: number }[];
}> {
  void sportId;
  const stats = await getStatsByPlayerId(playerId);
  let goals = 0;
  let assists = 0;
  let yellowCards = 0;
  let redCards = 0;
  let totalMinutes = 0;
  let ratingSum = 0;
  let ratingCount = 0;

  const matchIds = new Set(stats.map((s) => s.match_id));
  const { getMatchesByTeamId, getMatchById } = await import(
    "@/lib/db/repositories/matches-repo"
  );
  const matchMap = new Map<string, Match>();
  for (const mid of matchIds) {
    const m = await getMatchById(mid);
    if (m) matchMap.set(mid, m as Match);
  }
  void getMatchesByTeamId;

  const perMatch = stats.map((s) => {
    const sp = (s.sport_specific ?? {}) as Record<string, unknown>;
    const g = Number(sp.goals ?? 0) || 0;
    const a = Number(sp.assists ?? 0) || 0;
    goals += g;
    assists += a;
    yellowCards += Number(sp.yellow_cards ?? 0) || 0;
    redCards += Number(sp.red_cards ?? 0) || 0;
    totalMinutes += s.minutes_played;
    const rt = Number(sp.rating);
    if (Number.isFinite(rt)) {
      ratingSum += rt;
      ratingCount++;
    }
    const m = matchMap.get(s.match_id);
    const opponent = m
      ? m.home_team_id === s.team_id
        ? m.away_team_id
        : m.home_team_id
      : "";
    return {
      matchDate: m?.match_date ?? "",
      opponent,
      minutes: s.minutes_played,
      goals: g,
      assists: a,
    };
  });
  perMatch.sort((a, b) => (a.matchDate < b.matchDate ? 1 : -1));

  return {
    matchesPlayed: stats.length,
    totalMinutes,
    goals,
    assists,
    yellowCards,
    redCards,
    ratingAvg: ratingCount > 0 ? ratingSum / ratingCount : 0,
    matches: perMatch,
  };
}

export async function getTeamSquadRanking(
  sportId: SportId,
  leagueId: string,
  seasonId: string,
): Promise<Array<SoccerPlayerSeasonAggregate & { teamName: string }>> {
  const ranking = await getPlayerSeasonRanking(sportId, leagueId, seasonId);
  const teams = await getTeamsByLeagueId(leagueId);
  const teamMap = new Map(teams.map((t) => [t.id, t.name]));
  return ranking.map((r) => ({
    ...r,
    teamName: teamMap.get(r.teamId) ?? r.teamId,
  }));
}

export { getPlayersByTeamId };
