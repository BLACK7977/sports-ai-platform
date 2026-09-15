import "server-only";
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getEnv, getSupabaseProjectUrl } from "@/lib/config/env";
import { BACKFILL_SCOPE, BackfillError, backfillMatchSchema, type BackfillMatch } from "@/lib/services/lineup-backfill-service";

const MATCH_FIELDS = "id,sport_id,league_id,season_id,status,provider,external_id,match_date";
const ENRICHMENT_TABLES = ["match_metadata", "match_statistics", "match_events", "match_lineups"] as const;
const presenceSchema = z.array(z.object({ match_id: z.string() }));
const PAGE_SIZE = 500;

/** SELECT-only adapter. Paginate presence too: lineup rows easily exceed PostgREST's 1000-row cap. */
export function lineupBackfillReader(client: SupabaseClient) {
  async function readFinished(): Promise<BackfillMatch[]> {
    const rows: BackfillMatch[] = [];
    for (let start = 0; ; start += PAGE_SIZE) {
      const { data, error } = await client.from("matches").select(MATCH_FIELDS)
        .eq("sport_id", "soccer").eq("league_id", BACKFILL_SCOPE.leagueId)
        .eq("season_id", BACKFILL_SCOPE.seasonId).eq("status", "finished")
        .order("match_date").order("id").range(start, start + PAGE_SIZE - 1);
      if (error) throw new BackfillError("DB_READ_FAILED");
      const page = backfillMatchSchema.array().safeParse(data);
      if (!page.success) throw new BackfillError("INVALID_DB_MATCH_ROWS");
      rows.push(...page.data);
      if (page.data.length < PAGE_SIZE) return rows;
    }
  }
  async function readMatch(id: string): Promise<BackfillMatch | null> {
    const { data, error } = await client.from("matches").select(MATCH_FIELDS).eq("id", id).maybeSingle();
    if (error) throw new BackfillError("DB_READ_FAILED");
    if (data === null) return null;
    const parsed = backfillMatchSchema.safeParse(data);
    if (!parsed.success) throw new BackfillError("INVALID_DB_MATCH_ROW");
    return parsed.data;
  }
  async function readPresence(ids: string[]): Promise<Set<string>> {
    const present = new Set<string>();
    for (let offset = 0; offset < ids.length; offset += 50) {
      const batch = ids.slice(offset, offset + 50);
      // Parallel DB reads only; provider execution is strictly sequential in the runner.
      const groups = await Promise.all(ENRICHMENT_TABLES.map(async table => {
        const found: string[] = [];
        for (let start = 0; ; start += PAGE_SIZE) {
          const { data, error } = await client.from(table).select("match_id").in("match_id", batch)
            .order(table === "match_metadata" ? "match_id" : "id")
            .range(start, start + PAGE_SIZE - 1);
          if (error) throw new BackfillError("DB_ENRICHMENT_READ_FAILED");
          const page = presenceSchema.safeParse(data);
          if (!page.success) throw new BackfillError("INVALID_DB_ENRICHMENT_ROWS");
          found.push(...page.data.map(row => row.match_id));
          if (page.data.length < PAGE_SIZE) return found;
        }
      }));
      for (const group of groups) for (const id of group) present.add(id);
    }
    return present;
  }
  return { readFinished, readMatch, readPresence, hasEnrichment: async (id: string) => (await readPresence([id])).has(id) };
}

export function createLineupBackfillReader() {
  const env = getEnv();
  const url = getSupabaseProjectUrl();
  if (env.ENABLE_OFFLINE_MODE || !url) throw new BackfillError("SUPABASE_REQUIRED_NO_OFFLINE_FALLBACK");
  const origin = new URL(url).origin;
  const client = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => {
      const method = init?.method?.toUpperCase() ?? "GET";
      const target = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (!["GET", "HEAD"].includes(method) || target.origin !== origin || !target.pathname.startsWith("/rest/v1/")) {
        throw new BackfillError("READ_ONLY_TRANSPORT_GUARD");
      }
      return fetch(input, { ...init, signal: AbortSignal.timeout(30000) });
    } },
  });
  return { ...lineupBackfillReader(client), project: createHash("sha256").update(origin).digest("hex") };
}
