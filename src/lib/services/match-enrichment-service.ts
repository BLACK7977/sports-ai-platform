import "server-only";
import { SportmonksClient } from "@/sports/soccer/data-sources/sportmonks-client";
import { normalizeMetadata, normalizeStatistics, normalizeEvents, normalizeLineups } from "@/sports/soccer/data-sources/sportmonks-enrichment-normalizers";
import { upsertMatchMetadata, getMatchMetadata } from "@/lib/db/repositories/match-metadata-repo";
import { replaceMatchStatisticsSnapshot, getMatchStatistics } from "@/lib/db/repositories/match-statistics-repo";
import { replaceMatchEventsSnapshot, getMatchEvents } from "@/lib/db/repositories/match-events-repo";
import { replaceMatchLineupsSnapshot, getMatchLineups } from "@/lib/db/repositories/match-lineups-repo";
import { resolveTeamIds, resolvePlayerIds } from "@/lib/db/repositories/entity-resolution";
import type { MatchMetadata, MatchStatistic, MatchEvent, MatchLineup, MatchMetadataInsert, MatchStatisticInsert, MatchEventInsert, MatchLineupInsert } from "@/types/db/tables";

export type MatchEnrichment = {
  metadata: MatchMetadata | null;
  statistics: MatchStatistic[];
  events: MatchEvent[];
  lineups: MatchLineup[];
};

export type EnrichmentDeps = {
  fetchFixtureEnrichment: (fixtureId: number) => Promise<Record<string, unknown>>;
  metadataRepo: {
    upsert: (metadata: MatchMetadataInsert) => Promise<MatchMetadata | null>;
    get: (matchId: string) => Promise<MatchMetadata | null>;
  };
  statisticsRepo: {
    replaceSnapshot: (matchId: string, provider: string, rows: MatchStatisticInsert[], forceReconcile: boolean) => Promise<void>;
    get: (matchId: string) => Promise<MatchStatistic[]>;
  };
  eventsRepo: {
    replaceSnapshot: (matchId: string, provider: string, rows: MatchEventInsert[], forceReconcile: boolean) => Promise<void>;
    get: (matchId: string) => Promise<MatchEvent[]>;
  };
  lineupsRepo: {
    replaceSnapshot: (matchId: string, provider: string, rows: MatchLineupInsert[], forceReconcile: boolean) => Promise<void>;
    get: (matchId: string) => Promise<MatchLineup[]>;
  };
  entityResolver: {
    resolveTeamIds: (provider: string, ids: Array<string | null | undefined>) => Promise<Map<string, string | null>>;
    resolvePlayerIds: (provider: string, ids: Array<string | null | undefined>) => Promise<Map<string, string | null>>;
  };
};

function isValidEmptyArray(raw: unknown): boolean {
  return Array.isArray(raw) && raw.length === 0;
}

function isNonEmptyArray(raw: unknown): boolean {
  return Array.isArray(raw) && raw.length > 0;
}

