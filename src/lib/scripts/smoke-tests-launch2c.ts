import {
  getPredictionsHistoryBatch,
  PredictionReadError,
  toHistoryViewRow,
} from "@/lib/db/repositories/predictions-repo";
import {
  assertValidModelProbs,
  assertValidScore,
  evaluatePrediction,
  EvaluationServiceError,
  type EvaluationStore,
} from "@/lib/ai/evaluation-service";
import type { Prediction } from "@/types/db/tables";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, details?: string): void {
  if (condition) {
    console.log(`[PASS] ${name}`);
    passed++;
  } else {
    console.log(`[FAIL] ${name}${details ? ` - ${details}` : ""}`);
    failed++;
  }
}

function throwsInvalidProbs(value: unknown): boolean {
  try {
    assertValidModelProbs(value);
    return false;
  } catch (err) {
    return err instanceof EvaluationServiceError;
  }
}

function throwsInvalidScore(value: unknown): boolean {
  try {
    assertValidScore(value, "test");
    return false;
  } catch (err) {
    return err instanceof EvaluationServiceError;
  }
}

type FakeMatch = {
  id: string;
  status: string;
  home_score?: number;
  away_score?: number;
  match_date: string;
  home_team_id: string;
  away_team_id: string;
};

function makePrediction(id: number, matchId: string): Prediction {
  return {
    id,
    match_id: matchId,
    market_id: "1x2",
    model_version_id: "v1",
    model_probabilities: { home: 0.4, draw: 0.3, away: 0.3 },
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
    score_version: null,
    score_components: null,
    data_snapshot: {},
    predicted_at: "2026-09-13T06:00:00.000Z",
    kickoff_at: "2026-09-13T12:00:00.000Z",
  };
}

function makeMatch(id: string): FakeMatch {
  return {
    id,
    status: "scheduled",
    match_date: "2026-09-13T12:00:00.000Z",
    home_team_id: `home-of-${id}`,
    away_team_id: `away-of-${id}`,
  };
}

