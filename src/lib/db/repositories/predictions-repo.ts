import "server-only";
import { ensureDbReady } from "@/lib/db/client";
import { getMatchesByIds } from "@/lib/db/repositories/matches-repo";
import type { Prediction, PredictionEvaluation } from "@/types/db/tables";
import {
  getPredictionHistory,
  summarizeEvaluations,
  assertValidModelProbs,
  brierScore1X2,
  topPick,
  type HistoryRow,
  type EvaluationSummary,
} from "@/lib/ai/evaluation-service";

/**
 * Lecturas de historial de predicciones. SOLO SELECT: jamás inserta,
 * actualiza ni borra. El runner de IA nunca se ejecuta desde aquí.
 *
 * Errores de lectura NO se convierten en lista vacía: se propagan como
 * PredictionReadError (la página los muestra como estado de error seguro).
 */

export class PredictionReadError extends Error {
  readonly code = "PREDICTION_READ_ERROR";
  constructor(source: string) {
    super(`No se pudo cargar el historial de predicciones (${source}).`);
    this.name = "PredictionReadError";
  }
}

function throwIfReadError(result: { error: unknown }, source: string): void {
  if (result.error) {
    // Log server-side seguro: solo origen, sin SQL ni secretos.
    console.error(`[predictions-repo] fallo de lectura en ${source}.`);
    throw new PredictionReadError(source);
  }
}

export async function listPredictionRows(limit: number): Promise<Prediction[]> {
  const db = await ensureDbReady();
  const result = await db
    .from<Prediction>("predictions")
    .order("predicted_at", "desc")
    .limit(limit)
    .select();
  throwIfReadError(result, "predictions");
  return result.data;
}

/**
 * Scope por competición: filtra por match_ids ANTES del limit, en la misma
 * query (IN + ORDER + LIMIT). Así /[sport]/predictions muestra solo la
 * competición/temporada activa y el limit no deja fuera filas del scope.
 */
export async function listPredictionRowsByMatchIds(
  matchIds: string[],
  limit: number,
): Promise<Prediction[]> {
  if (matchIds.length === 0) return [];
  const db = await ensureDbReady();
  const result = await db
    .from<Prediction>("predictions")
    .in("match_id", matchIds)
    .order("predicted_at", "desc")
    .limit(limit)
    .select();
  throwIfReadError(result, "predictions-by-match");
  return result.data;
}

export async function listEvaluationRowsByPredictionIds(
  predictionIds: Array<string | number>,
): Promise<PredictionEvaluation[]> {
  if (predictionIds.length === 0) return [];
  const db = await ensureDbReady();
  const result = await db
    .from<PredictionEvaluation>("prediction_evaluations")
    .in("prediction_id", predictionIds as never[])
    .select();
  throwIfReadError(result, "prediction_evaluations");
  return result.data;
}

export interface HistoryViewRow {
  predictionId: string | number;
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffAt: string;
  predictedAt: string;
  modelVersionId: string;
  marketId: string;
  probsPct: { home: number; draw: number; away: number };
  topPick: "home" | "draw" | "away";
  topPickLabel: string;
  expectedGoals: { home: number; away: number } | null;
  state: "pending" | "evaluated";
  result: { homeScore: number; awayScore: number } | null;
  actualOutcome: "home" | "draw" | "away" | null;
  predictedOutcome: "home" | "draw" | "away" | null;
  correct: boolean | null;
  brier: number | null;
  /** Siempre false en esta fase: odds_used es NULL (sin mercado asociado). */
  hasValueSection: boolean;
  /**
   * false si model_probabilities persistidas son inválidas (misma regla que
   * evaluation-service: objeto, finitos en [0,1], suma ≈ 1). Esas filas se
   * muestran como "Predicción inválida" y se excluyen de agregados.
   */
  valid: boolean;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function probsFromJsonb(value: unknown): { home: number; draw: number; away: number } | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const home = num(record.home);
  const draw = num(record.draw);
  const away = num(record.away);
  if (home === null || draw === null || away === null) return null;
  return { home, draw, away };
}

function expectedGoalsFromSnapshot(value: unknown): { home: number; away: number } | null {
  const record = asRecord(value);
  const xg = record ? asRecord(record.expectedGoals) : null;
  if (!xg) return null;
  const home = num(xg.home);
  const away = num(xg.away);
  if (home === null || away === null) return null;
  return { home, away };
}

const OUTCOME_LABEL: Record<HistoryViewRow["topPick"], string> = {
  home: "Local",
  draw: "Empate",
  away: "Visitante",
};

