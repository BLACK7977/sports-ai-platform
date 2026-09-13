import {
  toHistoryViewRow,
  type HistoryViewRow,
} from "@/lib/db/repositories/predictions-repo";
import {
  summarizeEvaluations,
  getPredictionHistory,
  type HistoryRow,
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

type RowWithMatch = Omit<HistoryRow, "match"> & {
  match: NonNullable<HistoryRow["match"]>;
};

function pendingRow(): RowWithMatch {
  return {
    prediction: {
      id: 2,
      match_id: "m-x",
      market_id: "1x2",
      model_version_id: "v1-dixon-coles-2026-01",
      model_probabilities: { home: 0.12842618, draw: 0.2950244, away: 0.57654942 },
      predicted_at: "2026-09-13T06:51:55.267064+00:00",
      kickoff_at: "2026-09-13T12:00:00+00:00",
      data_snapshot: {
        expectedGoals: { home: 0.56, away: 1.451 },
      },
    },
    match: {
      id: "m-x",
      status: "scheduled",
      home_score: null,
      away_score: null,
      match_date: "2026-09-13T12:00:00+00:00",
      home_team_id: "team-h",
      away_team_id: "team-a",
    },
    evaluation: null,
    state: "pending",
    predictedOutcome: "away",
  };
}

function evaluatedRow(): RowWithMatch {
  const base = pendingRow();
  const baseMatch = base.match;
  return {
    ...base,
    match: { ...baseMatch, status: "finished", home_score: 0, away_score: 2 },
    evaluation: {
      id: 1,
      prediction_id: 2,
      actual_outcome: "away",
      is_correct: true,
      match_result: { home_score: 0, away_score: 2, status: "finished" },
      evaluated_at: "2026-09-13T14:00:00+00:00",
      evaluator: "auto",
      evaluation_version: 1,
    },
    state: "evaluated",
  };
}

const NAMES = { "team-h": "Silkeborg IF", "team-a": "Viborg FF" };

async function runTests(): Promise<void> {
  console.log("=== SMOKE TESTS — Launch 2b (historial UI, solo lectura) ===\n");

  console.log("--- Pending /Evaluated ---");
  const pending: HistoryViewRow = toHistoryViewRow(pendingRow(), NAMES);
  check("pending: estado + sin resultado", pending.state === "pending" && pending.result === null);
  check("pending: correct/brier null", pending.correct === null && pending.brier === null);
  check("pending: top pick away + pct", pending.topPick === "away" && pending.topPickLabel === "Visitante");
  check("pending: probs 12.84/29.50/57.65", pending.probsPct.home.toFixed(2) === "12.84" && pending.probsPct.away.toFixed(2) === "57.65");
  check("pending: nombres de equipos", pending.homeTeamName === "Silkeborg IF" && pending.awayTeamName === "Viborg FF");
  check("pending: sin sección value", pending.hasValueSection === false);

  const evaluated: HistoryViewRow = toHistoryViewRow(evaluatedRow(), NAMES);
  check("evaluated: estado + resultado 0-2", evaluated.state === "evaluated" && evaluated.result?.homeScore === 0 && evaluated.result?.awayScore === 2);
  check("evaluated: correct + Brier>0", evaluated.correct === true && (evaluated.brier ?? -1) > 0);
  check("evaluated: outcomes", evaluated.actualOutcome === "away" && evaluated.predictedOutcome === "away");

  console.log("\n--- Performance ---");
  const empty = summarizeEvaluations([]);
  check("empty: total 0, sin 0% engañoso", empty.total === 0 && empty.accuracy === null && empty.avgBrier === null);
  const withData = summarizeEvaluations([
    { correct: true, brier: 0.2, actualOutcome: "away" },
    { correct: false, brier: 0.9, actualOutcome: "home" },
  ]);
  check("evaluated: accuracy 50% + Brier medio", withData.total === 2 && withData.accuracy === 0.5 && withData.avgBrier === 0.55);

  console.log("\n--- Robustez ---");
  const noXgBase = pendingRow();
  const noXgRow: HistoryViewRow = toHistoryViewRow(
    {
      ...noXgBase,
      prediction: { ...noXgBase.prediction, data_snapshot: null },
    },
    NAMES,
  );
  check("xG opcional ausente no rompe (null)", noXgRow.expectedGoals === null);
  check("xG presente se lee", pending.expectedGoals?.home === 0.56 && pending.expectedGoals?.away === 1.451);
  const nullOdds: HistoryViewRow = toHistoryViewRow(pendingRow(), NAMES);
  check("null odds no rompe (sin value)", nullOdds.hasValueSection === false);

  console.log("\n--- Sin mutación en lectura ---");
  let writes = 0;
  const countingStore = {
    predictions: [pendingRow().prediction],
    async listPredictions() {
      return this.predictions;
    },
    async getMatchById() {
      return pendingRow().match;
    },
    async listEvaluationsByPrediction() {
      return [];
    },
    async insertEvaluation() {
      writes++;
      throw new Error("no debe insertar en lectura");
    },
  };
  const history = await getPredictionHistory(
    countingStore as unknown as Parameters<typeof getPredictionHistory>[0],
    10,
  );
  check("lectura no muta (0 writes, 1 fila pending)", writes === 0 && history.length === 1 && history[0].state === "pending");

  console.log("\n======================================================================");
  console.log(
    `RESULTADO FINAL LAUNCH 2b: ${failed === 0 ? "TODOS LOS TESTS PASARON ✅✅✅" : `${failed} FALLARON ❌`}`,
  );
  console.log(`Pasaron: ${passed}, Fallaron: ${failed}`);
  console.log("======================================================================");

  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
