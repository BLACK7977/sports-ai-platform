import "@/lib/config/env";
import { ensureDbReady } from "@/lib/db/client";
import type { MatchStatistic, MatchStatisticInsert } from "@/types/db/tables";

const TABLE = "match_statistics" as const;

/**
 * Replace the full provider-owned statistics snapshot for a match.
 * Only deletes rows belonging to the given provider.
 * Safe: only deletes AFTER all new rows upsert successfully.
 *
 * @param forceReconcile - When true, deletes all provider rows even if normalized rows is empty.
 *                         Use when the source category was a valid empty array (authoritative empty).
 *                         When false and rows is empty, skips reconciliation (source was absent/malformed).
 */
export async function replaceMatchStatisticsSnapshot(
  matchId: string,
  provider: string,
  rows: MatchStatisticInsert[],
  forceReconcile = false,
): Promise<void> {
  const db = await ensureDbReady();

  if (rows.length > 0) {
    const { error: upsertErr } = await db.bulkUpsert(TABLE, rows as never[], "id");
    if (upsertErr) throw new Error(`[match-statistics] upsert failed for match ${matchId}: ${upsertErr.message}`);
  }

  const incomingIds = rows.map((r) => r.id).filter(Boolean) as string[];
  if (incomingIds.length > 0 || forceReconcile) {
    const { data: existing, error: fetchErr } = await db.from<MatchStatistic>(TABLE).eq("match_id", matchId as never).select();
    if (fetchErr) throw new Error(`[match-statistics] fetch stale failed for match ${matchId}: ${fetchErr.message}`);

    const providerRows = existing.filter((r) => r.provider === provider);
    if (incomingIds.length > 0) {
      const incomingSet = new Set(incomingIds);
      const staleIds = providerRows.filter((r) => !incomingSet.has(r.id)).map((r) => r.id);
      if (staleIds.length > 0) {
        const { error: delErr } = await db.from<MatchStatistic>(TABLE).in("id" as never, staleIds as never).delete();
        if (delErr) throw new Error(`[match-statistics] stale delete failed for match ${matchId}: ${delErr.message}`);
      }
    } else if (forceReconcile && providerRows.length > 0) {
      const staleIds = providerRows.map((r) => r.id);
      const { error: delErr } = await db.from<MatchStatistic>(TABLE).in("id" as never, staleIds as never).delete();
      if (delErr) throw new Error(`[match-statistics] empty-snapshot clear failed for match ${matchId}: ${delErr.message}`);
    }
  }
}

export async function getMatchStatistics(matchId: string): Promise<MatchStatistic[]> {
  const db = await ensureDbReady();
  const { data, error } = await db.from<MatchStatistic>(TABLE).eq("match_id", matchId as never).select();
  if (error) throw new Error(`[match-statistics] query failed for match ${matchId}: ${error.message}`);
  return data;
}
