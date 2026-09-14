import "server-only";
import type { SportId } from "@/types/core/sport";
import {
  InMemoryStore,
  type TableName,
  type Tables,
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

export type { DbClient };

// Re-export the InsertShape type for use in the offline client
type InsertShape<TN extends TableName> = import("@/lib/db/supabase-wrapper").InsertShape<TN>;

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    upsert: async <TN extends TableName>(table: TN, row: InsertShape<TN>, uniqueKey?: keyof Tables[TN]) => {
      const res = store.upsert(
        table,
        row as any,
        uniqueKey as any,
      );
      return { data: res.data ?? null, error: res.error };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bulkUpsert: async <TN extends TableName>(table: TN, items: InsertShape<TN>[], uniqueKey?: keyof Tables[TN]) => {
      const res = store.bulkUpsert(
        table,
        items as any,
        uniqueKey as any,
      );
      return { data: (res.data ?? []) as Tables[TN][], error: res.error };
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