/** Mapper puro HistoryRow (con match presente) + nombres → fila de vista. */
export function toHistoryViewRow(
  row: Omit<HistoryRow, "match"> & {
    match: NonNullable<HistoryRow["match"]>;
  },
  teamNames: Record<string, string>,
): HistoryViewRow {
  // Sin transformación silenciosa: si el JSON persistido es inválido, la fila
  // se marca y la UI muestra "Predicción inválida" (nunca 0/0/0 como real).
  let valid = true;
  let probs = probsFromJsonb(row.prediction.model_probabilities);
  try {
    assertValidModelProbs(row.prediction.model_probabilities);
  } catch {
    valid = false;
    probs = null;
  }
  const safeProbs = probs ?? { home: 0, draw: 0, away: 0 };
  const pick = topPick(safeProbs);
  const evaluation = row.evaluation;
  const actualOutcome =
    evaluation && (evaluation.actual_outcome === "home" || evaluation.actual_outcome === "draw" || evaluation.actual_outcome === "away")
      ? evaluation.actual_outcome
      : null;
  const resultRecord = evaluation ? asRecord(evaluation.match_result) : null;
  const homeScore = resultRecord ? num(resultRecord.home_score) : null;
  const awayScore = resultRecord ? num(resultRecord.away_score) : null;
  const homeTeamId = row.match.home_team_id ?? row.prediction.match_id;
  const awayTeamId = row.match.away_team_id ?? row.prediction.match_id;
  return {
    predictionId: row.prediction.id,
    matchId: row.prediction.match_id,
    homeTeamId,
    awayTeamId,
    homeTeamName: teamNames[homeTeamId] ?? homeTeamId,
    awayTeamName: teamNames[awayTeamId] ?? awayTeamId,
    kickoffAt: row.prediction.kickoff_at,
    predictedAt: row.prediction.predicted_at,
    modelVersionId: row.prediction.model_version_id,
    marketId: row.prediction.market_id,
    probsPct: {
      home: safeProbs.home * 100,
      draw: safeProbs.draw * 100,
      away: safeProbs.away * 100,
    },
    topPick: pick,
    topPickLabel: OUTCOME_LABEL[pick],
    expectedGoals: expectedGoalsFromSnapshot(row.prediction.data_snapshot),
    state: row.state,
    result: homeScore !== null && awayScore !== null ? { homeScore, awayScore } : null,
    actualOutcome,
    predictedOutcome: evaluation && valid ? pick : null,
    correct: evaluation ? evaluation.is_correct : null,
    brier: actualOutcome && valid ? brierScore1X2(safeProbs, actualOutcome) : null,
    hasValueSection: false,
    valid,
  };
}

export interface PredictionsHistory {
  rows: HistoryViewRow[];
  summary: EvaluationSummary;
  total: number;
}

export interface HistoryScope {
  /** Match IDs de la competición/temporada activa. Sin scope no hay queries. */
  matchIds: string[];
}

export interface BatchMatch {
  id: string;
  status: string;
  home_score?: number | null;
  away_score?: number | null;
  match_date: string;
  home_team_id: string;
  away_team_id: string;
}

export interface HistoryBatchDeps {
  listPredictions?: (matchIds: string[], limit: number) => Promise<Prediction[]>;
  fetchMatchesByIds?: (ids: string[]) => Promise<BatchMatch[]>;
  listEvals?: (ids: Array<string | number>) => Promise<PredictionEvaluation[]>;
}

/**
 * Historial batch: 3 queries (predictions con scope, matches, evaluations)
 * + 1 de equipos. Sin N+1: el store de evaluation-service se alimenta con
 * Maps precargados. Sin writes, sin runner.
 *
 * Scope: el caller resuelve la competición activa y pasa sus match_ids; el
 * filtro se aplica ANTES del limit (en la query IN + ORDER + LIMIT) y se
 * refuerza defensivamente en memoria. Sin scope (o scope vacío) no se
 * consulta nada: evita exponer otras ligas/temporadas por defecto.
 */
