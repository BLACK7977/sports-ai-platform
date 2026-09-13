import type { PlayerInsert, TeamInsert } from "@/types/db/tables";
import type { SoccerMatchPayload, SoccerPlayerStatsSpecific } from "../types";
import { providerExternalId, providerInternalId, withProviderMetadata } from "./provider-contract";
import type { SoccerCompetitionTarget } from "./provider-contract";

export type ExternalTeam = { id: string | number; name: string; shortName?: string; logoUrl?: string };
export type ExternalPlayer = {
  id: string | number; name: string; position: string; jerseyNumber?: number;
  nationality?: string; dateOfBirth?: string;
  stats?: { minutes: number; goals: number; assists: number; yellowCards: number; redCards: number; shots: number; passes: number; passAccuracyPct: number };
};

/**
 * Provider-neutral shape expected after an API client has fetched a fixture.
 * The adapter deliberately does not fetch, authenticate, or fabricate stats.
 */
export type ArgentinaPrimeraExternalFixture = {
  id: string | number;
  kickoff: string;
  status: SoccerMatchPayload["status"];
  home: ExternalTeam;
  away: ExternalTeam;
  homeScore?: number;
  awayScore?: number;
  round?: number;
  homePlayers?: ExternalPlayer[];
  awayPlayers?: ExternalPlayer[];
};

function required(value: unknown, label: string): asserts value {
  if (value === undefined || value === null || value === "") {
    throw new Error(`[argentina-primera-adapter] falta ${label}.`);
  }
}

function normalizeTeam(provider: string, target: SoccerCompetitionTarget, team: ExternalTeam, syncedAt: string): TeamInsert {
  required(team.id, "team.id");
  required(team.name, "team.name");
  return {
    id: providerInternalId(provider, "team", team.id), sport_id: "soccer",
    league_id: target.leagueId, name: team.name,
    short_name: team.shortName ?? team.name, logo_url: team.logoUrl,
    external_id: providerExternalId(provider, "team", team.id),
    provider, last_synced_at: syncedAt,
    sport_specific: withProviderMetadata({}, { provider, external_id: team.id, last_synced_at: syncedAt }),
  };
}

export function normalizeArgentinaPrimeraSquad(
  provider: string,
  target: SoccerCompetitionTarget,
  team: ExternalTeam,
  players: ExternalPlayer[],
  syncedAt = new Date().toISOString(),
): { team: TeamInsert; players: PlayerInsert[] } {
  return {
    team: normalizeTeam(provider, target, team, syncedAt),
    players: players.map((player) => normalizePlayer(provider, target, team, player, syncedAt)),
  };
}

function normalizePlayer(provider: string, target: SoccerCompetitionTarget, team: ExternalTeam, player: ExternalPlayer, syncedAt: string): PlayerInsert {
  required(player.id, "player.id");
  required(player.name, "player.name");
  required(player.position, "player.position");
  return {
    id: providerInternalId(provider, "player", player.id), sport_id: "soccer",
    team_id: providerInternalId(provider, "team", team.id), full_name: player.name,
    short_name: player.name, position: player.position, jersey_number: player.jerseyNumber,
    nationality: player.nationality, date_of_birth: player.dateOfBirth,
    external_id: providerExternalId(provider, "player", player.id),
    provider, last_synced_at: syncedAt,
    sport_specific: withProviderMetadata({}, { provider, external_id: player.id, last_synced_at: syncedAt }),
  };
}

function normalizeStats(provider: string, team: ExternalTeam, players: ExternalPlayer[], side: "home" | "away") {
  return players.flatMap((player) => {
    if (!player.stats) return [];
    const stats: SoccerPlayerStatsSpecific = {
      side, goals: player.stats.goals, assists: player.stats.assists,
      yellow_cards: player.stats.yellowCards, red_cards: player.stats.redCards,
      shots: player.stats.shots, passes: player.stats.passes,
      pass_accuracy_pct: player.stats.passAccuracyPct,
    };
    return [{ player_id: providerInternalId(provider, "player", player.id), team_id: providerInternalId(provider, "team", team.id), minutes_played: player.stats.minutes, specific: stats }];
  });
}

export function normalizeArgentinaPrimeraFixture(
  provider: string,
  target: SoccerCompetitionTarget,
  fixture: ArgentinaPrimeraExternalFixture,
  syncedAt = new Date().toISOString(),
): SoccerMatchPayload {
  required(provider, "provider");
  required(fixture.id, "fixture.id");
  required(fixture.kickoff, "fixture.kickoff");
  const homePlayers = fixture.homePlayers ?? [];
  const awayPlayers = fixture.awayPlayers ?? [];
  return {
    external_id: providerExternalId(provider, "match", fixture.id),
    provider, last_synced_at: syncedAt,
    league_id: target.leagueId,
    season_id: target.seasonId,
    home_team_id: providerInternalId(provider, "team", fixture.home.id),
    away_team_id: providerInternalId(provider, "team", fixture.away.id),
    match_date: fixture.kickoff, status: fixture.status,
    home_score: fixture.homeScore, away_score: fixture.awayScore,
    teams: [normalizeTeam(provider, target, fixture.home, syncedAt), normalizeTeam(provider, target, fixture.away, syncedAt)],
    players: [
      ...homePlayers.map((player) => normalizePlayer(provider, target, fixture.home, player, syncedAt)),
      ...awayPlayers.map((player) => normalizePlayer(provider, target, fixture.away, player, syncedAt)),
    ],
    playerStats: [
      ...normalizeStats(provider, fixture.home, homePlayers, "home"),
      ...normalizeStats(provider, fixture.away, awayPlayers, "away"),
    ],
    specific: withProviderMetadata(
      { round: fixture.round },
      { provider, external_id: fixture.id, last_synced_at: syncedAt },
    ),
  };
}
