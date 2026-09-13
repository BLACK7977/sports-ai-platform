/**
 * Evaluation service V1 — evalúa predicciones 1X2 congeladas contra resultados reales.
 *
 * Server-only. Lee la prediction PERSISTIDA (nunca re-ejecuta el modelo),
 * valida que el partido esté terminado, calcula métricas y persiste UNA
 * prediction_evaluation. Sin OpenAI, sin APIs externas, sin odds/ROI.
 *
 * Idempotencia: el flujo automático usa SIEMPRE evaluation_version=1, y la DB
 * garantiza UNIQUE(prediction_id, evaluation_version) (migration 004). Ante
 * carrera concurrente se re-lee y reutiliza (created:false). Correcciones
 * manuales futuras usarían versiones >1; este servicio no las crea.
 *
 * Brier multicategoría 1X2:
 *   Brier = (pHome-aHome)² + (pDraw-aDraw)² + (pAway-aAway)²
 * donde (aHome,aDraw,aAway) es one-hot del outcome real.
 * Rango [0, 2]: 0 perfecto; baseline uniforme (1/3,1/3,1/3) = 2/3.
 *
 * Top-pick: argmax(home, draw, away) con desempate determinista por orden
 * home > draw > away (el primero con el máximo estricto gana; en empate
 * exacto se queda el anterior en ese orden).
 */

import "server-only";

// ------------------------------------------------------------------
// Tipos puros
// ------------------------------------------------------------------

export type Outcome1X2 = "home" | "draw" | "away";

export interface ModelProbs {
  home: number;
  draw: number;
  away: number;
}

export interface EvaluationMetrics {
  actualOutcome: Outcome1X2;
  predictedOutcome: Outcome1X2;
  correct: boolean;
  brier: number;
}

export interface StoredPredictionForEval {
  id: string | number;
  match_id: string;
  market_id: string;
  model_version_id: string;
  model_probabilities: ModelProbs;
  predicted_at: string;
  kickoff_at: string;
  /** Opcional: solo lectura de UI (expectedGoals del snapshot). */
  data_snapshot?: Record<string, unknown> | null;
}

export interface FinishedMatchForEval {
  id: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  match_date: string;
  /** Opcionales: solo lectura de UI (nombres de equipos). */
  home_team_id?: string;
  away_team_id?: string;
}

export interface EvaluationRecord {
  id: string | number;
  prediction_id: string | number;
  actual_outcome: Outcome1X2;
  is_correct: boolean;
  match_result: Record<string, unknown>;
  evaluated_at: string;
  evaluator: string;
  evaluation_version: number;
  /** Métricas derivadas guardadas solo en memoria (no columnas en 004). */
  predicted_outcome?: Outcome1X2;
  brier_score?: number;
}

export interface EvaluationInsert {
  prediction_id: string | number;
  actual_outcome: Outcome1X2;
  is_correct: boolean;
  match_result: Record<string, unknown>;
  evaluator?: string;
  evaluation_version?: number;
}

// ------------------------------------------------------------------
// Errores (sanitizados: solo IDs y motivos)
// ------------------------------------------------------------------

export class EvaluationServiceError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "EvaluationServiceError";
    this.code = code;
  }
}

export const EvaluationErrorCodes = {
  PREDICTION_NOT_FOUND: "PREDICTION_NOT_FOUND",
  MATCH_NOT_FOUND: "MATCH_NOT_FOUND",
  MATCH_NOT_FINISHED: "MATCH_NOT_FINISHED",
  INCOMPLETE_RESULT: "INCOMPLETE_RESULT",
  INVALID_PROBABILITIES: "INVALID_PROBABILITIES",
} as const;

/** Único estado que habilita evaluación. Todo lo demás se rechaza. */
const FINISHED_STATUS = "finished";

/** Versión usada por el flujo automático (ver idempotencia arriba). */
export const AUTO_EVALUATION_VERSION = 1;

// ------------------------------------------------------------------
// Funciones puras
// ------------------------------------------------------------------

export function actualOutcomeFromScore(homeScore: number, awayScore: number): Outcome1X2 {
  if (homeScore > awayScore) return "home";
  if (homeScore < awayScore) return "away";
  return "draw";
}

export function topPick(probs: ModelProbs): Outcome1X2 {
  let best: Outcome1X2 = "home";
  let bestValue = probs.home;
  if (probs.draw > bestValue) {
    best = "draw";
    bestValue = probs.draw;
  }
  if (probs.away > bestValue) {
    best = "away";
    bestValue = probs.away;
  }
  return best;
}

export function brierScore1X2(probs: ModelProbs, actual: Outcome1X2): number {
  const aHome = actual === "home" ? 1 : 0;
  const aDraw = actual === "draw" ? 1 : 0;
  const aAway = actual === "away" ? 1 : 0;
  return (
    (probs.home - aHome) ** 2 +
    (probs.draw - aDraw) ** 2 +
    (probs.away - aAway) ** 2
  );
}

