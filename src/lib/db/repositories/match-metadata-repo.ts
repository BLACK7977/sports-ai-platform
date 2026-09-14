import "@/lib/config/env";
import { ensureDbReady } from "@/lib/db/client";
import type { MatchMetadata, MatchMetadataInsert } from "@/types/db/tables";

const TABLE = "match_metadata" as const;

export async function upsertMatchMetadata(row: MatchMetadataInsert): Promise<MatchMetadata> {
  const db = await ensureDbReady();
  const r = await db.upsert(TABLE, row as never, "match_id");
  if (r.error) throw new Error(`[match-metadata] upsert failed for match ${row.match_id}: ${r.error.message}`);
  if (!r.data) throw new Error(`[match-metadata] upsert returned no data for match ${row.match_id}`);
  return r.data as MatchMetadata;
}

export async function getMatchMetadata(matchId: string): Promise<MatchMetadata | null> {
  const db = await ensureDbReady();
  const { data, error } = await db.from<MatchMetadata>(TABLE).eq("match_id", matchId).maybeSingle();
  if (error) throw new Error(`[match-metadata] query failed for match ${matchId}: ${error.message}`);
  return data;
}
