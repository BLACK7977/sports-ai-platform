import "server-only";
import { getSportOrThrow } from "@/lib/config/sports-registry";
import type { SportId } from "@/types/core/sport";
import { getMatchesByLeagueSeason } from "@/lib/db/repositories/matches-repo";
import { getTeamsByIds } from "@/lib/db/repositories/teams-repo";
import { getPlayersByIds } from "@/lib/db/repositories/players-repo";
import { bulkUpsertPlayerStats } from "@/lib/db/repositories/player-stats-repo";
import { ensureDbReady } from "@/lib/db/client";
import type {
  MatchInsert,
  TeamInsert,
  PlayerInsert,
  PlayerMatchStatsInsert,
} from "@/types/db/tables";

export interface IngestionResult {
  sport: SportId;
  dataSource: string;
  fetched: number;
  insertedMatches: number;
  updatedMatches: number;
  insertedTeams: number;
  updatedTeams: number;
  insertedPlayers: number;
  updatedPlayers: number;
  insertedStats: number;
  updatedStats: number;
  errors: Array<{ matchExternalId: string; error: string }>;
}

export type MatchMapperOutput = {
  match: MatchInsert;
  teams?: TeamInsert[];
  players?: PlayerInsert[];
  stats?: PlayerMatchStatsInsert[];
  playerStats?: PlayerMatchStatsInsert[];
};

function requireProviderIdentity(
  dataSourceId: string,
  mapped: MatchMapperOutput,
): void {
  const externalId = mapped.match.external_id;
  if (!externalId) {
    throw new Error(`[ingestion] ${dataSourceId}: cada partido requiere external_id estable.`);
  }
  for (const team of mapped.teams ?? []) {
    if (!team.id || !team.external_id) {
      throw new Error(`[ingestion] ${dataSourceId}: cada equipo requiere id y external_id estables.`);
    }
  }
  for (const player of mapped.players ?? []) {
    if (!player.id || !player.external_id) {
      throw new Error(`[ingestion] ${dataSourceId}: cada jugador requiere id y external_id estables.`);
    }
  }
}

function chunks<T>(items: T[], size = 100): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

/** Compare provider payloads without treating local timestamps as data changes. */
function comparable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(comparable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !["created_at", "updated_at", "last_synced_at"].includes(key))
    .map(([key, child]) => [key, comparable(child)]));
}

function isUnchanged(existing: unknown, incoming: unknown): boolean {
  return JSON.stringify(comparable(existing)) === JSON.stringify(comparable(incoming));
}

