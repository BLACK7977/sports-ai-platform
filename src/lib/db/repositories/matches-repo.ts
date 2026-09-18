import "@/lib/config/env";
import { ensureDbReady } from "@/lib/db/client";
import type { Match, MatchInsert, MatchStatus } from "@/types/db/tables";

/**
 * Typed payload for updating only match result/status fields.
 * Allows explicit null for home_score/away_score (nullable DB columns).
 * The repository accepts this shape directly without type assertions.
 */
export type MatchResultUpdate = Pick<Match, "id" | "sport_id" | "league_id" | "season_id" | "home_team_id" | "away_team_id" | "match_date" | "external_id" | "provider" | "last_synced_at" | "sport_specific"> & {
  status: MatchStatus;
  home_score: number | null;
  away_score: number | null;
};

export async function getAllMatches(): Promise<Match[]> {
  const db = await ensureDbReady();
  const { data } = await db.from<Match>("matches").order("match_date", "desc").select();
  return data;
}

export async function getMatchById(id: string): Promise<Match | null> {
  const db = await ensureDbReady();
  const { data } = await db.from<Match>("matches").eq("id", id).maybeSingle();
  return data;
}

export async function getMatchesByIds(ids: string[]): Promise<Match[]> {
  if (ids.length === 0) return [];
  const db = await ensureDbReady();
  const { data } = await db.from<Match>("matches").in("id", ids).select();
  return data;
}

export async function getMatchByExternalId(
  sportId: string,
  externalId: string,
): Promise<Match | null> {
  const db = await ensureDbReady();
  const { data } = await db
    .from<Match>("matches")
    .eq("sport_id", sportId)
    .eq("external_id", externalId)
    .maybeSingle();
  return data;
}

export async function getMatchesByLeagueSeason(
  leagueId: string,
  seasonId: string,
): Promise<Match[]> {
  const db = await ensureDbReady();
  const { data } = await db
    .from<Match>("matches")
    .eq("league_id", leagueId)
    .eq("season_id", seasonId)
    .order("match_date", "desc")
    .select();
  return data;
}

/** Stable, collision-free key for a persisted league/season pair. */
export function leagueSeasonKey(leagueId: string, seasonId: string): string {
  return JSON.stringify([leagueId, seasonId]);
}

export async function getMatchesByLeagueSeasons(
  pairs: Array<{ leagueId: string; seasonId: string }>,
): Promise<Map<string, Match[]>> {
  if (pairs.length === 0) return new Map();
  const db = await ensureDbReady();
  // Build OR filter for multiple (league_id, season_id) pairs
  // Supabase doesn't support direct tuple IN, so we use OR with multiple conditions
  const orFilters = pairs.map(
    (p) => `and(league_id.eq.${p.leagueId},season_id.eq.${p.seasonId})`
  );
  const { data } = await db
    .from<Match>("matches")
    .or(orFilters.join(","))
    .order("match_date", "desc")
    .select();
  const byPair = new Map<string, Match[]>();
  for (const m of data) {
    const key = leagueSeasonKey(m.league_id, m.season_id);
    const arr = byPair.get(key) ?? [];
    arr.push(m);
    byPair.set(key, arr);
  }
  return byPair;
}

/** Date-bounded match read used by the Match Center's time views. */
export async function getMatchesByLeagueSeasonDateRange(
  leagueId: string,
  seasonId: string,
  from: string,
  to: string,
): Promise<Match[]> {
  const db = await ensureDbReady();
  const { data } = await db
    .from<Match>("matches")
    .eq("league_id", leagueId)
    .eq("season_id", seasonId)
    .gte("match_date", from)
    .lte("match_date", to)
    .order("match_date", "asc")
    .select();
  return data;
}

