import "server-only";
import type { SportId } from "@/types/core/sport";
import type {
  SportInsert,
  LeagueInsert,
  SeasonInsert,
  TeamInsert,
  PlayerInsert,
  MatchInsert,
  PlayerMatchStatsInsert,
} from "@/types/db/tables";
import {
  InMemoryStore,
  type TableName,
} from "@/lib/db/in-memory-store";
import {
  hasSupabase,
} from "@/lib/config/env";
import { getFeatureFlag } from "@/lib/config/feature-flags";
import {
  type DbClient,
  createSupabaseDbClient,
  type QueryBuilder,
} from "@/lib/db/supabase-wrapper";

type AnyInsert =
  | SportInsert
  | LeagueInsert
  | SeasonInsert
  | TeamInsert
  | PlayerInsert
  | MatchInsert
  | PlayerMatchStatsInsert;

let cachedClient: DbClient | null = null;
let didLog = false;

function buildStoreOfflineClient(): DbClient {
  const store = InMemoryStore;
  let inited = false;
  return {
    isOffline: () => true,
    init: async () => {
      if (inited) return;
      await store.init();
      inited = true;
    },
    from: <T>(table: TableName) =>
      store.from(table) as unknown as QueryBuilder<T>,
    insert: async (table, row) => {
      const res = store.insert(
        table,
        row as unknown as Parameters<typeof store.insert>[1],
      );
      return { data: res.data ?? null, error: res.error };
    },
    upsert: async (table, row, uniqueKey) => {
      const res = store.upsert(
        table,
        row as unknown as Parameters<typeof store.upsert>[1],
        uniqueKey as unknown as Parameters<typeof store.upsert>[2],
      );
      return { data: res.data ?? null, error: res.error };
    },
    bulkUpsert: async (table, items, uniqueKey) => {
      const res = store.bulkUpsert(
        table,
        items as unknown as Parameters<typeof store.bulkUpsert>[1],
        uniqueKey as unknown as Parameters<typeof store.bulkUpsert>[2],
      );
      return { data: res.data as unknown as AnyInsert[], error: res.error } as unknown as ReturnType<
        DbClient["bulkUpsert"]
      >;
    },
    count: async (table) => store.count(table),
  };
}

export async function getDbClient(): Promise<DbClient> {
  if (cachedClient) return cachedClient;

  const offlineForced = getFeatureFlag("ENABLE_OFFLINE_MODE") === true;
  const hasCreds = hasSupabase();
  const useCloud = !offlineForced && hasCreds;

  if (useCloud) {
    cachedClient = await createSupabaseDbClient();
    if (!didLog) {
      didLog = true;
      console.log(
        "[DB] Initializing → SUPABASE CLOUD (offline=false, hasCreds=true).",
      );
    }
  } else {
    cachedClient = buildStoreOfflineClient();
    if (!didLog) {
      didLog = true;
      const reason = offlineForced
        ? "featureFlag ENABLE_OFFLINE_MODE=true (DEFAULT para desarrollo)"
        : "no credentials in .env.local";
      console.log(
        `[DB] Initializing → IN-MEMORY OFFLINE (fallback). Razón: ${reason}`,
      );
    }
  }
  return cachedClient;
}

export async function ensureDbReady(): Promise<DbClient> {
  const client = await getDbClient();
  try {
    await client.init();
    return client;
  } catch (err) {
    if (client.isOffline()) throw err;
    // Con credenciales configuradas, nunca sustituimos datos reales por demo.
    // El modo demo se elige explícitamente con ENABLE_OFFLINE_MODE=true o
    // aparece cuando no hay configuración de Supabase.
    throw err;
  }
}

export function getActiveSportIds(): SportId[] {
  return ["soccer"];
}
