import type { DataSource } from "@/types/core/data-source";
import type { PlayerInsert, TeamInsert } from "@/types/db/tables";
import type { SoccerMatchPayload, SoccerPlayerStatsSpecific } from "../types";
import { providerExternalId, withProviderMetadata } from "./provider-contract";

const BASE_URL = "https://raw.githubusercontent.com/statsbomb/open-data/master/data";
const SOURCE_ID = "statsbomb-open-data";

export const STATS_BOMB_WORLD_CUP_2022 = {
  competitionId: 43,
  seasonId: 106,
  leagueId: "statsbomb-fifa-world-cup",
  appSeasonId: "statsbomb-fifa-world-cup-2022",
} as const;

type SbIdName = { id: number; name: string };
type SbMatchTeam = { home_team_id?: number; away_team_id?: number; team_id?: number; id?: number; name?: string; home_team_name?: string; away_team_name?: string };
type SbMatch = {
  match_id: number; match_date: string; kick_off?: string; match_week?: number;
  home_score: number; away_score: number; home_team: SbMatchTeam; away_team: SbMatchTeam;
  stadium?: SbIdName; referee?: SbIdName;
};
type SbLineupPlayer = {
  player_id: number; player_name: string; player_nickname?: string; jersey_number?: number;
  country?: SbIdName; positions?: Array<{ position?: SbIdName; start_time?: string; end_time?: string }>;
};
type SbLineup = { team_id: number; team_name: string; lineup: SbLineupPlayer[] };
type SbEvent = {
  type?: SbIdName; player?: SbIdName; team?: SbIdName;
  pass?: { outcome?: SbIdName; goal_assist?: boolean };
  shot?: { outcome?: SbIdName };
  bad_behaviour?: { card?: SbIdName };
};

type PlayerRollup = { goals: number; assists: number; passes: number; completedPasses: number; yellowCards: number; redCards: number };

function id(kind: "team" | "player", value: number) {
  return `${SOURCE_ID}-${kind}-${value}`;
}

function matchTeamId(team: SbMatchTeam): number {
  const value = team.id ?? team.home_team_id ?? team.away_team_id ?? team.team_id;
  if (!Number.isInteger(value)) throw new Error(`${SOURCE_ID}: match sin identificador de equipo`);
  return value as number;
}