export async function getMatchesByLeagueSeasonStatuses(
  leagueId: string,
  seasonId: string,
  statuses: Match["status"][],
): Promise<Match[]> {
  if (statuses.length === 0) return [];
  const db = await ensureDbReady();
  const { data } = await db
    .from<Match>("matches")
    .eq("league_id", leagueId)
    .eq("season_id", seasonId)
    .in("status", statuses)
    .order("match_date", "asc")
    .select();
  return data;
}

export function isFutureScheduledMatch(match: Pick<Match, "status" | "match_date">, nowMs: number): boolean {
  const kickoffMs = Date.parse(match.match_date);
  return match.status === "scheduled" && Number.isFinite(kickoffMs) && kickoffMs > nowMs;
}

export async function getUpcomingMatchesByLeagueSeason(
  leagueId: string,
  seasonId: string,
  nowMs: number,
  horizonMs?: number,
  limit?: number,
): Promise<Match[]> {
  const db = await ensureDbReady();
  let query = db.from<Match>("matches")
    .eq("league_id", leagueId)
    .eq("season_id", seasonId)
    .eq("status", "scheduled")
    .gte("match_date", new Date(nowMs + 1).toISOString());
  if (horizonMs !== undefined) query = query.lte("match_date", new Date(nowMs + horizonMs).toISOString());
  const { data, error } = await query.order("match_date", "asc").select();
  if (error) throw error;
  const stable = data
    .filter((match) => isFutureScheduledMatch(match, nowMs))
    .sort((a, b) => a.match_date.localeCompare(b.match_date) || a.id.localeCompare(b.id));
  return limit === undefined ? stable : stable.slice(0, limit);
}

export async function getMatchesByTeamId(teamId: string): Promise<Match[]> {
  const db = await ensureDbReady();
  const { data } = await db
    .from<Match>("matches")
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .order("match_date", "desc")
    .select();
  return data;
}

export async function getMatchesBySportId(sportId: string): Promise<Match[]> {
  const db = await ensureDbReady();
  const { data } = await db
    .from<Match>("matches")
    .eq("sport_id", sportId)
    .order("match_date", "desc")
    .select();
  return data;
}

export async function upsertMatch(row: MatchInsert): Promise<Match | null> {
  const db = await ensureDbReady();
  const r = await db.upsert("matches", row, "id");
  return (r.data as Match | null) ?? null;
}

/**
 * Update match result/status with explicit null score support.
 * Accepts MatchResultUpdate directly — no type assertions needed.
 * The DB columns home_score and away_score are nullable INTEGER,
 * and this function correctly persists null values.
 */
export async function updateMatchResult(row: MatchResultUpdate): Promise<Match | null> {
  const db = await ensureDbReady();
  const insertPayload: MatchInsert = {
    id: row.id,
    sport_id: row.sport_id,
    league_id: row.league_id,
    season_id: row.season_id,
    home_team_id: row.home_team_id,
    away_team_id: row.away_team_id,
    match_date: row.match_date,
    status: row.status,
    home_score: row.home_score,
    away_score: row.away_score,
    external_id: row.external_id,
    provider: row.provider,
    last_synced_at: row.last_synced_at,
    sport_specific: row.sport_specific,
  };
  const r = await db.upsert("matches", insertPayload, "id");
  return (r.data as Match | null) ?? null;
}

export async function upsertMatchByExternalId(
  sportId: string,
  externalId: string,
  row: MatchInsert,
): Promise<Match | null> {
  const db = await ensureDbReady();
  const existing = await getMatchByExternalId(sportId, externalId);
  if (existing) {
    const merged: MatchInsert = { ...row, id: existing.id };
    const r = await db.upsert("matches", merged, "id");
    if (r.error) throw r.error;
    return (r.data as Match | null) ?? null;
  }
  const r = await db.upsert(
    "matches",
    { ...row, external_id: externalId, sport_id: sportId },
    "id",
  );
  if (r.error) throw r.error;
  return (r.data as Match | null) ?? null;
}

export async function countMatches(): Promise<number> {
  const db = await ensureDbReady();
  return await db.count("matches");
}
