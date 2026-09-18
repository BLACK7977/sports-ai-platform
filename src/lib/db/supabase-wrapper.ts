import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Sport, League, Season, Team, Player, Match, PlayerMatchStats, Prediction, PredictionEvaluation,
  MatchMetadata, MatchStatistic, MatchEvent, MatchLineup,
  ProbableLineupRun, ProbableLineupPlayer,
  SportInsert, LeagueInsert, SeasonInsert, TeamInsert, PlayerInsert, MatchInsert, PlayerMatchStatsInsert,
  MatchMetadataInsert, MatchStatisticInsert, MatchEventInsert, MatchLineupInsert,
  ProbableLineupRunInsert, ProbableLineupPlayerInsert,
} from "@/types/db/tables";
import { getEnv, getSupabaseProjectUrl } from "@/lib/config/env";

export type Tables = { sports: Sport; leagues: League; seasons: Season; teams: Team; players: Player; matches: Match; player_match_stats: PlayerMatchStats; predictions: Prediction; prediction_evaluations: PredictionEvaluation; match_metadata: MatchMetadata; match_statistics: MatchStatistic; match_events: MatchEvent; match_lineups: MatchLineup; probable_lineup_runs: ProbableLineupRun; probable_lineup_players: ProbableLineupPlayer; };
export type TableName = keyof Tables;
const TABLE_NAMES: TableName[] = ["sports","leagues","seasons","teams","players","matches","player_match_stats","predictions","prediction_evaluations","match_metadata","match_statistics","match_events","match_lineups","probable_lineup_runs","probable_lineup_players"];
type OrderDir = "asc" | "desc";
type AnyRow =
  | Sport
  | League
  | Season
  | Team
  | Player
  | Match
  | PlayerMatchStats
  | Prediction
  | PredictionEvaluation
  | MatchMetadata
  | MatchStatistic
  | MatchEvent
  | MatchLineup
  | ProbableLineupRun
  | ProbableLineupPlayer;
type AnyInsert = SportInsert | LeagueInsert | SeasonInsert | TeamInsert | PlayerInsert | MatchInsert | PlayerMatchStatsInsert | MatchMetadataInsert | MatchStatisticInsert | MatchEventInsert | MatchLineupInsert | ProbableLineupRunInsert | ProbableLineupPlayerInsert;

export type InsertShape<TN extends TableName> = TN extends "sports"
  ? SportInsert
  : TN extends "leagues"
    ? LeagueInsert
    : TN extends "seasons"
      ? SeasonInsert
      : TN extends "teams"
        ? TeamInsert
        : TN extends "players"
          ? PlayerInsert
          : TN extends "matches"
            ? MatchInsert
            : TN extends "match_metadata"
              ? MatchMetadataInsert
              : TN extends "match_statistics"
                ? MatchStatisticInsert
                : TN extends "match_events"
                  ? MatchEventInsert
                  : TN extends "match_lineups"
                    ? MatchLineupInsert
                    : TN extends "probable_lineup_runs"
                      ? ProbableLineupRunInsert
                      : TN extends "probable_lineup_players"
                        ? ProbableLineupPlayerInsert
                        : PlayerMatchStatsInsert;

export interface QueryBuilder<T> {
  eq<K extends keyof T>(key: K, value: T[K]): QueryBuilder<T>;
  in<K extends keyof T>(key: K, values: T[K][]): QueryBuilder<T>;
  or(filter: string): QueryBuilder<T>;
  gte<K extends keyof T>(key: K, value: T[K]): QueryBuilder<T>;
  lte<K extends keyof T>(key: K, value: T[K]): QueryBuilder<T>;
  order<K extends keyof T>(key: K, dir?: OrderDir): QueryBuilder<T>;
  limit(n: number): QueryBuilder<T>;
  select(): Promise<{ data: T[]; error: Error | null }>;
  maybeSingle(): Promise<{ data: T | null; error: Error | null }>;
  single(): Promise<{ data: T; error: Error | null }>;
  delete(): Promise<{ error: Error | null }>;
}

export interface DbClient {
  init(): Promise<void>;
  isOffline(): boolean;
  from<T extends AnyRow>(table: TableName): QueryBuilder<T>;
  insert(table: TableName, row: AnyInsert): Promise<{ data: AnyRow | null; error: Error | null }>;
  upsert<TN extends TableName>(table: TN, row: InsertShape<TN>, uniqueKey?: keyof Tables[TN]): Promise<{ data: Tables[TN] | null; error: Error | null }>;
  bulkUpsert<TN extends TableName>(table: TN, items: InsertShape<TN>[], uniqueKey?: keyof Tables[TN]): Promise<{ data: Tables[TN][]; error: Error | null }>;
  count(table: TableName): Promise<number>;
}