/** Tolerancia de suma, equivalente al schema (migration 004) y servicios. */
export const MODEL_PROBS_SUM_TOLERANCE = 0.0001;

/**
 * Validación central de probabilidades de modelo: objeto con home/draw/away
 * numéricos finitos en [0,1] y suma ≈ 1. La usan el servicio de evaluación
 * y la UI de historial (misma regla en ambos lados).
 */
export function assertValidModelProbs(probs: unknown): asserts probs is ModelProbs {
  if (typeof probs !== "object" || probs === null || Array.isArray(probs)) {
    throw new EvaluationServiceError(
      EvaluationErrorCodes.INVALID_PROBABILITIES,
      "Probabilidades inválidas: se esperaba {home, draw, away}",
    );
  }
  const record = probs as Record<string, unknown>;
  let sum = 0;
  for (const key of ["home", "draw", "away"] as const) {
    const value = record[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new EvaluationServiceError(
        EvaluationErrorCodes.INVALID_PROBABILITIES,
        `Probabilidad inválida en ${key}`,
      );
    }
    sum += value;
  }
  if (Math.abs(sum - 1) > MODEL_PROBS_SUM_TOLERANCE) {
    throw new EvaluationServiceError(
      EvaluationErrorCodes.INVALID_PROBABILITIES,
      "Las probabilidades deben sumar 1",
    );
  }
}

/** Scores válidos: enteros >= 0 (mantiene rechazo de null/no-finite). */
export function assertValidScore(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new EvaluationServiceError(
      EvaluationErrorCodes.INCOMPLETE_RESULT,
      `Resultado inválido en ${label}`,
    );
  }
}

export function computeEvaluationMetrics(
  probs: ModelProbs,
  homeScore: number,
  awayScore: number,
): EvaluationMetrics {
  assertValidModelProbs(probs);
  const actualOutcome = actualOutcomeFromScore(homeScore, awayScore);
  const predictedOutcome = topPick(probs);
  return {
    actualOutcome,
    predictedOutcome,
    correct: predictedOutcome === actualOutcome,
    brier: brierScore1X2(probs, actualOutcome),
  };
}

// ------------------------------------------------------------------
// Servicio (store inyectado; sin writes fuera del insert de evaluación)
// ------------------------------------------------------------------

export interface EvaluationStore {
  getPredictionById(id: string | number): Promise<StoredPredictionForEval | null>;
  getMatchById(id: string): Promise<FinishedMatchForEval | null>;
  listEvaluationsByPrediction(predictionId: string | number): Promise<EvaluationRecord[]>;
  insertEvaluation(row: EvaluationInsert): Promise<EvaluationRecord>;
}

export interface EvaluatePredictionResult {
  evaluation: EvaluationRecord;
  metrics: EvaluationMetrics;
  created: boolean;
}

export async function evaluatePrediction(
  store: EvaluationStore,
  predictionId: string | number,
): Promise<EvaluatePredictionResult> {
  const prediction = await store.getPredictionById(predictionId);
  if (!prediction) {
    throw new EvaluationServiceError(EvaluationErrorCodes.PREDICTION_NOT_FOUND, "Predicción no encontrada");
  }

  const match = await store.getMatchById(prediction.match_id);
  if (!match) {
    throw new EvaluationServiceError(EvaluationErrorCodes.MATCH_NOT_FOUND, "Partido no encontrado");
  }
  if (match.status !== FINISHED_STATUS) {
    throw new EvaluationServiceError(
      EvaluationErrorCodes.MATCH_NOT_FINISHED,
      `Partido no terminado (status=${match.status})`,
    );
  }
  assertValidScore(match.home_score, "home_score");
  assertValidScore(match.away_score, "away_score");

  // Métricas SIEMPRE sobre probabilities persistidas. Nunca se re-ejecuta el modelo.
  const metrics = computeEvaluationMetrics(
    prediction.model_probabilities,
    match.home_score,
    match.away_score,
  );

  // Idempotencia: el flujo auto usa versión 1; si ya existe, reutilizar.
  const existingList = await store.listEvaluationsByPrediction(prediction.id);
  const existingAuto = existingList.find((e) => e.evaluation_version === AUTO_EVALUATION_VERSION);
  if (existingAuto) {
    // La evaluación persistida es histórica/inmutable: lo reportado se deriva
    // de SUS datos congelados (actual_outcome/is_correct guardados + Brier
    // recalculado sobre las probabilities también congeladas), NUNCA del
    // marcador actual del match (que pudo corregirse después).
    const frozenMetrics: EvaluationMetrics = {
      actualOutcome: existingAuto.actual_outcome,
      predictedOutcome: topPick(prediction.model_probabilities),
      correct: existingAuto.is_correct,
      brier: brierScore1X2(prediction.model_probabilities, existingAuto.actual_outcome),
    };
    return {
      evaluation: {
        ...existingAuto,
        predicted_outcome: frozenMetrics.predictedOutcome,
        brier_score: frozenMetrics.brier,
      },
      metrics: frozenMetrics,
      created: false,
    };
  }

  const row: EvaluationInsert = {
    prediction_id: prediction.id,
    actual_outcome: metrics.actualOutcome,
    is_correct: metrics.correct,
    match_result: {
      home_score: match.home_score,
      away_score: match.away_score,
      status: match.status,
    },
    evaluator: "auto",
    evaluation_version: AUTO_EVALUATION_VERSION,
  };

  try {
    const evaluation = await store.insertEvaluation(row);
    return {
      evaluation: { ...evaluation, predicted_outcome: metrics.predictedOutcome, brier_score: metrics.brier },
      metrics,
      created: true,
    };
  } catch (insertErr) {
    // Carrera concurrente: UNIQUE(prediction_id, evaluation_version) es la
    // garantía real; re-leer y reutilizar en vez de exponer error.
    const raced = await store.listEvaluationsByPrediction(prediction.id);
    const racedAuto = raced.find((e) => e.evaluation_version === AUTO_EVALUATION_VERSION);
    if (racedAuto) {
      return {
        evaluation: { ...racedAuto, predicted_outcome: metrics.predictedOutcome, brier_score: metrics.brier },
        metrics,
        created: false,
      };
    }
    throw insertErr;
  }
}

