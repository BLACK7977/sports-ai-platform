// Server-only enforcement
import "@/lib/config/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Sport, League, Season, Team, Player, Match, PlayerMatchStats, SportInsert, LeagueInsert, SeasonInsert, TeamInsert, PlayerInsert, MatchInsert, PlayerMatchStatsInsert } from "@/types/db/tables";
import { getEnv } from "@/lib/config/env";

type Tables = { sports: Sport; leagues: League; seasons: Season; teams: Team; players: Player; matches: Match; player_match_stats: PlayerMatchStats; };
export type TableName = keyof Tables;
const TABLE_NAMES: TableName[] = ["sports","leagues","seasons","teams","players","matches","player_match_stats"];
type OrderDir = "asc" | "desc";
type AnyRow = Sport | League | Season | Team | Player | Match | PlayerMatchStats;
type AnyInsert = SportInsert | LeagueInsert | SeasonInsert | TeamInsert | PlayerInsert | MatchInsert | PlayerMatchStatsInsert;

export interface QueryBuilder<T> {
  eq<K extends keyof T>(key: K, value: T[K]): QueryBuilder<T>;
  in<K extends keyof T>(key: K, values: T[K][]): QueryBuilder<T>;
  gte<K extends keyof T>(key: K, value: T[K]): QueryBuilder<T>;
  lte<K extends keyof T>(key: K, value: T[K]): QueryBuilder<T>;
  order<K extends keyof T>(key: K, dir?: OrderDir): QueryBuilder<T>;
  limit(n: number): QueryBuilder<T>;
  select(): Promise<{ data: T[]; error: Error | null }>;
  maybeSingle(): Promise<{ data: T | null; error: Error | null }>;
  single(): Promise<{ data: T; error: Error | null }>;
}

export interface DbClient {
  init(): Promise<void>;
  isOffline(): boolean;
  from<T extends AnyRow>(table: TableName): QueryBuilder<T>;
  insert(table: TableName, row: AnyInsert): Promise<{ data: AnyRow | null; error: Error | null }>;
  upsert(table: TableName, row: AnyInsert, uniqueKey?: keyof AnyRow): Promise<{ data: AnyRow | null; error: Error | null }>;
  bulkUpsert(table: TableName, items: AnyInsert[], uniqueKey?: keyof AnyRow): Promise<{ data: AnyRow[]; error: Error | null }>;
  count(table: TableName): Promise<number>;
}

function buildQueryBuilder<T extends AnyRow>(
  sb: SupabaseClient, table: TableName): QueryBuilder<T> {
  type K = keyof T;
  const chain: Array<{op: "eq" | "in" | "gte" | "lte"; key: K; value: unknown}> = [];
  let orderKey: K | null = null;
  let orderDir: OrderDir = "asc";
  let limitN: number | null = null;

  function chainApply() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = sb.from(table as string);
    for (const c of chain) {
      if (c.op === "eq") q = q.eq(c.key as string, c.value);
      else if (c.op === "in") q = q.in(c.key as string, c.value);
      else if (c.op === "gte") q = q.gte(c.key as string, c.value);
      else if (c.op === "lte") q = q.lte(c.key as string, c.value);
    }
    if (orderKey) q = q.order(orderKey as string, { ascending: orderDir === "asc" });
    if (limitN !== null) q = q.limit(limitN);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return q as any;
  }

  const builder: QueryBuilder<T> = {
    eq: (k, v) => { chain.push({ op: "eq", key: k, value: v }); return builder; },
    in: (k, v) => { chain.push({ op: "in", key: k, value: v }); return builder; },
    gte: (k, v) => { chain.push({ op: "gte", key: k, value: v }); return builder; },
    lte: (k, v) => { chain.push({ op: "lte", key: k, value: v }); return builder; },
    order: (k, d = "asc") => { orderKey = k; orderDir = d; return builder; },
    limit: (n) => { limitN = n; return builder; },
    select: async () => {
      try {
        const { data, error } = await chainApply().select("*");
        if (error) return { data: [], error: new Error(error.message) };
        return { data: (data ?? []) as T[], error: null };
      } catch (err) {
        return { data: [], error: err instanceof Error ? err : new Error(String(err)) };
      }
    },
    maybeSingle: async () => {
      try {
        const { data, error } = await chainApply().select("*").limit(1).maybeSingle();
        if (error) return { data: null, error: new Error(error.message) };
        return { data: (data as T | null) ?? null, error: null };
      } catch (err) {
        return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
      }
    },
    single: async () => {
      try {
        const { data, error } = await chainApply().select("*").limit(1);
        const rows = (data ?? []) as T[];
        if (error) return { data: undefined as unknown as T, error: new Error(error.message) };
        if (rows.length === 0) return { data: undefined as unknown as T, error: new Error("supabase-wrapper: single() empty") };
        return { data: rows[0], error: null };
      } catch (err) {
        return { data: undefined as unknown as T, error: err instanceof Error ? err : new Error(String(err)) };
      }
    },
  };
  return builder;
}

export async function createSupabaseDbClient(): Promise<DbClient> {
  const env = getEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("supabase-wrapper: missing credentials (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).");
  }
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  return {
    init: async () => {
      try {
        const start = performance.now();
        const { error } = await sb.from("sports").select("id", { count: "exact", head: true });
        if (error) throw new Error(error.message);
        console.log(`[DB] Supabase Cloud connected OK (${Math.round(performance.now() - start)}ms) · project=${new URL(env.NEXT_PUBLIC_SUPABASE_URL!).hostname}`);
        void TABLE_NAMES;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.warn("[DB] Supabase Cloud init failed: " + error.message);
        throw error;
      }
    },
    isOffline: () => false,
    from: <T extends AnyRow>(table: TableName) => buildQueryBuilder<T>(sb, table),
    insert: async (table, row) => {
      try {
        const { data, error } = await sb.from(table as string).insert(row as never).select().maybeSingle();
        if (error) return { data: null, error: new Error(error.message) };
        return { data: (data as AnyRow | null) ?? null, error: null };
      } catch (err) {
          return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
      }
    },
    upsert: async (table, row, uniqueKey) => {
      try {
        const opts = uniqueKey ? { onConflict: uniqueKey as string, ignoreDuplicates: false } : { ignoreDuplicates: false };
        const { data, error } = await sb.from(table as string).upsert(row as never, opts as never).select().maybeSingle();
        if (error) return { data: null, error: new Error(error.message) };
        return { data: (data as AnyRow | null) ?? null, error: null };
      } catch (err) {
        return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
      }
    },
    bulkUpsert: async (table, items, uniqueKey) => {
      if (items.length === 0) return { data: [], error: null };
      try {
        const opts = uniqueKey ? { onConflict: uniqueKey as string } : {};
        const { data, error } = await sb.from(table as string).upsert(items as never[], opts as never).select();
        if (error) return { data: [], error: new Error(error.message) };
        return { data: (data ?? []) as AnyRow[], error: null };
      } catch (err) {
        return { data: [], error: err instanceof Error ? err : new Error(String(err)) };
      }
    },
    count: async (table) => {
      try {
        const { count, error } = await sb.from(table as string).select("*", { count: "exact", head: true });
        if (error) { console.warn(`[DB] count(${table}) error: ${error.message}`); return 0; }
        return count ?? 0;
      } catch {
        return 0;
      }
    },
  };
}