export async function getPredictionsHistoryBatch(
  limit: number,
  fetchTeamsByIds: (ids: string[]) => Promise<Array<{ id: string; name: string }>>,
  scope?: HistoryScope,
  deps?: HistoryBatchDeps,
): Promise<PredictionsHistory> {
  const scopedIds = [...new Set(scope?.matchIds ?? [])];
  if (scopedIds.length === 0) {
    return { rows: [], summary: summarizeEvaluations([]), total: 0 };
  }
  const listPredictions = deps?.listPredictions ?? listPredictionRowsByMatchIds;
  const fetchMatchesByIds: (ids: string[]) => Promise<BatchMatch[]> = deps?.fetchMatchesByIds ?? getMatchesByIds;
  const listEvals = deps?.listEvals ?? listEvaluationRowsByPredictionIds;
  let predictions: Prediction[];
  let matches: BatchMatch[];
  let evaluations: PredictionEvaluation[];
  try {
    predictions = await listPredictions(scopedIds, limit);
    const returnedIds = [...new Set(predictions.map((p) => p.match_id))];
    [matches, evaluations] = await Promise.all([
      fetchMatchesByIds(returnedIds),
      listEvals(predictions.map((p) => p.id)),
    ]);
  } catch (err) {
    if (err instanceof PredictionReadError) throw err;
    console.error("[predictions-repo] fallo de lectura en history-batch.");
    throw new PredictionReadError("history-batch");
  }
  // Defensa en profundidad: solo filas del scope, como máximo `limit`.
  const scopeSet = new Set(scopedIds);
  const scoped = predictions
    .filter((p) => scopeSet.has(p.match_id))
    .slice(0, limit);
  const matchMap = new Map(matches.map((m) => [m.id, m]));
  const evalMap = new Map<string | number, (typeof evaluations)[number][]>();
  for (const evaluation of evaluations) {
    const key = evaluation.prediction_id;
    const list = evalMap.get(key) ?? [];
    list.push(evaluation);
    evalMap.set(key, list);
  }
  for (const list of evalMap.values()) {
    list.sort((a, b) => a.evaluation_version - b.evaluation_version);
  }

  const history = await getPredictionHistory(
    {
      listPredictions: async () =>
        scoped
          .filter((prediction) => {
            const ok = matchMap.has(prediction.match_id);
            if (!ok) {
              // Integridad: prediction huérfana (match borrado). Se omite de
              // la UI y se deja rastro server-side seguro (solo match_id).
              console.warn(`[predictions-repo] prediction sin match: ${prediction.match_id}.`);
            }
            return ok;
          })
          .map((prediction) => ({
            id: prediction.id,
            match_id: prediction.match_id,
            market_id: prediction.market_id,
            model_version_id: prediction.model_version_id,
            // Se pasa el JSON CRUDO: toHistoryViewRow valida y marca inválidas.
            model_probabilities: prediction.model_probabilities as unknown as {
              home: number;
              draw: number;
              away: number;
            },
            predicted_at: prediction.predicted_at,
            kickoff_at: prediction.kickoff_at,
            data_snapshot: asRecord(prediction.data_snapshot),
          })),
      getMatchById: async (id: string) => {
        const match = matchMap.get(id);
        if (!match) return null;
        return {
          id: match.id,
          status: match.status,
          home_score: match.home_score ?? null,
          away_score: match.away_score ?? null,
          match_date: match.match_date,
          home_team_id: match.home_team_id,
          away_team_id: match.away_team_id,
        };
      },
      listEvaluationsByPrediction: async (predictionId: string | number) =>
        (evalMap.get(predictionId) ?? []).map((e) => ({
          id: e.id,
          prediction_id: e.prediction_id,
          actual_outcome: e.actual_outcome as "home" | "draw" | "away",
          is_correct: e.is_correct,
          match_result: (e.match_result ?? {}) as Record<string, unknown>,
          evaluated_at: e.evaluated_at,
          evaluator: e.evaluator,
          evaluation_version: e.evaluation_version,
        })),
    },
    limit,
  );

  const withMatch = history.filter((h): h is Omit<typeof h, "match"> & { match: NonNullable<typeof h.match> } => h.match !== null);
  const teamIds = [
    ...new Set(
      withMatch.flatMap((h) => [h.match.home_team_id, h.match.away_team_id].filter((id): id is string => typeof id === "string")),
    ),
  ];
  const teams = await fetchTeamsByIds(teamIds);
  const teamNames: Record<string, string> = {};
  for (const team of teams) teamNames[team.id] = team.name;

  const rows = withMatch.map((row) => toHistoryViewRow(row, teamNames));
  const summary = summarizeEvaluations(
    rows.flatMap((row) =>
      row.valid && row.state === "evaluated" && row.brier !== null && row.actualOutcome
        ? [{ correct: row.correct === true, brier: row.brier, actualOutcome: row.actualOutcome }]
        : [],
    ),
  );
  return { rows, summary, total: rows.length };
}
