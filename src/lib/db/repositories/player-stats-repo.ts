import "@/lib/config/env";
import { ensureDbReady } from "@/lib/db/client";
import type {
  PlayerMatchStats,
  PlayerMatchStatsInsert,
} from "@/types/db/tables";

export async function getAllStats(): Promise<PlayerMatchStats[]> {
  const db = await ensureDbReady();
  const { data } = await db.from<PlayerMatchStats>("player_match_stats").select();
  return data;
}

export async function getStatsById(id: string): Promise<PlayerMatchStats | null> {
  const db = await ensureDbReady();
  const { data } = await db
    .from<PlayerMatchStats>("player_match_stats")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function getStatsByMatchId(matchId: string): Promise<PlayerMatchStats[]> {
  const db = await ensureDbReady();
  const { data } = await db
    .from<PlayerMatchStats>("player_match_stats")
    .eq("match_id", matchId)
    .order("minutes_played", "desc")
    .select();
  return data;
}

export async function getStatsByPlayerId(playerId: string): Promise<PlayerMatchStats[]> {
  const db = await ensureDbReady();
  const { data } = await db
    .from<PlayerMatchStats>("player_match_stats")
    .eq("player_id", playerId)
    .select();
  return data;
}

export async function getStatsByTeamIdMatchId(
  teamId: string,
  matchId: string,
): Promise<PlayerMatchStats[]> {
  const db = await ensureDbReady();
  const { data } = await db
    .from<PlayerMatchStats>("player_match_stats")
    .eq("team_id", teamId)
    .eq("match_id", matchId)
    .order("minutes_played", "desc")
    .select();
  return data;
}

export async function upsertPlayerStats(
  row: PlayerMatchStatsInsert,
): Promise<PlayerMatchStats | null> {
  const db = await ensureDbReady();
  const r = await db.upsert("player_match_stats", row, "id");
  return (r.data as PlayerMatchStats | null) ?? null;
}

export async function bulkUpsertPlayerStats(
  rows: PlayerMatchStatsInsert[],
): Promise<PlayerMatchStats[]> {
  const db = await ensureDbReady();
  const r = await db.bulkUpsert("player_match_stats", rows, "id");
  return (r.data as PlayerMatchStats[]) ?? [];
}

export async function countPlayerStats(): Promise<number> {
  const db = await ensureDbReady();
  return await db.count("player_match_stats");
}
