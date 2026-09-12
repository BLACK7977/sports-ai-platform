import "@/lib/config/env";
import { ensureDbReady } from "@/lib/db/client";
import type { Match, MatchInsert } from "@/types/db/tables";

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

export async function getMatchesByTeamId(teamId: string): Promise<Match[]> {
  const db = await ensureDbReady();
  const { data } = await db.from<Match>("matches").order("match_date", "desc").select();
  return data.filter(
    (m) => m.home_team_id === teamId || m.away_team_id === teamId,
  );
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

export async function upsertMatchByExternalId(
  sportId: string,
  externalId: string,
  row: MatchInsert,
): Promise<Match | null> {
  const db = await ensureDbReady();
  const existing = await db
    .from<Match>("matches")
    .eq("sport_id", sportId)
    .eq("external_id", externalId)
    .maybeSingle();
  if (existing.data) {
    const merged: MatchInsert = { ...row, id: existing.data.id };
    const r = await db.upsert("matches", merged, "id");
    return (r.data as Match | null) ?? null;
  }
  const r = await db.upsert(
    "matches",
    { ...row, external_id: externalId, sport_id: sportId },
    "id",
  );
  return (r.data as Match | null) ?? null;
}

export async function countMatches(): Promise<number> {
  const db = await ensureDbReady();
  return await db.count("matches");
}