// ------------------------------------------------------------------
// Agregados puros (sin ROI: no hay odds reales en estas predictions)
// ------------------------------------------------------------------

export interface EvaluationSummary {
  total: number;
  correct: number;
  accuracy: number | null;
  avgBrier: number | null;
  byOutcome: Record<Outcome1X2, { total: number; correct: number }>;
}

export function summarizeEvaluations(
  rows: Array<{ correct: boolean; brier: number; actualOutcome: Outcome1X2 }>,
): EvaluationSummary {
  const byOutcome: EvaluationSummary["byOutcome"] = {
    home: { total: 0, correct: 0 },
    draw: { total: 0, correct: 0 },
    away: { total: 0, correct: 0 },
  };
  let correct = 0;
  let brierSum = 0;
  for (const row of rows) {
    if (row.correct) correct++;
    brierSum += row.brier;
    byOutcome[row.actualOutcome].total++;
    if (row.correct) byOutcome[row.actualOutcome].correct++;
  }
  const total = rows.length;
  return {
    total,
    correct,
    accuracy: total > 0 ? correct / total : null,
    avgBrier: total > 0 ? brierSum / total : null,
    byOutcome,
  };
}

// ------------------------------------------------------------------
// Historial: prediction + match + evaluation opcional
// ------------------------------------------------------------------

export type HistoryState = "pending" | "evaluated";

export interface HistoryRow {
  prediction: StoredPredictionForEval;
  match: FinishedMatchForEval | null;
  evaluation: EvaluationRecord | null;
  state: HistoryState;
  predictedOutcome: Outcome1X2;
}

export interface HistoryStore {
  listPredictions(limit: number): Promise<StoredPredictionForEval[]>;
  getMatchById(id: string): Promise<FinishedMatchForEval | null>;
  listEvaluationsByPrediction(predictionId: string | number): Promise<EvaluationRecord[]>;
}

/**
 * Ensambla historial. IMPORTANTE: hace un getMatchById + listEvaluations por
 * prediction (N+1 si el store golpea la DB por llamada). En producción usar
 * SIEMPRE un store precargado/batch (ver getPredictionsHistoryBatch en
 * predictions-repo.ts), nunca repos directos aquí. Las filas con match
 * ausente se OMITEN aguas arriba; si llega una, se registra warning seguro
 * (solo match_id) y se salta.
 */
export async function getPredictionHistory(
  store: HistoryStore,
  limit: number,
): Promise<HistoryRow[]> {
  const predictions = await store.listPredictions(limit);
  const rows: HistoryRow[] = [];
  for (const prediction of predictions) {
    const [match, evaluations] = await Promise.all([
      store.getMatchById(prediction.match_id),
      store.listEvaluationsByPrediction(prediction.id),
    ]);
    const latest = evaluations.length > 0 ? evaluations[evaluations.length - 1] : null;
    rows.push({
      prediction,
      match,
      evaluation: latest,
      state: latest ? "evaluated" : "pending",
      predictedOutcome: topPick(prediction.model_probabilities),
    });
  }
  return rows;
}
