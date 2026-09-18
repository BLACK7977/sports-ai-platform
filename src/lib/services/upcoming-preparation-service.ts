import "server-only";
import type { Match } from "@/types/db/tables";
import { getActiveCompetition } from "@/lib/db/repositories/active-competition-repo";
import { getMatchById, getUpcomingMatchesByLeagueSeason, isFutureScheduledMatch } from "@/lib/db/repositories/matches-repo";
import { createProductionPredictionStore } from "@/lib/db/repositories/prediction-store";
import { createRealModelRunner } from "@/lib/ai/prediction-runner";
import { DEFAULT_MARKET_ID, DEFAULT_MODEL_VERSION_ID, persistPredictionPreview, previewPrediction, type PredictionServiceDeps, type StoredPrediction } from "@/lib/ai/prediction-service";
import { createClient } from "@supabase/supabase-js";
import { getEnv, getSupabaseProjectUrl } from "@/lib/config/env";

export type PreparationOutcome = "WOULD_CREATE" | "CREATED" | "SKIPPED_EXISTING" | "SKIPPED_INELIGIBLE" | "FAILED";
export type PreparationItem = { matchId: string; kickoff: string; outcome: PreparationOutcome; reason?: string; prediction?: StoredPrediction };
export type PreparationOptions = { horizonDays?: number; limit?: number; dryRun?: boolean; nowMs?: () => number };
export type PreparationDeps = {
  listEligible(nowMs: number, horizonMs: number, limit: number): Promise<Match[]>;
  getMatch(id: string): Promise<Match | null>;
  prediction: PredictionServiceDeps;
  recordState?(matchId: string, state: "AVAILABLE" | "NOT_AVAILABLE" | "FAILED", errorCode?: string): Promise<void>;
};

async function defaultDeps(): Promise<PreparationDeps> {
  const active = await getActiveCompetition("soccer");
  if (!active) throw new Error("No hay competición activa para preparar");
  const store = createProductionPredictionStore();
  return {
    listEligible: (now, horizon, limit) => getUpcomingMatchesByLeagueSeason(active.league.id, active.season.id, now, horizon, limit),
    getMatch: getMatchById,
    prediction: { store, runModel: createRealModelRunner() },
    recordState: async (matchId, predictionState, errorCode) => {
      const env = getEnv();
      const url = getSupabaseProjectUrl();
      if (!url) throw new Error("Supabase no configurado");
      const sb = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
      const { data: previous, error: readError } = await sb.from("match_preparation_state").select("attempt_count").eq("match_id", matchId).maybeSingle();
      if (readError) throw new Error(`match_preparation_state read: ${readError.message}`);
      const { error } = await sb.from("match_preparation_state").upsert({
        match_id: matchId, prediction_state: predictionState,
        last_attempt_at: new Date().toISOString(),
        prepared_at: predictionState === "AVAILABLE" ? new Date().toISOString() : null,
        error_code: errorCode ?? null,
        attempt_count: Number(previous?.attempt_count ?? 0) + 1,
      }, { onConflict: "match_id" });
      if (error) throw new Error(`match_preparation_state: ${error.message}`);
    },
  };
}

export async function prepareUpcomingPredictions(
  options: PreparationOptions = {},
  injected?: PreparationDeps,
): Promise<{ dryRun: boolean; items: PreparationItem[] }> {
  const dryRun = options.dryRun ?? true;
  const horizonDays = options.horizonDays ?? 14;
  const limit = options.limit ?? 20;
  if (!Number.isFinite(horizonDays) || horizonDays <= 0 || !Number.isSafeInteger(limit) || limit < 1) throw new Error("Opciones de preparación inválidas");
  const deps = injected ?? await defaultDeps();
  const clock = options.nowMs ?? Date.now;
  const initialNow = clock();
  const matches = await deps.listEligible(initialNow, horizonDays * 86_400_000, limit);
  const items: PreparationItem[] = [];
  for (const selected of [...matches].sort((a, b) => a.match_date.localeCompare(b.match_date) || a.id.localeCompare(b.id))) {
    try {
      const current = await deps.getMatch(selected.id);
      if (!current || !isFutureScheduledMatch(current, clock())) {
        items.push({ matchId: selected.id, kickoff: selected.match_date, outcome: "SKIPPED_INELIGIBLE", reason: "kickoff/status cambió" });
        continue;
      }
      const predictionDeps = { ...deps.prediction, nowMs: clock };
      const preview = await previewPrediction(predictionDeps, { matchId: current.id, marketId: DEFAULT_MARKET_ID, modelVersionId: DEFAULT_MODEL_VERSION_ID });
      if (!preview.created) {
        items.push({ matchId: current.id, kickoff: current.match_date, outcome: "SKIPPED_EXISTING", prediction: preview.prediction });
        continue;
      }
      if (preview.run.usedFallback) throw new Error(`MODEL_FALLBACK:${preview.run.fallbackReason || "insufficient-inputs"}`);
      if (dryRun) {
        items.push({ matchId: current.id, kickoff: current.match_date, outcome: "WOULD_CREATE" });
        continue;
      }
      const persisted = await persistPredictionPreview(predictionDeps, preview);
      await deps.recordState?.(current.id, "AVAILABLE");
      items.push({ matchId: current.id, kickoff: current.match_date, outcome: persisted.created ? "CREATED" : "SKIPPED_EXISTING", prediction: persisted.prediction });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown";
      if (!dryRun && deps.recordState) {
        try { await deps.recordState(selected.id, reason.startsWith("MODEL_FALLBACK") ? "NOT_AVAILABLE" : "FAILED", reason.split(":", 1)[0]); }
        catch { /* failure is already isolated and reported by the item below */ }
      }
      items.push({ matchId: selected.id, kickoff: selected.match_date, outcome: "FAILED", reason });
    }
  }
  return { dryRun, items };
}
