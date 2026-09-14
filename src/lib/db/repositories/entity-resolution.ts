import "@/lib/config/env";
import { ensureDbReady, type DbClient } from "@/lib/db/client";
import { providerExternalId } from "@/sports/soccer/data-sources/provider-contract";
import type { Team, Player } from "@/types/db/tables";

const teamCache = new Map<string, string>();
const playerCache = new Map<string, string>();

// Test-only: allow injecting a mock DbClient
let _testDbClient: DbClient | null = null;

export function _setTestDbClient(client: DbClient | null): void {
  _testDbClient = client;
}

async function getDb(): Promise<DbClient> {
  if (_testDbClient) return _testDbClient;
  return ensureDbReady();
}

function teamCacheKey(provider: string, providerTeamId: string): string {
  return `${provider}:${providerTeamId}`;
}

function playerCacheKey(provider: string, providerPlayerId: string): string {
  return `${provider}:${providerPlayerId}`;
}

/**
 * Resolve a provider team ID to an internal team ID using the canonical
 * namespaced external_id (e.g. "sportmonks:team:86").
 * Returns null if no mapping exists. Never parses digits from internal IDs.
 * Throws if the DB query itself fails.
 */
export async function resolveInternalTeamId(
  provider: string,
  providerTeamId: string | null | undefined,
): Promise<string | null> {
  if (!providerTeamId) return null;
  const cacheKey = teamCacheKey(provider, providerTeamId);
  if (teamCache.has(cacheKey)) return teamCache.get(cacheKey)!;

  const db = await getDb();
  const canonicalExternalId = providerExternalId(provider, "team", providerTeamId);
  const { data, error } = await db.from<Team>("teams")
    .eq("external_id", canonicalExternalId as Team["external_id"])
    .maybeSingle();
  if (error) throw new Error(`resolveInternalTeamId: ${error.message}`);
  const result = data?.id ?? null;
  if (result) teamCache.set(cacheKey, result);
  return result;
}

/**
 * Resolve a provider player ID to an internal player ID using the canonical
 * namespaced external_id (e.g. "sportmonks:player:101").
 * Returns null if no mapping exists. Never parses digits from internal IDs.
 * Throws if the DB query itself fails.
 */
export async function resolveInternalPlayerId(
  provider: string,
  providerPlayerId: string | null | undefined,
): Promise<string | null> {
  if (!providerPlayerId) return null;
  const cacheKey = playerCacheKey(provider, providerPlayerId);
  if (playerCache.has(cacheKey)) return playerCache.get(cacheKey)!;

  const db = await getDb();
  const canonicalExternalId = providerExternalId(provider, "player", providerPlayerId);
  const { data, error } = await db.from<Player>("players")
    .eq("external_id", canonicalExternalId as Player["external_id"])
    .maybeSingle();
  if (error) throw new Error(`resolveInternalPlayerId: ${error.message}`);
  const result = data?.id ?? null;
  if (result) playerCache.set(cacheKey, result);
  return result;
}

/**
 * Batch-resolve provider team IDs to internal IDs in a single query.
 * Returns Map<providerId, internalId | null>.
 * Throws if the DB query itself fails.
 */
export async function resolveTeamIds(
  provider: string,
  providerTeamIds: Array<string | null | undefined>,
): Promise<Map<string, string | null>> {
  const unique = [...new Set(providerTeamIds.filter(Boolean) as string[])];
  const result = new Map<string, string | null>();

  if (unique.length === 0) return result;

  const canonicalIds = unique.map((pid) => providerExternalId(provider, "team", pid));

  const db = await getDb();
  const { data: teams, error } = await db.from<Team>("teams")
    .in("external_id", canonicalIds as Team["external_id"][])
    .select();
  if (error) throw new Error(`resolveTeamIds: ${error.message}`);

  const teamByExternalId = new Map<string, string>();
  for (const t of teams) {
    if (t.external_id) teamByExternalId.set(t.external_id, t.id);
  }

  for (const pid of unique) {
    const canonical = providerExternalId(provider, "team", pid);
    const internalId = teamByExternalId.get(canonical) ?? null;
    result.set(pid, internalId);
    if (internalId) teamCache.set(teamCacheKey(provider, pid), internalId);
  }

  return result;
}

/**
 * Batch-resolve provider player IDs to internal IDs in a single query.
 * Returns Map<providerId, internalId | null>.
 * Throws if the DB query itself fails.
 */
export async function resolvePlayerIds(
  provider: string,
  providerPlayerIds: Array<string | null | undefined>,
): Promise<Map<string, string | null>> {
  const unique = [...new Set(providerPlayerIds.filter(Boolean) as string[])];
  const result = new Map<string, string | null>();

  if (unique.length === 0) return result;

  const canonicalIds = unique.map((pid) => providerExternalId(provider, "player", pid));

  const db = await getDb();
  const { data: players, error } = await db.from<Player>("players")
    .in("external_id", canonicalIds as Player["external_id"][])
    .select();
  if (error) throw new Error(`resolvePlayerIds: ${error.message}`);

  const playerByExternalId = new Map<string, string>();
  for (const p of players) {
    if (p.external_id) playerByExternalId.set(p.external_id, p.id);
  }

  for (const pid of unique) {
    const canonical = providerExternalId(provider, "player", pid);
    const internalId = playerByExternalId.get(canonical) ?? null;
    result.set(pid, internalId);
    if (internalId) playerCache.set(playerCacheKey(provider, pid), internalId);
  }

  return result;
}

/** Clear caches (for testing). */
export function _clearResolutionCaches(): void {
  teamCache.clear();
  playerCache.clear();
}