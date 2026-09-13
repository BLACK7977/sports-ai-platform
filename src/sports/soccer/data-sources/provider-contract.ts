import type { Jsonb } from "@/types/db/tables";

/** A stable, namespaced identity prevents provider ids from colliding. */
export function providerExternalId(
  provider: string,
  entity: "competition" | "season" | "team" | "player" | "match",
  externalId: string | number,
): string {
  return `${provider}:${entity}:${externalId}`;
}

export function providerInternalId(
  provider: string,
  entity: "team" | "player",
  externalId: string | number,
): string {
  return `${provider}-${entity}-${encodeURIComponent(String(externalId))}`;
}

export type SoccerProviderSyncMetadata = {
  provider: string;
  external_id: string | number;
  last_synced_at: string;
};

/**
 * Storage-compatible provenance until dedicated columns are approved.
 * Existing JSONB sport_specific is deliberately extended rather than changing
 * the public schema during provider preparation.
 */
export function withProviderMetadata(
  sportSpecific: Jsonb | undefined,
  metadata: SoccerProviderSyncMetadata,
): Jsonb {
  return { ...(sportSpecific ?? {}), source: metadata };
}

export interface SoccerCompetitionTarget {
  leagueId: string;
  seasonId: string;
  displayName: string;
  country: string;
}

export interface SoccerProviderRequirements {
  needsCredential: boolean;
  requiredEntities: Array<"competition" | "season" | "team" | "player" | "match" | "player_match_stats">;
}
