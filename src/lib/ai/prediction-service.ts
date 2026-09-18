/**
 * Prediction write service V1 — persistencia server-side de predicciones 1X2 pre-kickoff.
 *
 * Server-only. Sin UI, sin SSR automático, sin OpenAI, sin APIs externas.
 * La persistencia real ocurre vía PredictionStore (service_role en producción).
 * Este módulo NO importa Supabase directamente: el store se inyecta, lo que
 * permite probar todo con fakes sin escribir en Supabase Cloud.
 *
 * BLOQUEOS CONOCIDOS (no escribir en Cloud hasta resolver):
 * 1. migration 004 declara predictions.odds_used / odds_snapshot_id / bookmaker_id
 *    como NOT NULL sin DEFAULT → un payload sin odds es rechazado por el schema
 *    actual. Se requiere migración aditiva 005 que los haga anulables.
 * 2. model_versions seed (v1-dixon-coles-2026-01) no refleja el comportamiento
 *    real de Phase 4B: guarda homeAdvFactor=1.25 (no aplicado en V1) y omite
 *    minLambda/maxLambda. verifyModelParameters() bloquea el write en ese caso.
 *
 * Reglas:
 * - Solo si now < kickoff_at (comparación de instantes UTC, estricta).
 * - El modelo solo ve partidos con match_date < kickoff (sin leakage).
 * - Append-only: sin UPDATE/DELETE desde la app.
 * - Idempotencia: una predicción canónica por (match, market, model);
 *   reintentos/doble-click reutilizan la existente (created=false).
 * - Sin odds inventadas: si no hay snapshot real, los campos de odds se
 *   OMITEN del payload (quedan para la migración 005 que los hace nulables).
 */

import "server-only";
import type { ModelParameters, ModelInputsSnapshot } from "@/lib/ai/probability-model";
import { getDefaultParameters } from "@/lib/ai/probability-model";

// ------------------------------------------------------------------
// Tipos
// ------------------------------------------------------------------

export interface PredictionMatchRef {
  id: string;
  sport_id: string;
  league_id: string;
  season_id: string;
  home_team_id: string;
  away_team_id: string;
  match_date: string;
  status: string;
}

export interface PredictionModelVersion {
  id: string;
  is_active: boolean;
  parameters: Record<string, unknown>;
}

export interface PredictionMarket {
  id: string;
}

export interface ModelProbabilities {
  home: number;
  draw: number;
  away: number;
}

export interface ModelRunResult {
  probabilities: ModelProbabilities;
  expectedGoals: { home: number; away: number };
  usedFallback: boolean;
  fallbackReason: string;
  dataQuality: { homeMatchesUsed: number; awayMatchesUsed: number; leagueMatchesUsed: number };
  parameters: ModelParameters;
  /**
   * Snapshot de inputs para reproducibilidad a nivel de modelo (ver
   * ModelInputsSnapshot). Opcional por compatibilidad: si el runner no lo
   * provee, data_snapshot.inputs queda en null (nivel: audit snapshot).
   */
  reproducibility?: ModelInputsSnapshot | null;
}

export interface StoredPrediction {
  id: string | number;
  match_id: string;
  market_id: string;
  model_version_id: string;
  model_probabilities: ModelProbabilities;
  odds_used?: ModelProbabilities | { home: number; draw: number; away: number } | null;
  odds_snapshot_id?: number | null;
  bookmaker_id?: string | null;
  data_snapshot: Record<string, unknown>;
  predicted_at: string;
  kickoff_at: string;
}

export interface PredictionInsertPayload {
  match_id: string;
  market_id: string;
  model_version_id: string;
  model_probabilities: ModelProbabilities;
  /**
   * NULL explícito cuando no hay snapshot de odds real (migration 005).
   * NULL = "sin mercado asociado", NO odds sintéticas.
   */
  odds_used: { home: number; draw: number; away: number } | null;
  odds_snapshot_id: number | null;
  bookmaker_id: string | null;
  edge_home?: number | null;
  edge_draw?: number | null;
  edge_away?: number | null;
  ev_home?: number | null;
  ev_draw?: number | null;
  ev_away?: number | null;
  sports_ai_score?: number | null;
  data_snapshot: Record<string, unknown>;
  kickoff_at: string;
}

