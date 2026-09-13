import {
  actualOutcomeFromScore,
  topPick,
  brierScore1X2,
  computeEvaluationMetrics,
  evaluatePrediction,
  summarizeEvaluations,
  getPredictionHistory,
  EvaluationServiceError,
  AUTO_EVALUATION_VERSION,
  type EvaluationStore,
  type HistoryStore,
  type StoredPredictionForEval,
  type FinishedMatchForEval,
  type EvaluationRecord,
} from "@/lib/ai/evaluation-service";

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

function approx(a: number, b: number, tol = 1e-9): boolean {
  return Math.abs(a - b) <= tol;
}

const PROBS = { home: 0.12842618, draw: 0.2950244, away: 0.57654942 };

function makePrediction(overrides?: Partial<StoredPredictionForEval>): StoredPredictionForEval {
  return {
    id: 2,
    match_id: "m-x",
    market_id: "1x2",
    model_version_id: "v1-dixon-coles-2026-01",
    model_probabilities: { ...PROBS },
    predicted_at: "2026-09-13T06:51:55.267064+00:00",
    kickoff_at: "2026-09-13T12:00:00+00:00",
    ...overrides,
  };
}

function makeMatch(status: string, homeScore: number | null, awayScore: number | null): FinishedMatchForEval {
  return { id: "m-x", status, home_score: homeScore, away_score: awayScore, match_date: "2026-09-13T12:00:00+00:00" };
}

class FakeEvalStore implements EvaluationStore, HistoryStore {
  predictions = new Map<string | number, StoredPredictionForEval>();
  matches = new Map<string, FinishedMatchForEval>();
  evaluations: EvaluationRecord[] = [];
  inserts = 0;
  private seq = 1;

  async getPredictionById(id: string | number): Promise<StoredPredictionForEval | null> {
    return this.predictions.get(id) ?? null;
  }
  async getMatchById(id: string): Promise<FinishedMatchForEval | null> {
    return this.matches.get(id) ?? null;
  }
  async listEvaluationsByPrediction(predictionId: string | number): Promise<EvaluationRecord[]> {
    return this.evaluations
      .filter((e) => String(e.prediction_id) === String(predictionId))
      .sort((a, b) => a.evaluation_version - b.evaluation_version);
  }
  async insertEvaluation(row: {
    prediction_id: string | number;
    actual_outcome: "home" | "draw" | "away";
    is_correct: boolean;
    match_result: Record<string, unknown>;
    evaluator?: string;
    evaluation_version?: number;
  }): Promise<EvaluationRecord> {
    const version = row.evaluation_version ?? 1;
    const clash = this.evaluations.some(
      (e) => String(e.prediction_id) === String(row.prediction_id) && e.evaluation_version === version,
    );
    if (clash) {
      const err = new Error("duplicate key value violates unique constraint");
      (err as { code?: string }).code = "23505";
      throw err;
    }
    this.inserts++;
    const record: EvaluationRecord = {
      id: this.seq++,
      prediction_id: row.prediction_id,
      actual_outcome: row.actual_outcome,
      is_correct: row.is_correct,
      match_result: row.match_result,
      evaluated_at: new Date().toISOString(),
      evaluator: row.evaluator ?? "auto",
      evaluation_version: version,
    };
    this.evaluations.push(record);
    return record;
  }
  async listPredictions(limit: number): Promise<StoredPredictionForEval[]> {
    return [...this.predictions.values()].slice(0, limit);
  }
}