function buildQueryBuilder<T extends AnyRow>(
  sb: SupabaseClient, table: TableName): QueryBuilder<T> {
  type K = keyof T;
  const chain: Array<{op: "eq" | "in" | "gte" | "lte"; key: K; value: unknown} | {op: "or"; filter: string}> = [];
  let orderKey: K | null = null;
  let orderDir: OrderDir = "asc";
  let limitN: number | null = null;

  function applyFilters(q: any): any {
    for (const c of chain) {
      if (c.op === "eq") q = q.eq(c.key as string, c.value);
      else if (c.op === "in") q = q.in(c.key as string, c.value);
      else if (c.op === "or") q = q.or(c.filter);
      else if (c.op === "gte") q = q.gte(c.key as string, c.value);
      else if (c.op === "lte") q = q.lte(c.key as string, c.value);
    }
    if (orderKey) q = q.order(orderKey as string, { ascending: orderDir === "asc" });
    if (limitN !== null) q = q.limit(limitN);
    return q;
  }

  function buildSelectQuery() {
    return applyFilters(sb.from(table as string).select("*"));
  }

  const builder: QueryBuilder<T> = {
    eq: (k, v) => { chain.push({ op: "eq", key: k, value: v }); return builder; },
    in: (k, v) => { chain.push({ op: "in", key: k, value: v }); return builder; },
    or: (filter) => { chain.push({ op: "or", filter }); return builder; },
    gte: (k, v) => { chain.push({ op: "gte", key: k, value: v }); return builder; },
    lte: (k, v) => { chain.push({ op: "lte", key: k, value: v }); return builder; },
    order: (k, d = "asc") => { orderKey = k; orderDir = d; return builder; },
    limit: (n) => { limitN = n; return builder; },
    select: async () => {
      try {
        const { data, error } = await buildSelectQuery();
        if (error) return { data: [], error: new Error(error.message) };
        return { data: (data ?? []) as T[], error: null };
      } catch (err) {
        return { data: [], error: err instanceof Error ? err : new Error(String(err)) };
      }
    },
    maybeSingle: async () => {
      try {
        const { data, error } = await buildSelectQuery().limit(1).maybeSingle();
        if (error) return { data: null, error: new Error(error.message) };
        return { data: (data as T | null) ?? null, error: null };
      } catch (err) {
        return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
      }
    },
    single: async () => {
      try {
        const { data, error } = await buildSelectQuery().limit(1);
        const rows = (data ?? []) as T[];
        if (error) return { data: undefined as unknown as T, error: new Error(error.message) };
        if (rows.length === 0) return { data: undefined as unknown as T, error: new Error("supabase-wrapper: single() empty") };
        return { data: rows[0], error: null };
      } catch (err) {
        return { data: undefined as unknown as T, error: err instanceof Error ? err : new Error(String(err)) };
      }
    },
    delete: async () => {
      try {
        const deleteQuery = applyFilters(sb.from(table as string).delete());
        const { error } = await deleteQuery;
        if (error) return { error: new Error(error.message) };
        return { error: null };
      } catch (err) {
        return { error: err instanceof Error ? err : new Error(String(err)) };
      }
    },
  };
  return builder;
}

export async function createSupabaseDbClient(): Promise<DbClient> {
  const env = getEnv();
  const projectUrl = getSupabaseProjectUrl();
  if (!projectUrl || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("supabase-wrapper: missing credentials (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).");
  }
  const sb = createClient(projectUrl, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  let initialized = false;
  return {
    init: async () => {
      if (initialized) return;
      try {
        const start = performance.now();
        const { count: sportsCount, error: sportsError } = await sb.from("sports").select("id", { count: "exact", head: true });
        if (sportsError) throw new Error(sportsError.message);
        const { count: matchesCount, error: matchesError } = await sb.from("matches").select("id", { count: "exact", head: true });
        if (matchesError) throw new Error(matchesError.message);
        if ((sportsCount ?? 0) === 0 && (matchesCount ?? 0) === 0) {
          throw new Error("Supabase is reachable but has no Sports AI data; using demo fallback.");
        }
        console.log(`[DB] Supabase Cloud connected OK (${Math.round(performance.now() - start)}ms) · project=${new URL(projectUrl).hostname}`);
        initialized = true;
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
    upsert: async <TN extends TableName>(table: TN, row: InsertShape<TN>, uniqueKey?: keyof Tables[TN]) => {
      try {
        const opts = uniqueKey ? { onConflict: uniqueKey as string, ignoreDuplicates: false } : { ignoreDuplicates: false };
        const { data, error } = await sb.from(table as string).upsert(row as never, opts as never).select().maybeSingle();
        if (error) return { data: null, error: new Error(error.message) };
        return { data: (data as Tables[TN] | null) ?? null, error: null };
      } catch (err) {
        return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
      }
    },
    bulkUpsert: async <TN extends TableName>(table: TN, items: InsertShape<TN>[], uniqueKey?: keyof Tables[TN]) => {
      if (items.length === 0) return { data: [], error: null };
      try {
        const opts = uniqueKey ? { onConflict: uniqueKey as string } : {};
        const { data, error } = await sb.from(table as string).upsert(items as never[], opts as never).select();
        if (error) return { data: [], error: new Error(error.message) };
        return { data: (data ?? []) as Tables[TN][], error: null };
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
