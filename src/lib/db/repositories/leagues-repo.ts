import "@/lib/config/env";
import { ensureDbReady } from "@/lib/db/client";
import type { League, LeagueInsert } from "@/types/db/tables";

export async function getAllLeagues(): Promise<League[]> {
  const db = await ensureDbReady();
  const { data } = await db.from<League>("leagues").order("name", "asc").select();
  return data;
}

export async function getLeagueById(id: string): Promise<League | null> {
  const db = await ensureDbReady();
  const { data } = await db.from<League>("leagues").eq("id", id).maybeSingle();
  return data;
}

export async function getLeaguesBySportId(sportId: string): Promise<League[]> {
  const db = await ensureDbReady();
  const { data } = await db
    .from<League>("leagues")
    .eq("sport_id", sportId)
    .order("name", "asc")
    .select();
  return data;
}

export async function upsertLeague(row: LeagueInsert): Promise<League | null> {
  const db = await ensureDbReady();
  const r = await db.upsert("leagues", row, "id");
  return (r.data as League | null) ?? null;
}

export async function countLeagues(): Promise<number> {
  const db = await ensureDbReady();
  return await db.count("leagues");
}