export async function runIngestionJob(
  sportId: SportId,
  dataSourceId: string = "mock",
  input?: Record<string, unknown>,
): Promise<IngestionResult> {
  const sport = getSportOrThrow(sportId);
  const source = sport.dataSources[dataSourceId];
  if (!source) {
    throw new Error(
      `[ingestion] Sport '${sportId}' no tiene dataSource '${dataSourceId}'. Disponibles: ${Object.keys(sport.dataSources).join(", ")}`,
    );
  }
  const mapperRaw = sport.mappers["match"];
  if (!mapperRaw) {
    throw new Error(
      `[ingestion] Sport '${sportId}' no tiene mapper 'match' definido.`,
    );
  }

  // Cast seguro: MVP tiene 1 solo deporte (soccer), el mapper
  // exporta toDb/fromDb tipados para SoccerMatchPayload -> SoccerDbRows.
  const mapper = mapperRaw as unknown as {
    toDb: (dto: unknown) => MatchMapperOutput;
  };

  const dtos = (await source.fetch(input ?? {})) as unknown[];
  const result: IngestionResult = {
    sport: sportId,
    dataSource: dataSourceId,
    fetched: dtos.length,
    insertedMatches: 0,
    updatedMatches: 0,
    insertedTeams: 0,
    updatedTeams: 0,
    insertedPlayers: 0,
    updatedPlayers: 0,
    insertedStats: 0,
    updatedStats: 0,
    errors: [],
  };

  const teamsById = new Map<string, TeamInsert>();
  const playersById = new Map<string, PlayerInsert>();
  const matchesByExternalId = new Map<string, MatchInsert>();
  const statsBatch: PlayerMatchStatsInsert[] = [];

  for (const dto of dtos) {
    try {
      const mapped = mapper.toDb(dto);
      const { match, teams, players, stats, playerStats } = mapped;
      const effectiveStats = stats ?? playerStats ?? [];
      requireProviderIdentity(dataSourceId, mapped);
      const extId = match.external_id!;

      for (const team of teams ?? []) {
        if (team.id) teamsById.set(team.id, { ...team, sport_id: sportId });
      }
      for (const player of players ?? []) {
        if (player.id) playersById.set(player.id, { ...player, sport_id: sportId });
      }
      matchesByExternalId.set(extId, match);

      if (effectiveStats.length > 0) {
        statsBatch.push(...effectiveStats);
      }
    } catch (err) {
      const ext =
        dto && typeof dto === "object" && "external_id" in dto
          ? String((dto as { external_id?: unknown }).external_id ?? "unknown")
          : "unknown";
      result.errors.push({
        matchExternalId: ext,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const db = await ensureDbReady();
  const teams = [...teamsById.values()];
  const players = [...playersById.values()];
  const matches = [...matchesByExternalId.values()];
  const [existingTeams, existingPlayers, existingMatches] = await Promise.all([
    Promise.all(chunks(teams.map((team) => team.id!).filter(Boolean)).map(getTeamsByIds)).then((rows) => rows.flat()),
    Promise.all(chunks(players.map((player) => player.id!).filter(Boolean)).map(getPlayersByIds)).then((rows) => rows.flat()),
    matches.length ? getMatchesByLeagueSeason(matches[0].league_id, matches[0].season_id) : Promise.resolve([]),
  ]);
  const existingTeamsById = new Map(existingTeams.map((team) => [team.id, team]));
  const existingPlayersById = new Map(existingPlayers.map((player) => [player.id, player]));
  const existingMatchesByExternalId = new Map(existingMatches.filter((match) => match.sport_id === sportId && match.external_id).map((match) => [match.external_id!, match]));
  const teamsToWrite = teams.filter((team) => !isUnchanged(existingTeamsById.get(team.id!), team));
  const playersToWrite = players.filter((player) => !isUnchanged(existingPlayersById.get(player.id!), player));
  const matchesToWrite = matches.filter((match) => !isUnchanged(existingMatchesByExternalId.get(match.external_id!), match));
  if (teamsToWrite.length) {
    const saved = await db.bulkUpsert("teams", teamsToWrite, "id");
    if (saved.error) throw saved.error;
    result.insertedTeams = teamsToWrite.filter((team) => !existingTeamsById.has(team.id!)).length;
    result.updatedTeams = teamsToWrite.length - result.insertedTeams;
  }
  if (playersToWrite.length) {
    const saved = await db.bulkUpsert("players", playersToWrite, "id");
    if (saved.error) throw saved.error;
    result.insertedPlayers = playersToWrite.filter((player) => !existingPlayersById.has(player.id!)).length;
    result.updatedPlayers = playersToWrite.length - result.insertedPlayers;
  }
  if (matchesToWrite.length) {
    const saved = await db.bulkUpsert("matches", matchesToWrite, "id");
    if (saved.error) throw saved.error;
    result.insertedMatches = matchesToWrite.filter((match) => !existingMatchesByExternalId.has(match.external_id!)).length;
    result.updatedMatches = matchesToWrite.length - result.insertedMatches;
  }

  if (statsBatch.length > 0) {
    const saved = await bulkUpsertPlayerStats(statsBatch);
    result.insertedStats = saved.length;
  }

  return result;
}