export interface PredictionStore {
  getMatchById(matchId: string): Promise<PredictionMatchRef | null>;
  getModelVersionById(id: string): Promise<PredictionModelVersion | null>;
  getMarketById(id: string): Promise<PredictionMarket | null>;
  findExisting(matchId: string, marketId: string, modelVersionId: string): Promise<StoredPrediction | null>;
  insert(payload: PredictionInsertPayload): Promise<StoredPrediction>;
  getLatest(matchId: string, marketId: string, modelVersionId: string): Promise<StoredPrediction | null>;
  listByMatch(matchId: string): Promise<StoredPrediction[]>;
  listRecent(limit: number): Promise<StoredPrediction[]>;
}

export interface ModelRunner {
  run(match: PredictionMatchRef): Promise<ModelRunResult>;
}

export interface PredictionServiceDeps {
  store: PredictionStore;
  runModel: ModelRunner;
  /** Inyectable para tests. Default: Date.now. */
  nowMs?: () => number;
}

// ------------------------------------------------------------------
// Errores (mensajes sanitizados: solo IDs y motivos, sin secretos)
// ------------------------------------------------------------------

export class PredictionServiceError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PredictionServiceError";
    this.code = code;
  }
}

export const PredictionErrorCodes = {
  MATCH_NOT_FOUND: "MATCH_NOT_FOUND",
  INVALID_KICKOFF: "INVALID_KICKOFF",
  KICKOFF_PASSED: "KICKOFF_PASSED",
  MODEL_NOT_FOUND: "MODEL_NOT_FOUND",
  MODEL_INACTIVE: "MODEL_INACTIVE",
  MODEL_PARAM_MISMATCH: "MODEL_PARAM_MISMATCH",
  MARKET_NOT_FOUND: "MARKET_NOT_FOUND",
  INVALID_PROBABILITIES: "INVALID_PROBABILITIES",
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
} as const;

// ------------------------------------------------------------------
// Verificación de parámetros: el seed debe reflejar el modelo real.
// ------------------------------------------------------------------

const EFFECTIVE_PARAM_KEYS = [
  "lookbackMatches",
  "minMatchesRequired",
  "recencyHalfLife",
  "dcEnabled",
  "dcRho",
  "maxGoals",
  "minLambda",
  "maxLambda",
] as const;

export function verifyModelParameters(
  stored: Record<string, unknown>,
): { ok: boolean; diffs: string[] } {
  const defaults = getDefaultParameters() as unknown as Record<string, unknown>;
  const diffs: string[] = [];
  for (const key of EFFECTIVE_PARAM_KEYS) {
    if (!(key in stored)) {
      diffs.push(`${key}: ausente en seed (esperado: ${String(defaults[key])})`);
    } else if (stored[key] !== defaults[key]) {
      diffs.push(`${key}: seed=${String(stored[key])} distinto del efectivo=${String(defaults[key])}`);
    }
  }
  if ("homeAdvFactor" in stored && stored["homeAdvFactor"] !== 1) {
    diffs.push(
      `homeAdvFactor guardado como ${String(stored["homeAdvFactor"])} pero V1 no aplica factor adicional (efectivo 1.0); alinear antes de persistir`,
    );
  }
  return { ok: diffs.length === 0, diffs };
}

// ------------------------------------------------------------------
// Servicio
// ------------------------------------------------------------------

export const DEFAULT_MARKET_ID = "1x2";
export const DEFAULT_MODEL_VERSION_ID = "v1-dixon-coles-2026-01";
const PROB_SUM_TOLERANCE = 0.0001;

