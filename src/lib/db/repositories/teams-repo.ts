import "@/lib/config/env";
import { ensureDbReady } from "@/lib/db/client";
import type { Team, TeamInsert } from "@/types/db/tables";

export async function getAllTeams(): Promise<Team[]> {
  const db = await ensureDbReady();
  const { data } = await db.from<Team>("teams").order("name", "asc").select();
  return data;
}

export async function getTeamById(id: string): Promise<Team | null> {
  const db = await ensureDbReady();
  const { data } = await db.from<Team>("teams").eq("id", id).maybeSingle();
  return data;
}

export async function getTeamsByLeagueId(leagueId: string): Promise<Team[]> {
  const db = await ensureDbReady();
  const { data } = await db
    .from<Team>("teams")
    .eq("league_id", leagueId)
    .order("name", "asc")
    .select();
  return data;
}

export async function getTeamsByIds(ids: string[]): Promise<Team[]> {
  if (ids.length === 0) return [];
  const db = await ensureDbReady();
  const { data } = await db.from<Team>("teams").in("id", ids).select();
  return data;
}

export async function upsertTeam(row: TeamInsert): Promise<Team | null> {
  const db = await ensureDbReady();
  const r = await db.upsert("teams", row, "id");
  return (r.data as Team | null) ?? null;
}

export async function countTeams(): Promise<number> {
  const db = await ensureDbReady();
  return await db.count("teams");
}
