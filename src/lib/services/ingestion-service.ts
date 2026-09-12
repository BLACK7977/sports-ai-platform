// Server-only enforcement
import "@/lib/config/env";
import { getSportOrThrow } from "@/lib/config/sports-registry";
import type { SportId } from "@/types/core/sport";
import { upsertMatchByExternalId } from "@/lib/db/repositories/matches-repo";
import { upsertTeam } from "@/lib/db/repositories/teams-repo";
import { upsertPlayer } from "@/lib/db/repositories/players-repo";
import { bulkUpsertPlayerStats } from "@/lib/db/repositories/player-stats-repo";
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
  insertedPlayers: number;
  insertedStats: number;
  errors: Array<{ matchExternalId: string; error: string }>;
}

export type MatchMapperOutput = {
  match: MatchInsert;
  teams?: TeamInsert[];
  players?: PlayerInsert[];
  stats?: PlayerMatchStatsInsert[];
  playerStats?: PlayerMatchStatsInsert[];
};

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
    insertedPlayers: 0,
    insertedStats: 0,
    errors: [],
  };

  const teamIdsSeen = new Set<string>();
  const playerIdsSeen = new Set<string>();
  const statsBatch: PlayerMatchStatsInsert[] = [];

  for (const dto of dtos) {
    try {
      const mapped = mapper.toDb(dto);
      const { match, teams, players, stats, playerStats } = mapped;
      const effectiveStats = stats ?? playerStats ?? [];

      const externalIdRaw =
        (match as unknown as { external_id?: string }).external_id ??
        match.id ??
        `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const extId = String(externalIdRaw);

      if (teams && Array.isArray(teams)) {
        for (const t of teams) {
          if (!t.id || teamIdsSeen.has(t.id)) continue;
          teamIdsSeen.add(t.id);
          const tSport: TeamInsert = {
            ...t,
            sport_id: sportId,
          };
          const saved = await upsertTeam(tSport);
          if (saved) result.insertedTeams++;
        }
      }

      if (players && Array.isArray(players)) {
        for (const p of players) {
          if (!p.id || playerIdsSeen.has(p.id)) continue;
          playerIdsSeen.add(p.id);
          const pSport: PlayerInsert = {
            ...p,
            sport_id: sportId,
          };
          const saved = await upsertPlayer(pSport);
          if (saved) result.insertedPlayers++;
        }
      }

      const upserted = await upsertMatchByExternalId(sportId, extId, match);
      if (upserted) {
        if (!match.id) result.insertedMatches++;
        else result.updatedMatches++;
      } else {
        result.insertedMatches++;
      }

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

  if (statsBatch.length > 0) {
    const saved = await bulkUpsertPlayerStats(statsBatch);
    result.insertedStats = saved.length;
  }

  return result;
}
