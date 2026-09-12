import "@/lib/config/env";
import { ensureDbReady } from "@/lib/db/client";
import type { Sport, SportInsert } from "@/types/db/tables";

export async function getAllSports(): Promise<Sport[]> {
  const db = await ensureDbReady();
  const { data } = await db.from<Sport>("sports").order("display_name", "asc").select();
  return data;
}

export async function getSportById(id: string): Promise<Sport | null> {
  const db = await ensureDbReady();
  const { data } = await db.from<Sport>("sports").eq("id", id).maybeSingle();
  return data;
}

export async function upsertSport(row: SportInsert): Promise<Sport | null> {
  const db = await ensureDbReady();
  const r = await db.upsert("sports", row, "id");
  return (r.data as Sport | null) ?? null;
}

export async function countSports(): Promise<number> {
  const db = await ensureDbReady();
  return await db.count("sports");
}