async function runTests(): Promise<void> {
  console.log("=== SMOKE TESTS — Launch 2c (post-auditoría Codex) ===\n");

  console.log("--- A. Scope por competición activa ---");
  {
    // Liga/temporada activa: matches m-a1, m-a2. Otras ligas/seasons/sports: otros ids.
    const scopeIds = ["m-a1", "m-a2"];
    const allPredictions = [
      makePrediction(1, "m-a1"),
      makePrediction(2, "m-a2"),
      makePrediction(3, "m-other-league"),
      makePrediction(4, "m-other-season"),
      makePrediction(5, "m-other-sport"),
    ];
    const seenArgs: { ids: string[]; limit: number }[] = [];
    const deps = {
      listPredictions: async (ids: string[], limit: number) => {
        seenArgs.push({ ids, limit });
        // Fake fiel al contrato: filtra por scope y aplica limit DESPUÉS.
        return allPredictions.filter((p) => ids.includes(p.match_id)).slice(0, limit);
      },
      fetchMatchesByIds: async (ids: string[]) => ids.map(makeMatch),
      listEvals: async () => [],
    };
    const teams = async (ids: string[]) => ids.map((id) => ({ id, name: `Team ${id}` }));
    const history = await getPredictionsHistoryBatch(10, teams, { matchIds: scopeIds }, deps);
    const gotIds = history.rows.map((r) => r.predictionId).sort();
    check("A1: misma league/season aparece", JSON.stringify(gotIds) === JSON.stringify([1, 2]), `got ${JSON.stringify(gotIds)}`);
    check("A2: otra league/season/sport no aparecen", !gotIds.includes(3) && !gotIds.includes(4) && !gotIds.includes(5));
    check("A3: el scope viajó a la query", seenArgs.length === 1 && JSON.stringify([...seenArgs[0].ids].sort()) === JSON.stringify(scopeIds));
  }
  {
    // Limit después del scope: 3 en scope, limit 2 → 2 filas del scope.
    const scopeIds = ["m-a1", "m-a2", "m-a3"];
    const deps = {
      listPredictions: async (ids: string[], limit: number) =>
        [1, 2, 3].map((n) => makePrediction(n, `m-a${n}`)).filter((p) => ids.includes(p.match_id)).slice(0, limit),
      fetchMatchesByIds: async (ids: string[]) => ids.map(makeMatch),
      listEvals: async () => [],
    };
    const teams = async (ids: string[]) => ids.map((id) => ({ id, name: `Team ${id}` }));
    const history = await getPredictionsHistoryBatch(2, teams, { matchIds: scopeIds }, deps);
    check("A4: limit se aplica después del scope (2 filas)", history.rows.length === 2 && history.total === 2, `got ${history.rows.length}`);
  }
  {
    // Sin scope → sin queries, vacío.
    let queried = false;
    const deps = {
      listPredictions: async (): Promise<Prediction[]> => {
        queried = true;
        return [];
      },
      fetchMatchesByIds: async () => [],
      listEvals: async () => [],
    };
    const history = await getPredictionsHistoryBatch(10, async () => [], undefined, deps);
    check("A5: sin scope no hay queries y queda vacío", queried === false && history.total === 0);
  }

  console.log("\n--- B. Errores no son vacío ---");
  {
    const deps = {
      listPredictions: async () => [],
      fetchMatchesByIds: async () => [],
      listEvals: async () => [],
    };
    const history = await getPredictionsHistoryBatch(10, async () => [], { matchIds: ["m-a1"] }, deps);
    check("B1: vacío válido → datos vacíos", history.total === 0 && history.rows.length === 0);
  }
  {
    const deps = {
      listPredictions: async (): Promise<Prediction[]> => {
        throw new Error("supabase caído");
      },
      fetchMatchesByIds: async () => [],
      listEvals: async () => [],
    };
    let threw: unknown = null;
    try {
      await getPredictionsHistoryBatch(10, async () => [], { matchIds: ["m-a1"] }, deps);
    } catch (err) {
      threw = err;
    }
    check("B2: SELECT error → PredictionReadError (no [])", threw instanceof PredictionReadError);
    check("B3: mensaje seguro sin SQL ni secretos", threw instanceof Error && !/select|supabase|service_role|key/i.test(threw.message));
  }

  console.log("\n--- C. Validación central de probabilities ---");
  check("C1: 0.8/0.8/0.1 rechazado (suma)", throwsInvalidProbs({ home: 0.8, draw: 0.8, away: 0.1 }));
  check("C2: objeto incompleto rechazado", throwsInvalidProbs({ home: 0.5, draw: 0.5 }));
  check("C3: strings rechazados", throwsInvalidProbs({ home: "0.5", draw: 0.3, away: 0.2 }));
  check("C4: NaN/Infinity rechazados", throwsInvalidProbs({ home: NaN, draw: 0.5, away: 0.5 }) && throwsInvalidProbs({ home: Infinity, draw: 0, away: 0 }));
  check("C5: null/array rechazados", throwsInvalidProbs(null) && throwsInvalidProbs([0.4, 0.3, 0.3]));
  let validOk = true;
  try {
    assertValidModelProbs({ home: 0.4, draw: 0.3, away: 0.3 });
  } catch {
    validOk = false;
  }
  check("C6: prediction válida sigue funcionando", validOk);

  console.log("\n--- D. Scores enteros >= 0 ---");
  check("D1: -1 rechazado", throwsInvalidScore(-1));
  check("D2: 1.5 rechazado", throwsInvalidScore(1.5));
  check("D3: null rechazado", throwsInvalidScore(null));
  let scoreOk = true;
  try {
    assertValidScore(0, "t");
    assertValidScore(3, "t");
  } catch {
    scoreOk = false;
  }
  check("D4: 0 y positivos válidos", scoreOk);

  console.log("\n--- E. Evaluación v1 congelada ante marcador corregido ---");
  {
    type EvalRow = {
      id: number;
      prediction_id: number;
      actual_outcome: "home" | "draw" | "away";
      is_correct: boolean;
      match_result: Record<string, unknown>;
      evaluated_at: string;
      evaluator: string;
      evaluation_version: number;
    };
    class FrozenStore implements EvaluationStore {
      inserts = 0;
      scores = { home: 0, away: 2 };
      evals: EvalRow[] = [];
      async getPredictionById() {
        return {
          id: 9,
          match_id: "m-e",
          market_id: "1x2",
          model_version_id: "v1",
          model_probabilities: { home: 0.2, draw: 0.3, away: 0.5 },
          predicted_at: "2026-09-13T06:00:00.000Z",
          kickoff_at: "2026-09-13T12:00:00+00:00",
        };
      }
      async getMatchById() {
        return {
          id: "m-e",
          status: "finished",
          home_score: this.scores.home,
          away_score: this.scores.away,
          match_date: "2026-09-13T12:00:00+00:00",
        };
      }
      async listEvaluationsByPrediction() {
        return this.evals;
      }
      async insertEvaluation(row: {
        prediction_id: string | number;
        actual_outcome: "home" | "draw" | "away";
        is_correct: boolean;
        match_result: Record<string, unknown>;
        evaluator?: string;
        evaluation_version?: number;
      }): Promise<EvalRow> {
        const record: EvalRow = {
          id: this.evals.length + 1,
          prediction_id: row.prediction_id as number,
          actual_outcome: row.actual_outcome,
          is_correct: row.is_correct,
          match_result: row.match_result,
          evaluated_at: new Date().toISOString(),
          evaluator: row.evaluator ?? "auto",
          evaluation_version: row.evaluation_version ?? 1,
        };
        this.evals.push(record);
        this.inserts++;
        return record;
      }
    }
    const store = new FrozenStore();
    const first = await evaluatePrediction(store, 9);
    check("E1: v1 creada (away correcto)", first.created === true && first.metrics.actualOutcome === "away" && first.metrics.correct === true);
    const brierV1 = first.metrics.brier;
    // Simular corrección posterior del marcador: 2-0 en vez de 0-2.
    store.scores = { home: 2, away: 0 };
    const second = await evaluatePrediction(store, 9);
    check("E2: segunda llamada reutiliza v1 (created=false)", second.created === false && second.evaluation.id === first.evaluation.id);
    check("E3: outcome/correct/Brier congelados de v1", second.metrics.actualOutcome === "away" && second.metrics.correct === true && second.metrics.brier === brierV1, `brier=${second.metrics.brier} vs ${brierV1}`);
    check("E4: no inserta nueva evaluación", store.inserts === 1);
  }

  console.log("\n--- F. Fila inválida en UI ---");
  {
    const bad = {
      prediction: {
        id: 7,
        match_id: "m-bad",
        market_id: "1x2",
        model_version_id: "v1",
        model_probabilities: { home: 0.8, draw: 0.8, away: 0.1 },
        predicted_at: "2026-09-13T06:00:00.000Z",
        kickoff_at: "2026-09-13T12:00:00+00:00",
      },
      match: {
        id: "m-bad",
        status: "scheduled",
        home_score: null,
        away_score: null,
        match_date: "2026-09-13T12:00:00+00:00",
        home_team_id: "h",
        away_team_id: "a",
      },
      evaluation: null,
      state: "pending" as const,
      predictedOutcome: "home" as const,
    };
    const view = toHistoryViewRow(bad, { h: "H", a: "A" });
    check("F1: fila inválida marcada (no 0/0/0 silencioso)", view.valid === false);
    check("F2: inválida excluida de agregados (brier null)", view.brier === null);
  }

  console.log("\n======================================================================");
  console.log(
    `RESULTADO FINAL LAUNCH 2c: ${failed === 0 ? "TODOS LOS TESTS PASARON ✅✅✅" : `${failed} FALLARON ❌`}`,
  );
  console.log(`Pasaron: ${passed}, Fallaron: ${failed}`);
  console.log("======================================================================");

  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