function assertValidProbs(probs: ModelProbabilities): void {
  for (const key of ["home", "draw", "away"] as const) {
    const value = probs[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new PredictionServiceError(
        PredictionErrorCodes.INVALID_PROBABILITIES,
        `Probabilidad inválida en ${key}`,
      );
    }
  }
  const sum = probs.home + probs.draw + probs.away;
  if (Math.abs(sum - 1) > PROB_SUM_TOLERANCE) {
    throw new PredictionServiceError(
      PredictionErrorCodes.INVALID_PROBABILITIES,
      "Las probabilidades del modelo deben sumar 1",
    );
  }
}

export interface CreatePredictionInput {
  matchId: string;
  marketId?: string;
  modelVersionId?: string;
}

export interface CreatePredictionResult {
  prediction: StoredPrediction;
  /** false cuando se reutilizó la predicción existente (idempotencia). */
  created: boolean;
}

export type PreviewPredictionResult =
  | { prediction: StoredPrediction; created: false }
  | { payload: PredictionInsertPayload; run: ModelRunResult; created: true };

/**
 * Dry-run / preview: ejecuta TODAS las validaciones, el modelo y la
 * construcción del payload SIN llamar a store.insert. Útil para revisión
 * humana antes del primer write controlado y para tests (AT).
 */
export async function previewPrediction(
  deps: PredictionServiceDeps,
  input: CreatePredictionInput,
): Promise<PreviewPredictionResult> {
  const marketId = input.marketId ?? DEFAULT_MARKET_ID;
  const modelVersionId = input.modelVersionId ?? DEFAULT_MODEL_VERSION_ID;
  const nowMs = (deps.nowMs ?? Date.now)();

  const match = await deps.store.getMatchById(input.matchId);
  if (!match) {
    throw new PredictionServiceError(PredictionErrorCodes.MATCH_NOT_FOUND, "Partido no encontrado");
  }

  const kickoffMs = Date.parse(match.match_date);
  if (!Number.isFinite(kickoffMs)) {
    throw new PredictionServiceError(PredictionErrorCodes.INVALID_KICKOFF, "Kickoff del partido inválido");
  }
  // Regla pre-kickoff estricta: now < kickoff (== y > rechazados).
  if (!(nowMs < kickoffMs)) {
    throw new PredictionServiceError(
      PredictionErrorCodes.KICKOFF_PASSED,
      "El partido ya inició; no se puede crear la predicción",
    );
  }

  const modelVersion = await deps.store.getModelVersionById(modelVersionId);
  if (!modelVersion) {
    throw new PredictionServiceError(PredictionErrorCodes.MODEL_NOT_FOUND, "Versión del modelo no encontrada");
  }
  if (!modelVersion.is_active) {
    throw new PredictionServiceError(PredictionErrorCodes.MODEL_INACTIVE, "Versión del modelo inactiva");
  }
  const paramCheck = verifyModelParameters(modelVersion.parameters ?? {});
  if (!paramCheck.ok) {
    throw new PredictionServiceError(
      PredictionErrorCodes.MODEL_PARAM_MISMATCH,
      `Parámetros del modelo no coinciden con el comportamiento real: ${paramCheck.diffs.join("; ")}`,
    );
  }

  const market = await deps.store.getMarketById(marketId);
  if (!market) {
    throw new PredictionServiceError(PredictionErrorCodes.MARKET_NOT_FOUND, "Mercado no encontrado");
  }

  // Idempotencia application-level: una predicción canónica por (match, market, model).
  const existing = await deps.store.findExisting(match.id, market.id, modelVersion.id);
  if (existing) {
    return { prediction: existing, created: false };
  }

  // El runner recibe el match con su kickoff real: el modelo solo usa
  // partidos con match_date < kickoff (sin leakage).
  const run = await deps.runModel.run(match);
  assertValidProbs(run.probabilities);

  // Sin snapshot de odds real: NULL explícito (migration 005 los hace
  // nulables). NULL = "predicción del modelo sin mercado asociado", NO odds sintéticas.
  // edge_*/ev_*/sports_ai_score quedan para cuando existan odds REALES (4C.5+).
  // predicted_at NO va en el payload: lo fija el servidor (DB DEFAULT NOW());
  // el store debe rechazar payloads que lo contengan.
  // data_snapshot: nivel "reproducibility-model-level" cuando el runner provee
  // inputs (recomputable λ→P(1X2) exacto); si no, nivel "audit snapshot".
  const payload: PredictionInsertPayload = {
    match_id: match.id,
    market_id: market.id,
    model_version_id: modelVersion.id,
    model_probabilities: { ...run.probabilities },
    odds_used: null,
    odds_snapshot_id: null,
    bookmaker_id: null,
    edge_home: null,
    edge_draw: null,
    edge_away: null,
    ev_home: null,
    ev_draw: null,
    ev_away: null,
    sports_ai_score: null,
    data_snapshot: {
      snapshotLevel: run.reproducibility ? "reproducibility-model-level" : "audit",
      match: {
        id: match.id,
        leagueId: match.league_id,
        seasonId: match.season_id,
        homeTeamId: match.home_team_id,
        awayTeamId: match.away_team_id,
      },
      kickoff: match.match_date,
      modelVersion: modelVersion.id,
      expectedGoals: { ...run.expectedGoals },
      usedFallback: run.usedFallback,
      fallbackReason: run.fallbackReason,
      dataQuality: { ...run.dataQuality },
      effectiveParameters: { ...run.parameters },
      inputs: run.reproducibility ?? null,
    },
    kickoff_at: match.match_date,
  };

  return { payload, run, created: true };
}

