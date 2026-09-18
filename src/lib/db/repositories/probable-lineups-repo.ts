import "@/lib/config/env";
import { ensureDbReady } from "@/lib/db/client";
import type {
  ProbableLineupPlayer,
  ProbableLineupRun,
} from "@/types/db/tables";

/**
 * SSR read for canonical probable lineups of a match (offline-safe via the
 * DbClient layer; in-memory store includes both tables).
 *
 * Defensive: if the storage layer errors (e.g. the probable-lineup tables do
 * not exist yet in a cloud project because migration 012 has not been
 * applied), it degrades to an empty result so the page still renders.
 */
export async function getProbableLineupForMatch(matchId: string): Promise<{
  runs: ProbableLineupRun[];
  players: ProbableLineupPlayer[];
}> {
  const db = await ensureDbReady();
  const { data: runs, error: runsError } = await db
    .from<ProbableLineupRun>("probable_lineup_runs")
    .eq("match_id", matchId)
    .select();
  if (runsError || !runs || runs.length === 0) return { runs: [], players: [] };
  const runIds = runs.map((run) => run.id);
  const { data: players } = await db
    .from<ProbableLineupPlayer>("probable_lineup_players")
    .in("run_id", runIds)
    .select();
  return { runs, players: players ?? [] };
}