function eventContext(event: MatchEventInsert): Record<string, unknown> {
  const value = event.sport_specific;
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function relatedProviderPlayerId(event: MatchEventInsert): string | null {
  const value = eventContext(event).related_player_provider_id;
  return typeof value === "string" && value.trim() ? value : null;
}

function createDefaultDeps(): EnrichmentDeps {
  const client = new SportmonksClient();
  return {
    fetchFixtureEnrichment: (fixtureId: number) => client.getFixtureDetail(fixtureId) as Promise<Record<string, unknown>>,
    metadataRepo: {
      upsert: upsertMatchMetadata,
      get: getMatchMetadata,
    },
    statisticsRepo: {
      replaceSnapshot: replaceMatchStatisticsSnapshot,
      get: getMatchStatistics,
    },
    eventsRepo: {
      replaceSnapshot: replaceMatchEventsSnapshot,
      get: getMatchEvents,
    },
    lineupsRepo: {
      replaceSnapshot: replaceMatchLineupsSnapshot,
      get: getMatchLineups,
    },
    entityResolver: {
      resolveTeamIds,
      resolvePlayerIds,
    },
  };
}

/**
 * Enrich a single match from Sportmonks fixture detail.
 * Uses reconciliation semantics: upsert current rows, then remove stale
 * provider-owned rows. Only deletes AFTER complete valid snapshot is parsed.
 * If any step fails, the error propagates and the caller sees partial state.
 */
export async function enrichMatchFromSportmonks(
  matchId: string,
  sportmonksFixtureId: number,
  deps?: EnrichmentDeps,
): Promise<MatchEnrichment> {
  const d = deps ?? createDefaultDeps();
  const PROVIDER = "sportmonks";

  const fixture = await d.fetchFixtureEnrichment(sportmonksFixtureId);

  const metadata = normalizeMetadata(matchId, fixture, PROVIDER);
  const rawStatistics = fixture.statistics as unknown;
  const rawEvents = fixture.events as unknown;
  const rawLineups = fixture.lineups as unknown;

  const statistics = normalizeStatistics(matchId, rawStatistics as unknown[], PROVIDER);
  const events = normalizeEvents(matchId, rawEvents as unknown[], PROVIDER);
  const lineups = normalizeLineups(matchId, rawLineups as unknown[], PROVIDER);

  // Compute forceReconcile: authoritative empty when source was a valid [] (not absent/malformed)
  const statsForceReconcile = isValidEmptyArray(rawStatistics);
  const eventsForceReconcile = isValidEmptyArray(rawEvents);
  const lineupsForceReconcile = isValidEmptyArray(rawLineups);

  // Write metadata (single-row upsert, no reconciliation needed)
  const metaResult = await d.metadataRepo.upsert(metadata);

  // Resolve provider IDs to internal entity IDs
  const providerTeamIds = [...new Set([
    ...statistics.map((s) => s.provider_participant_id),
    ...events.map((e) => e.provider_team_id),
    ...lineups.map((l) => l.provider_team_id),
  ])];
  const providerPlayerIds = [...new Set([
    ...events.map((e) => e.provider_player_id),
    ...events.map(relatedProviderPlayerId),
    ...lineups.map((l) => l.provider_player_id),
  ])];

  const [teamIdMap, playerIdMap] = await Promise.all([
    d.entityResolver.resolveTeamIds(PROVIDER, providerTeamIds),
    d.entityResolver.resolvePlayerIds(PROVIDER, providerPlayerIds),
  ]);

  // Hydrate internal IDs on normalized rows
  for (const s of statistics) {
    if (s.provider_participant_id) s.team_id = teamIdMap.get(s.provider_participant_id) ?? null;
  }
  for (const e of events) {
    if (e.provider_team_id) e.team_id = teamIdMap.get(e.provider_team_id) ?? null;
    if (e.provider_player_id) e.player_id = playerIdMap.get(e.provider_player_id) ?? null;
    const relatedProviderId = relatedProviderPlayerId(e);
    if (relatedProviderId) {
      const context = eventContext(e);
      const relatedInternalId = playerIdMap.get(relatedProviderId) ?? null;
      if (relatedInternalId) context.related_player_id = relatedInternalId;
      e.sport_specific = context;
      // Sportmonks exposes the goal's second player as the structured related
      // player. Store the resolved relation in the dedicated assist field.
      if (e.event_type?.toUpperCase() === "GOAL") e.assist_player_id = relatedInternalId;
    }
  }
  for (const l of lineups) {
    if (l.provider_team_id) l.team_id = teamIdMap.get(l.provider_team_id) ?? null;
    if (l.provider_player_id) l.player_id = playerIdMap.get(l.provider_player_id) ?? null;
  }

  // Reconciliation: upsert then delete stale rows per provider
  await Promise.all([
    d.statisticsRepo.replaceSnapshot(matchId, PROVIDER, statistics, statsForceReconcile),
    d.eventsRepo.replaceSnapshot(matchId, PROVIDER, events, eventsForceReconcile),
    d.lineupsRepo.replaceSnapshot(matchId, PROVIDER, lineups, lineupsForceReconcile),
  ]);

  // Return the persisted data from DB for consistency
  const [persistedStats, persistedEvents, persistedLineups] = await Promise.all([
    d.statisticsRepo.get(matchId),
    d.eventsRepo.get(matchId),
    d.lineupsRepo.get(matchId),
  ]);

  return {
    metadata: metaResult,
    statistics: persistedStats,
    events: persistedEvents,
    lineups: persistedLineups,
  };
}

/**
 * Fetch enrichment data from DB (no API call).
 * Used by match detail page to display enrichment.
 */
export async function getEnrichment(matchId: string): Promise<MatchEnrichment> {
  const d = createDefaultDeps();
  const [metadata, statistics, events, lineups] = await Promise.all([
    d.metadataRepo.get(matchId),
    d.statisticsRepo.get(matchId),
    d.eventsRepo.get(matchId),
    d.lineupsRepo.get(matchId),
  ]);
  return { metadata, statistics, events, lineups };
}
