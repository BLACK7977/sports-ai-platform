import "@/lib/config/env";
import { ensureDbReady } from "@/lib/db/client";
import type { Player, PlayerInsert } from "@/types/db/tables";

export async function getAllPlayers(): Promise<Player[]> {
  const db = await ensureDbReady();
  const { data } = await db.from<Player>("players").order("full_name", "asc").select();
  return data;
}

export async function getPlayerById(id: string): Promise<Player | null> {
  const db = await ensureDbReady();
  const { data } = await db.from<Player>("players").eq("id", id).maybeSingle();
  return data;
}

export async function getPlayersByTeamId(teamId: string): Promise<Player[]> {
  const db = await ensureDbReady();
  const { data } = await db
    .from<Player>("players")
    .eq("team_id", teamId)
    .order("jersey_number", "asc")
    .select();
  return data;
}

/** Keeps competition roster reads to one query instead of one per team. */
export async function getPlayersByTeamIds(teamIds: string[]): Promise<Player[]> {
  if (teamIds.length === 0) return [];
  const db = await ensureDbReady();
  const { data } = await db
    .from<Player>("players")
    .in("team_id", teamIds)
    .order("jersey_number", "asc")
    .select();
  return data;
}

export async function getPlayersByIds(ids: string[]): Promise<Player[]> {
  if (ids.length === 0) return [];
  const db = await ensureDbReady();
  const { data } = await db.from<Player>("players").in("id", ids).select();
  return data;
}

export async function upsertPlayer(row: PlayerInsert): Promise<Player | null> {
  const db = await ensureDbReady();
  const r = await db.upsert("players", row, "id");
  if (r.error) throw r.error;
  return (r.data as Player | null) ?? null;
}

export async function countPlayers(): Promise<number> {
  const db = await ensureDbReady();
  return await db.count("players");
}
