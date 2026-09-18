import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv, getSupabaseProjectUrl } from "@/lib/config/env";
import type { PredictionInsertPayload, PredictionMatchRef, PredictionModelVersion, PredictionMarket, PredictionStore, StoredPrediction } from "@/lib/ai/prediction-service";

function client(): SupabaseClient {
  const env = getEnv();
  const url = getSupabaseProjectUrl();
  if (!url) throw new Error("PredictionStore: Supabase no configurado");
  return createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function stored(row: Record<string, unknown>): StoredPrediction {
  return row as unknown as StoredPrediction;
}

export function createProductionPredictionStore(sb: SupabaseClient = client()): PredictionStore {
  const selectOne = async (table: string, filters: Record<string, string>): Promise<Record<string, unknown> | null> => {
    let query = sb.from(table).select("*");
    for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw new Error(`${table}: ${error.message}`);
    return data as Record<string, unknown> | null;
  };
  return {
    getMatchById: async (id) => (await selectOne("matches", { id })) as unknown as PredictionMatchRef | null,
    getModelVersionById: async (id) => (await selectOne("model_versions", { id })) as unknown as PredictionModelVersion | null,
    getMarketById: async (id) => (await selectOne("markets", { id })) as unknown as PredictionMarket | null,
    findExisting: async (matchId, marketId, modelVersionId) => {
      const row = await selectOne("predictions", { match_id: matchId, market_id: marketId, model_version_id: modelVersionId });
      return row ? stored(row) : null;
    },
    insert: async (payload: PredictionInsertPayload) => {
      const { data, error } = await sb.from("predictions").insert(payload).select("*").single();
      if (error) throw new Error(`predictions insert: ${error.message}`);
      return stored(data as Record<string, unknown>);
    },
    getLatest: async (matchId, marketId, modelVersionId) => {
      const { data, error } = await sb.from("predictions").select("*").eq("match_id", matchId).eq("market_id", marketId).eq("model_version_id", modelVersionId).order("predicted_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(`predictions latest: ${error.message}`);
      return data ? stored(data as Record<string, unknown>) : null;
    },
    listByMatch: async (matchId) => {
      const { data, error } = await sb.from("predictions").select("*").eq("match_id", matchId).order("predicted_at", { ascending: false });
      if (error) throw new Error(`predictions list: ${error.message}`);
      return (data ?? []).map((row) => stored(row as Record<string, unknown>));
    },
    listRecent: async (limit) => {
      const { data, error } = await sb.from("predictions").select("*").order("predicted_at", { ascending: false }).limit(limit);
      if (error) throw new Error(`predictions recent: ${error.message}`);
      return (data ?? []).map((row) => stored(row as Record<string, unknown>));
    },
  };
}