export async function createPreKickoffPrediction(
  deps: PredictionServiceDeps,
  input: CreatePredictionInput,
): Promise<CreatePredictionResult> {
  const preview = await previewPrediction(deps, input);
  if (!preview.created) {
    return { prediction: preview.prediction, created: false };
  }
  return persistPredictionPreview(deps, preview);
}

/** Persists an already validated/modelled preview without running the model twice. */
export async function persistPredictionPreview(
  deps: PredictionServiceDeps,
  preview: Extract<PreviewPredictionResult, { created: true }>,
): Promise<CreatePredictionResult> {
  const { payload } = preview;
  // Carrera concurrente: dos requests pueden pasar findExisting() con null
  // antes de que cualquiera inserte. La UNIQUE(match,market,model) de la DB
  // (migration 005) es la garantía real; ante su violación, re-leer y
  // reutilizar la fila ganadora (created:false) en vez de exponer error.
  // Re-leer ante CUALQUIER error de insert es seguro: si no hay fila, se
  // relanza el error original; si la hay, es la ganadora de la carrera.
  try {
    const prediction = await deps.store.insert(payload);
    return { prediction, created: true };
  } catch (insertErr) {
    const raced = await deps.store.findExisting(payload.match_id, payload.market_id, payload.model_version_id);
    if (raced) return { prediction: raced, created: false };
    throw insertErr;
  }
}

export async function getLatestPrediction(
  deps: PredictionServiceDeps,
  matchId: string,
  marketId = DEFAULT_MARKET_ID,
  modelVersionId = DEFAULT_MODEL_VERSION_ID,
): Promise<StoredPrediction | null> {
  return deps.store.getLatest(matchId, marketId, modelVersionId);
}

export async function listPredictionsByMatch(
  deps: PredictionServiceDeps,
  matchId: string,
): Promise<StoredPrediction[]> {
  return deps.store.listByMatch(matchId);
}

export async function listRecentPredictions(
  deps: PredictionServiceDeps,
  limit: number,
): Promise<StoredPrediction[]> {
  return deps.store.listRecent(limit);
}
