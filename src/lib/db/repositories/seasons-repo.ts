import "@/lib/config/env";
import { ensureDbReady } from "@/lib/db/client";
import type { Season, SeasonInsert } from "@/types/db/tables";

export async function getAllSeasons(): Promise<Season[]> {
  const db = await ensureDbReady();
  const { data } = await db.from<Season>("seasons").order("start_date", "desc").select();
  return data;
}

export async function getSeasonById(id: string): Promise<Season | null> {
  const db = await ensureDbReady();
  const { data } = await db.from<Season>("seasons").eq("id", id).maybeSingle();
  return data;
}

export async function getSeasonsByLeagueId(leagueId: string): Promise<Season[]> {
  const db = await ensureDbReady();
  const { data } = await db
    .from<Season>("seasons")
    .eq("league_id", leagueId)
    .order("start_date", "desc")
    .select();
  return data;
}

export async function getCurrentSeason(leagueId: string): Promise<Season | null> {
  const db = await ensureDbReady();
  const { data } = await db
    .from<Season>("seasons")
    .eq("league_id", leagueId)
    .eq("is_current", true as unknown as boolean)
    .maybeSingle();
  return data;
}

export async function upsertSeason(row: SeasonInsert): Promise<Season | null> {
  const db = await ensureDbReady();
  const r = await db.upsert("seasons", row, "id");
  return (r.data as Season | null) ?? null;
}

export async function countSeasons(): Promise<number> {
  const db = await ensureDbReady();
  return await db.count("seasons");
}