async function runTests(): Promise<void> {
  console.log("=== SMOKE TESTS — Launch Sprint 2 (evaluación + historial) ===\n");

  console.log("--- A/B/C. Outcomes ---");
  check("A: home win", actualOutcomeFromScore(2, 1) === "home");
  check("B: draw", actualOutcomeFromScore(1, 1) === "draw");
  check("C: away win", actualOutcomeFromScore(0, 2) === "away");

  console.log("\n--- D/E/F. Brier ---");
  // Away gana: (0.1284-0)² + (0.2950-0)² + (0.5765-1)²
  const brierAway = brierScore1X2(PROBS, "away");
  const expectedAway = PROBS.home ** 2 + PROBS.draw ** 2 + (PROBS.away - 1) ** 2;
  check("D/F: Brier away correcto", approx(brierAway, expectedAway), `got ${brierAway}`);
  const brierHome = brierScore1X2(PROBS, "home");
  check("D: Brier home correcto", approx(brierHome, (PROBS.home - 1) ** 2 + PROBS.draw ** 2 + PROBS.away ** 2));
  const brierDraw = brierScore1X2(PROBS, "draw");
  check("E: Brier draw correcto", approx(brierDraw, PROBS.home ** 2 + (PROBS.draw - 1) ** 2 + PROBS.away ** 2));
  check("F2: uniforme da 2/3", approx(brierScore1X2({ home: 1 / 3, draw: 1 / 3, away: 1 / 3 }, "home"), 2 / 3));

  console.log("\n--- G/H. Top-pick ---");
  check("G: top-pick away correcto (id=2 style)", topPick(PROBS) === "away");
  const mHome = computeEvaluationMetrics(PROBS, 0, 2);
  check("G2: correct=true si gana away", mHome.correct === true && mHome.actualOutcome === "away" && mHome.predictedOutcome === "away");
  const mWrong = computeEvaluationMetrics(PROBS, 2, 0);
  check("H: correct=false si gana home", mWrong.correct === false && mWrong.actualOutcome === "home");
  check("H2: empate exacto determinista (home primero)", topPick({ home: 0.4, draw: 0.4, away: 0.2 }) === "home");
  check("H3: empate draw/away → draw", topPick({ home: 0.2, draw: 0.4, away: 0.4 }) === "draw");

  console.log("\n--- I/J/K/L. Estados no evaluables ---");
  async function tryStatus(status: string, hs: number | null, as: number | null): Promise<string | null> {
    const store = new FakeEvalStore();
    store.predictions.set(2, makePrediction());
    store.matches.set("m-x", makeMatch(status, hs, as));
    try {
      await evaluatePrediction(store, 2);
      return "evaluated";
    } catch (err) {
      return err instanceof EvaluationServiceError ? err.code : `unexpected:${String(err)}`;
    }
  }
  check("I: scheduled no se evalúa", (await tryStatus("scheduled", null, null)) === "MATCH_NOT_FINISHED");
  check("J: live no se evalúa", (await tryStatus("in_progress", 1, 0)) === "MATCH_NOT_FINISHED");
  check("K: postponed/cancelled no se evalúan", (await tryStatus("postponed", null, null)) === "MATCH_NOT_FINISHED" && (await tryStatus("cancelled", null, null)) === "MATCH_NOT_FINISHED");
  check("L: finished sin scores rechazado", (await tryStatus("finished", null, null)) === "INCOMPLETE_RESULT");

  console.log("\n--- M/N/O. Servicio + idempotencia ---");
  {
    // M: usa probabilities persistidas sin runner (el store no tiene runner).
    const store = new FakeEvalStore();
    store.predictions.set(2, makePrediction());
    store.matches.set("m-x", makeMatch("finished", 0, 2));
    const res = await evaluatePrediction(store, 2);
    check("M: evalúa con probs persistidas (away correcto)", res.created === true && res.metrics.correct === true && res.evaluation.actual_outcome === "away");
    check("M2: versión auto = 1", res.evaluation.evaluation_version === AUTO_EVALUATION_VERSION && res.evaluation.evaluator === "auto");
    check("M3: match_result congelado", (res.evaluation.match_result.home_score as number) === 0);
  }
  {
    // N: existente no duplica.
    const store = new FakeEvalStore();
    store.predictions.set(2, makePrediction());
    store.matches.set("m-x", makeMatch("finished", 0, 2));
    const first = await evaluatePrediction(store, 2);
    const second = await evaluatePrediction(store, 2);
    check("N: segunda llamada reutiliza (created=false, mismo id)", second.created === false && second.evaluation.id === first.evaluation.id && store.inserts === 1);
  }
  {
    // O: 30 concurrentes → 1 sola evaluación.
    const store = new FakeEvalStore();
    store.predictions.set(2, makePrediction());
    store.matches.set("m-x", makeMatch("finished", 1, 1));
    const results = await Promise.all(Array.from({ length: 30 }, () => evaluatePrediction(store, 2)));
    const ids = new Set(results.map((r) => String(r.evaluation.id)));
    check("O: 30 concurrentes → 1 evaluación", store.evaluations.length === 1 && ids.size === 1, `rows=${store.evaluations.length}`);
    check("O2: exactamente 1 created:true", results.filter((r) => r.created).length === 1);
  }

  console.log("\n--- P/Q. Agregados ---");
  {
    const summary = summarizeEvaluations([
      { correct: true, brier: 0.2, actualOutcome: "away" },
      { correct: false, brier: 0.8, actualOutcome: "home" },
      { correct: true, brier: 0.3, actualOutcome: "draw" },
    ]);
    check("P: accuracy 2/3", summary.total === 3 && summary.correct === 2 && approx(summary.accuracy ?? -1, 2 / 3));
    check("Q: avgBrier ≈ 0.4333", approx(summary.avgBrier ?? -1, 1.3 / 3), `got ${summary.avgBrier}`);
    const empty = summarizeEvaluations([]);
    check("Q2: vacío → nulls seguros", empty.accuracy === null && empty.avgBrier === null && empty.total === 0);
  }

  console.log("\n--- R/S. Historial ---");
  {
    const store = new FakeEvalStore();
    store.predictions.set(2, makePrediction());
    store.predictions.set(3, makePrediction({ id: 3, match_id: "m-y" }));
    store.matches.set("m-x", makeMatch("finished", 0, 2));
    store.matches.set("m-y", makeMatch("scheduled", null, null));
    await evaluatePrediction(store, 2);
    const history = await getPredictionHistory(store, 10);
    const pending = history.find((h) => String(h.prediction.id) === "3");
    const evaluated = history.find((h) => String(h.prediction.id) === "2");
    check("R: pending sin evaluation", pending?.state === "pending" && pending.evaluation === null);
    check("S: evaluated con datos (outcome/Brier/correct)", evaluated?.state === "evaluated" && evaluated.evaluation?.actual_outcome === "away" && evaluated.evaluation.is_correct === true);
    check("S2: predictedOutcome en la fila", evaluated?.predictedOutcome === "away");
  }

  console.log("\n======================================================================");
  console.log(
    `RESULTADO FINAL LAUNCH 2: ${failed === 0 ? "TODOS LOS TESTS PASARON ✅✅✅" : `${failed} FALLARON ❌`}`,
  );
  console.log(`Pasaron: ${passed}, Fallaron: ${failed}`);
  console.log("======================================================================");

  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