function minutesPlayed(positions: SbLineupPlayer["positions"]): number {
  if (!positions?.length) return 0;
  const minute = (value?: string) => {
    const parts = value?.split(":").map(Number) ?? [];
    return Number.isFinite(parts[0]) ? parts[0] + (parts[1] ?? 0) / 60 : 0;
  };
  return Math.max(0, Math.min(120, Math.round(positions.reduce((total, p) => total + Math.max(0, minute(p.end_time ?? "90:00") - minute(p.start_time)), 0))));
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}/${path}`);
  if (!response.ok) throw new Error(`${SOURCE_ID}: ${path} respondió ${response.status}`);
  return response.json() as Promise<T>;
}

export interface StatsBombOpenDataInput {
  leagueId?: string;
  seasonId?: string;
  competitionId?: number;
  competitionSeasonId?: number;
  limit?: number;
}

export const soccerStatsBombOpenDataSource: DataSource<StatsBombOpenDataInput, SoccerMatchPayload[]> = {
  id: SOURCE_ID,
  name: "StatsBomb Open Data (archivos JSON públicos)",
  async fetch(input) {
    const syncedAt = new Date().toISOString();
    const competitionId = input?.competitionId ?? STATS_BOMB_WORLD_CUP_2022.competitionId;
    const competitionSeasonId = input?.competitionSeasonId ?? STATS_BOMB_WORLD_CUP_2022.seasonId;
    const leagueId = input?.leagueId ?? STATS_BOMB_WORLD_CUP_2022.leagueId;
    const seasonId = input?.seasonId ?? STATS_BOMB_WORLD_CUP_2022.appSeasonId;
    const matches = await getJson<SbMatch[]>(`matches/${competitionId}/${competitionSeasonId}.json`);
    const selected = input?.limit ? matches.slice(0, input.limit) : matches;

    return Promise.all(selected.map(async (match) => {
      const [lineups, events] = await Promise.all([
        getJson<SbLineup[]>(`lineups/${match.match_id}.json`),
        getJson<SbEvent[]>(`events/${match.match_id}.json`),
      ]);
      const teamIds = new Map(lineups.map((lineup) => [lineup.team_id, id("team", lineup.team_id)]));
      const homeTeamId = matchTeamId(match.home_team);
      const awayTeamId = matchTeamId(match.away_team);
      const teams: TeamInsert[] = lineups.map((lineup) => ({
        id: id("team", lineup.team_id), sport_id: "soccer", league_id: leagueId,
        name: lineup.team_name, short_name: lineup.team_name.slice(0, 3).toUpperCase(),
        external_id: providerExternalId(SOURCE_ID, "team", lineup.team_id),
        sport_specific: withProviderMetadata(
          { data_source: SOURCE_ID },
          { provider: SOURCE_ID, external_id: lineup.team_id, last_synced_at: syncedAt },
        ),
      }));
      const players: PlayerInsert[] = lineups.flatMap((lineup) => lineup.lineup.map((player) => ({
        id: id("player", player.player_id), sport_id: "soccer", team_id: teamIds.get(lineup.team_id)!,
        full_name: player.player_name, short_name: player.player_nickname || player.player_name,
        position: player.positions?.[0]?.position?.name ?? "Unknown", jersey_number: player.jersey_number,
        nationality: player.country?.name, external_id: providerExternalId(SOURCE_ID, "player", player.player_id),
        sport_specific: withProviderMetadata(
          { data_source: SOURCE_ID },
          { provider: SOURCE_ID, external_id: player.player_id, last_synced_at: syncedAt },
        ),
      })));
      const rollups = new Map<number, PlayerRollup>();
      const rollup = (playerId: number) => {
        const existing = rollups.get(playerId) ?? { goals: 0, assists: 0, passes: 0, completedPasses: 0, yellowCards: 0, redCards: 0 };
        rollups.set(playerId, existing); return existing;
      };
      for (const event of events) {
        if (!event.player?.id) continue;
        const stats = rollup(event.player.id);
        if (event.type?.name === "Pass") { stats.passes++; if (!event.pass?.outcome) stats.completedPasses++; if (event.pass?.goal_assist) stats.assists++; }
        if (event.type?.name === "Shot" && event.shot?.outcome?.name === "Goal") stats.goals++;
        if (event.type?.name === "Bad Behaviour") {
          if (event.bad_behaviour?.card?.name?.includes("Red")) stats.redCards++;
          if (event.bad_behaviour?.card?.name?.includes("Yellow")) stats.yellowCards++;
        }
      }
      const playerStats = lineups.flatMap((lineup) => lineup.lineup.map((player) => {
        const stats = rollups.get(player.player_id) ?? { goals: 0, assists: 0, passes: 0, completedPasses: 0, yellowCards: 0, redCards: 0 };
        const specific: SoccerPlayerStatsSpecific = {
          side: lineup.team_id === homeTeamId ? "home" : "away", goals: stats.goals, assists: stats.assists,
          yellow_cards: stats.yellowCards, red_cards: stats.redCards, shots: 0, passes: stats.passes,
          pass_accuracy_pct: stats.passes ? Math.round((stats.completedPasses / stats.passes) * 100) : 0,
        };
        return { player_id: id("player", player.player_id), team_id: teamIds.get(lineup.team_id)!, minutes_played: minutesPlayed(player.positions), specific };
      }));
      return {
        external_id: providerExternalId(SOURCE_ID, "match", match.match_id), league_id: leagueId, season_id: seasonId,
        home_team_id: id("team", homeTeamId), away_team_id: id("team", awayTeamId),
        match_date: `${match.match_date}T${match.kick_off ?? "00:00:00"}Z`, status: "finished",
        home_score: match.home_score, away_score: match.away_score, teams, players, playerStats,
        specific: withProviderMetadata(
          { round: match.match_week, referee: match.referee?.name, data_source: SOURCE_ID, stadium: match.stadium?.name, source_match_id: match.match_id },
          { provider: SOURCE_ID, external_id: match.match_id, last_synced_at: syncedAt },
        ),
      };
    }));
  },
};
