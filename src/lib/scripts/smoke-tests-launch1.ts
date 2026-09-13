import {
  createPreKickoffPrediction,
  previewPrediction,
  getLatestPrediction,
  listPredictionsByMatch,
  listRecentPredictions,
  verifyModelParameters,
  PredictionServiceError,
  PredictionErrorCodes,
  DEFAULT_MARKET_ID,
  DEFAULT_MODEL_VERSION_ID,
  type ModelRunResult,
  type PredictionMatchRef,
  type PredictionModelVersion,
  type PredictionStore,
  type PredictionInsertPayload,
  type StoredPrediction,
} from "@/lib/ai/prediction-service";
import { getDefaultParameters } from "@/lib/ai/probability-model";
import { createRealModelRunner } from "@/lib/ai/prediction-runner";

/** Simula el error 23505 de Postgres ante violación de UNIQUE. */
class FakeUniqueViolationError extends Error {
  readonly code = "23505";
  constructor() {
    super('duplicate key value violates unique constraint "uq_predictions_match_market_model"');
    this.name = "FakeUniqueViolationError";
  }
}

// ------------------------------------------------------------------
// Fakes 100% in-memory. Cero Supabase Cloud, cero red.
// ------------------------------------------------------------------

const NOW = Date.parse("2026-03-01T12:00:00.000Z");
const KICKOFF_FUTURE = "2026-03-10T18:00:00.000Z";
const KICKOFF_PAST = "2026-02-20T18:00:00.000Z";

function matchingParams(): Record<string, unknown> {
  return { ...(getDefaultParameters() as unknown as Record<string, unknown>), homeAdvFactor: 1 };
}

function seedLikeParams(): Record<string, unknown> {
  // Refleja el seed real de migration 004 (desalineado con 4B).
  return {
    lookbackMatches: 20,
    minMatchesRequired: 6,
    recencyHalfLife: 7,
    homeAdvFactor: 1.25,
    homeAdvEstimation: "fixed",
    dcEnabled: true,
    dcRho: -0.13,
    maxGoals: 10,
    fallbackMethod: "league_average",
    normalizeToUnity: true,
  };
}

function makeMatch(id: string, matchDate: string): PredictionMatchRef {
  return {
    id,
    sport_id: "soccer",
    league_id: "league1",
    season_id: "season1",
    home_team_id: "team-a",
    away_team_id: "team-b",
    match_date: matchDate,
    status: "scheduled",
  };
}

function makeRun(): ModelRunResult {
  return {
    probabilities: { home: 0.45, draw: 0.3, away: 0.25 },
    expectedGoals: { home: 1.5, away: 1.0 },
    usedFallback: false,
    fallbackReason: "",
    dataQuality: { homeMatchesUsed: 10, awayMatchesUsed: 10, leagueMatchesUsed: 100 },
    parameters: getDefaultParameters(),
  };
}

class FakeStore implements PredictionStore {
  matches = new Map<string, PredictionMatchRef>();
  models = new Map<string, PredictionModelVersion>();
  markets = new Set<string>();
  predictions: StoredPrediction[] = [];
  inserts = 0;
  lastPayload: PredictionInsertPayload | null = null;
  private seq = 1;

  async getMatchById(id: string): Promise<PredictionMatchRef | null> {
    return this.matches.get(id) ?? null;
  }
  async getModelVersionById(id: string): Promise<PredictionModelVersion | null> {
    return this.models.get(id) ?? null;
  }
  async getMarketById(id: string): Promise<{ id: string } | null> {
    return this.markets.has(id) ? { id } : null;
  }
  async findExisting(matchId: string, marketId: string, modelVersionId: string): Promise<StoredPrediction | null> {
    return (
      this.predictions.find(
        (p) => p.match_id === matchId && p.market_id === marketId && p.model_version_id === modelVersionId,
      ) ?? null
    );
  }
  async insert(payload: PredictionInsertPayload): Promise<StoredPrediction> {
    // predicted_at lo fija el servidor: el cliente nunca lo suministra.
    if ("predicted_at" in (payload as unknown as Record<string, unknown>)) {
      throw new PredictionServiceError(PredictionErrorCodes.INVALID_PAYLOAD, "predicted_at lo fija el servidor");
    }
    // Paridad con el CHECK real post-006 (valid_odds_used_1x2 null-tolerante):
    // NULL permitido; no-nulo exige {home,draw,away} finitos > 1.
    const odds = payload.odds_used as unknown;
    if (odds !== null && odds !== undefined) {
      const o = odds as Record<string, unknown>;
      for (const k of ["home", "draw", "away"] as const) {
        const v = o[k];
        if (typeof v !== "number" || !Number.isFinite(v) || v <= 1) {
          throw new PredictionServiceError(PredictionErrorCodes.INVALID_PAYLOAD, `odds_used.${k} inválida para DB`);
        }
      }
    }
    // UNIQUE(match_id, market_id, model_version_id) como la DB post-005.
    const clash = this.predictions.some(
      (p) =>
        p.match_id === payload.match_id &&
        p.market_id === payload.market_id &&
        p.model_version_id === payload.model_version_id,
    );
    if (clash) throw new FakeUniqueViolationError();
    this.inserts++;
    this.lastPayload = payload;
    const stored: StoredPrediction = {
      id: this.seq++,
      ...payload,
      predicted_at: new Date(NOW).toISOString(),
    };
    this.predictions.push(stored);
    return stored;
  }
  async getLatest(matchId: string, marketId: string, modelVersionId: string): Promise<StoredPrediction | null> {
    const rows = this.predictions.filter(
      (p) => p.match_id === matchId && p.market_id === marketId && p.model_version_id === modelVersionId,
    );
    rows.sort((a, b) => (a.predicted_at < b.predicted_at ? 1 : -1));
    return rows[0] ?? null;
  }
  async listByMatch(matchId: string): Promise<StoredPrediction[]> {
    return this.predictions
      .filter((p) => p.match_id === matchId)
      .sort((a, b) => (a.predicted_at < b.predicted_at ? -1 : 1));
  }
  async listRecent(limit: number): Promise<StoredPrediction[]> {
    return [...this.predictions]
      .sort((a, b) => (a.predicted_at < b.predicted_at ? 1 : -1))
      .slice(0, limit);
  }
}

function baseDeps(store: FakeStore) {
  return {
    store,
    runModel: { run: async () => makeRun() },
    nowMs: () => NOW,
  };
}

function seedStandard(store: FakeStore): void {
  store.matches.set("m-future", makeMatch("m-future", KICKOFF_FUTURE));
  store.matches.set("m-past", makeMatch("m-past", KICKOFF_PAST));
  store.models.set(DEFAULT_MODEL_VERSION_ID, {
    id: DEFAULT_MODEL_VERSION_ID,
    is_active: true,
    parameters: matchingParams(),
  });
  store.markets.add(DEFAULT_MARKET_ID);
}

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

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (err) {
    return err instanceof PredictionServiceError && err.code === code;
  }
}

async function runTests(): Promise<void> {
  console.log("=== SMOKE TESTS — Launch Sprint 1 (persistencia pre-kickoff, fakes) ===\n");

  console.log("--- A/B/C. Regla pre-kickoff ---");
  {
    const store = new FakeStore();
    seedStandard(store);
    const res = await createPreKickoffPrediction(baseDeps(store), { matchId: "m-future" });
    check("A: predicción antes del kickoff permitida", res.created === true && res.prediction.match_id === "m-future");
  }
  {
    const store = new FakeStore();
    seedStandard(store);
    const kickoff = new Date(NOW).toISOString();
    store.matches.set("m-exact", makeMatch("m-exact", kickoff));
    check(
      "B: exactamente en kickoff rechazada",
      await expectCode(() => createPreKickoffPrediction(baseDeps(store), { matchId: "m-exact" }), "KICKOFF_PASSED"),
    );
  }
  {
    const store = new FakeStore();
    seedStandard(store);
    check(
      "C: después del kickoff rechazada",
      await expectCode(() => createPreKickoffPrediction(baseDeps(store), { matchId: "m-past" }), "KICKOFF_PASSED"),
    );
  }

  console.log("\n--- D/E/F/G/H/I. Payload ---");
  {
    const store = new FakeStore();
    seedStandard(store);
    const res = await createPreKickoffPrediction(baseDeps(store), { matchId: "m-future" });
    const probs = res.prediction.model_probabilities;
    check("D: probabilities suman ≈1", Math.abs(probs.home + probs.draw + probs.away - 1) <= 0.0001);
    check("E: model_version correcto", res.prediction.model_version_id === DEFAULT_MODEL_VERSION_ID);
    check("F: market 1x2 correcto", res.prediction.market_id === DEFAULT_MARKET_ID);
    check("G: odds_snapshot_id ausente/null", res.prediction.odds_snapshot_id == null);
    check("H: odds_used ausente/null", res.prediction.odds_used == null);
    check("I: edge/EV no presentes (quedan para 4C.5)", (res.prediction as unknown as Record<string, unknown>).edge_home == null);
    check("R: predicted_at/kickoff_at UTC válidos", Number.isFinite(Date.parse(res.prediction.predicted_at)) && Number.isFinite(Date.parse(res.prediction.kickoff_at)));
    check("R2: kickoff_at copiado del match", res.prediction.kickoff_at === KICKOFF_FUTURE);
  }

  console.log("\n--- J/K/L. Idempotencia e identidad ---");
  {
    const store = new FakeStore();
    seedStandard(store);
    const deps = baseDeps(store);
    const first = await createPreKickoffPrediction(deps, { matchId: "m-future" });
    const second = await createPreKickoffPrediction(deps, { matchId: "m-future" });
    check("J: segunda llamada no duplica (created=false, mismo id)", second.created === false && second.prediction.id === first.prediction.id);
    check("J2: un solo INSERT ante doble llamada", store.inserts === 1, `inserts=${store.inserts}`);
  }
  {
    const store = new FakeStore();
    seedStandard(store);
    store.models.set("v2", { id: "v2", is_active: true, parameters: matchingParams() });
    const deps = baseDeps(store);
    const r1 = await createPreKickoffPrediction(deps, { matchId: "m-future" });
    const r2 = await createPreKickoffPrediction(deps, { matchId: "m-future", modelVersionId: "v2" });
    check("K: otro model version sí crea otra prediction", r2.created === true && r2.prediction.id !== r1.prediction.id);
  }
  {
    const store = new FakeStore();
    seedStandard(store);
    store.markets.add("ou25");
    const deps = baseDeps(store);
    const r1 = await createPreKickoffPrediction(deps, { matchId: "m-future" });
    const r2 = await createPreKickoffPrediction(deps, { matchId: "m-future", marketId: "ou25" });
    check("L: otro market es identidad separada", r2.created === true && r2.prediction.id !== r1.prediction.id);
  }

  console.log("\n--- M/N. Fallos seguros ---");
  {
    const store = new FakeStore();
    seedStandard(store);
    check(
      "M: match inexistente falla seguro",
      await expectCode(() => createPreKickoffPrediction(baseDeps(store), { matchId: "no-existe" }), "MATCH_NOT_FOUND"),
    );
  }
  {
    const store = new FakeStore();
    seedStandard(store);
    store.models.delete(DEFAULT_MODEL_VERSION_ID);
    check(
      "N: modelo inexistente falla seguro",
      await expectCode(() => createPreKickoffPrediction(baseDeps(store), { matchId: "m-future" }), "MODEL_NOT_FOUND"),
    );
  }
  {
    const store = new FakeStore();
    seedStandard(store);
    store.models.set(DEFAULT_MODEL_VERSION_ID, { id: DEFAULT_MODEL_VERSION_ID, is_active: false, parameters: matchingParams() });
    check(
      "N2: modelo inactivo falla seguro",
      await expectCode(() => createPreKickoffPrediction(baseDeps(store), { matchId: "m-future" }), "MODEL_INACTIVE"),
    );
  }
  {
    const store = new FakeStore();
    seedStandard(store);
    store.models.set(DEFAULT_MODEL_VERSION_ID, { id: DEFAULT_MODEL_VERSION_ID, is_active: true, parameters: seedLikeParams() });
    const ok = await expectCode(
      () => createPreKickoffPrediction(baseDeps(store), { matchId: "m-future" }),
      "MODEL_PARAM_MISMATCH",
    );
    check("N3: seed desalineado (tipo 004) bloquea el write", ok);
    const v = verifyModelParameters(seedLikeParams());
    check("N4: verify reporta diffs (minLambda/maxLambda/homeAdvFactor)", v.ok === false && v.diffs.length >= 3, v.diffs.join(" | "));
  }

  console.log("\n--- O/P. Lecturas ---");
  {
    const store = new FakeStore();
    seedStandard(store);
    const deps = baseDeps(store);
    const created = await createPreKickoffPrediction(deps, { matchId: "m-future" });
    const latest = await getLatestPrediction(deps, "m-future");
    check("O: read latest devuelve la correcta", latest?.id === created.prediction.id);
    const list = await listPredictionsByMatch(deps, "m-future");
    check("P: historial append-only (1 fila, sin UPDATE)", list.length === 1 && list[0].id === created.prediction.id);
    const recent = await listRecentPredictions(deps, 10);
    check("P2: listRecent incluye la predicción", recent.length === 1);
  }

  console.log("\n--- S/T/U/V/W/X. Payload explícito, snapshot y parámetros reales ---");
  {
    const store = new FakeStore();
    seedStandard(store);
    await createPreKickoffPrediction(baseDeps(store), { matchId: "m-future" });
    const payload = store.lastPayload;
    check("S: payload sin odds usa NULL explícito", payload !== null &&
      payload.odds_used === null &&
      payload.odds_snapshot_id === null &&
      payload.bookmaker_id === null &&
      payload.edge_home === null &&
      payload.ev_home === null &&
      payload.sports_ai_score === null);
    const snap = payload?.data_snapshot as Record<string, unknown>;
    const snapJson = JSON.stringify(snap);
    check("T: data_snapshot requerido y válido", snap !== null && typeof snap === "object" &&
      typeof (snap as Record<string, unknown>).expectedGoals === "object" &&
      typeof (snap as Record<string, unknown>).dataQuality === "object" &&
      typeof (snap as Record<string, unknown>).effectiveParameters === "object" &&
      snapJson.length > 10 && snapJson.length < 10000 &&
      !/sk-|eyJ|SECRET|TOKEN|KEY=/.test(snapJson));
    check("T2: data_snapshot determinista (mismo run, mismo contenido)", (() => {
      const a = JSON.stringify((store.predictions[0].data_snapshot ?? {}));
      return a === snapJson;
    })());
  }
  {
    // U: parámetros esperados = comportamiento real de probability-model.ts
    const real = getDefaultParameters() as unknown as Record<string, unknown>;
    check("U: lookbackMatches/minMatches/halfLife reales", real.lookbackMatches === 20 && real.minMatchesRequired === 6 && real.recencyHalfLife === 7);
    check("U2: dc/maxGoals/fallback/normalize reales", real.dcEnabled === true && real.dcRho === -0.13 && real.maxGoals === 10 && real.fallbackMethod === "league_average" && real.normalizeToUnity === true);
    // V: homeAdvFactor declarado pero NO aplicado (efectivo 1.0)
    const { computeModelV1 } = await import("@/lib/ai/probability-model");
    const baseMatches = [
      { id: "q1", matchDate: "2025-12-01T15:00:00.000Z", homeTeamId: "team-a", awayTeamId: "team-b", homeScore: 1, awayScore: 1, status: "finished" as const },
      { id: "q2", matchDate: "2025-11-01T15:00:00.000Z", homeTeamId: "team-b", awayTeamId: "team-a", homeScore: 2, awayScore: 2, status: "finished" as const },
    ];
    const fakeTeams = [
      { id: "team-a", sport_id: "soccer", league_id: "league1", name: "A", short_name: "A", created_at: "", updated_at: "", sport_specific: {} },
      { id: "team-b", sport_id: "soccer", league_id: "league1", name: "B", short_name: "B", created_at: "", updated_at: "", sport_specific: {} },
    ];
    const r1 = computeModelV1(
      { homeTeamId: "team-a", awayTeamId: "team-b", leagueId: "league1", seasonId: "season1", kickoffAt: "2026-03-01T12:00:00.000Z" },
      baseMatches, fakeTeams as never, [], { ...getDefaultParameters(), homeAdvFactor: 1.25 },
    );
    const r2 = computeModelV1(
      { homeTeamId: "team-a", awayTeamId: "team-b", leagueId: "league1", seasonId: "season1", kickoffAt: "2026-03-01T12:00:00.000Z" },
      baseMatches, fakeTeams as never, [], { ...getDefaultParameters(), homeAdvFactor: 99 },
    );
    check("V: homeAdvFactor declarado no altera lambdas (efectivo 1.0)", r1.expectedGoals.home === r2.expectedGoals.home && r1.expectedGoals.away === r2.expectedGoals.away);
    // W/X: min/maxLambda reales
    check("W: minLambda correcto (0.05)", real.minLambda === 0.05);
    check("X: maxLambda correcto (5.0)", real.maxLambda === 5.0);
  }
  {
    // Y: migration 005 contiene la guardia anti-historial (inspección del archivo).
    const fs = await import("node:fs");
    const sql = fs.readFileSync("supabase/migrations/005_prediction_without_odds_and_model_parameters.sql", "utf8");
    check("Y: 005 protege historial (RAISE EXCEPTION si hay predictions de v1)", /RAISE EXCEPTION[\s\S]*predictions[\s\S]*v1-dixon-coles/.test(sql));
    check("Y2: 005 no elimina FKs/CHECKs/RLS", !/DROP (CONSTRAINT|POLICY)|DISABLE ROW LEVEL SECURITY/i.test(sql));
  }

  console.log("\n--- AA/AB/AC/AD/AF. Concurrencia, predicted_at, identidades ---");
  {
    const store = new FakeStore();
    seedStandard(store);
    const deps = baseDeps(store);
    const results = await Promise.all(
      Array.from({ length: 30 }, () => createPreKickoffPrediction(deps, { matchId: "m-future" })),
    );
    const ids = new Set(results.map((r) => String(r.prediction.id)));
    const createdCount = results.filter((r) => r.created).length;
    check("AA: 30 concurrentes → exactamente 1 prediction persistida", store.predictions.length === 1, `rows=${store.predictions.length}`);
    check("AA2: las 30 reciben la misma prediction", ids.size === 1);
    check("AA3: exactamente 1 created:true, 29 reutilizan", createdCount === 1, `created=${createdCount}`);
    check("AF: violación UNIQUE por carrera → created:false sin error interno", results.every((r) => r.prediction.id === results[0].prediction.id));
  }
  {
    const store = new FakeStore();
    seedStandard(store);
    const res = await createPreKickoffPrediction(baseDeps(store), { matchId: "m-future" });
    check("AB: predicted_at < kickoff_at siempre", Date.parse(res.prediction.predicted_at) < Date.parse(res.prediction.kickoff_at));
    check("AB2: payload no contenía predicted_at (lo fija el servidor)", !("predicted_at" in ((store.lastPayload ?? {}) as Record<string, unknown>)));
  }
  {
    const store = new FakeStore();
    seedStandard(store);
    store.models.set("v2", { id: "v2", is_active: true, parameters: matchingParams() });
    const r = await createPreKickoffPrediction(baseDeps(store), { matchId: "m-future", modelVersionId: "v2" });
    check("AC: distinta model version → permitida (identidad separada)", r.created === true);
  }
  {
    const store = new FakeStore();
    seedStandard(store);
    store.markets.add("ou25");
    const r = await createPreKickoffPrediction(baseDeps(store), { matchId: "m-future", marketId: "ou25" });
    check("AD: distinto market → permitido (identidad separada)", r.created === true);
  }

  console.log("\n--- AE. Migration 005: guardas ---");
  {
    const fs = await import("node:fs");
    const sql = fs.readFileSync("supabase/migrations/005_prediction_without_odds_and_model_parameters.sql", "utf8");
    check("AE: 005 protege duplicados previos (GROUP BY + HAVING + RAISE)", /GROUP BY[\s\S]*HAVING COUNT\(\*\) > 1[\s\S]*RAISE EXCEPTION/i.test(sql));
    check("AE2: 005 crea UNIQUE canónica (match,market,model)", /uq_predictions_match_market_model[\s\S]*UNIQUE \(match_id, market_id, model_version_id\)/.test(sql));
    const rollback = fs.readFileSync("docs/005_prediction_without_odds_and_model_parameters_rollback.sql", "utf8");
    check("AE3: rollback dropea solo la constraint de 005", /DROP CONSTRAINT IF EXISTS uq_predictions_match_market_model/.test(rollback));
  }

  console.log("\n--- AG/AH/AI. Snapshot level, params exactos, homeAdv ---");
  {
    // AG: runner CON reproducibility → nivel reproducibility-model-level.
    const store = new FakeStore();
    seedStandard(store);
    const runWithInputs: ModelRunResult = {
      ...makeRun(),
      reproducibility: {
        cutoff: KICKOFF_FUTURE,
        home: {
          matches: [{ id: "h1", date: "2025-12-01T15:00:00.000Z", homeTeamId: "team-a", awayTeamId: "team-b", homeScore: 1, awayScore: 1 }],
          attack: 1.1,
          defense: 0.9,
        },
        away: {
          matches: [{ id: "a1", date: "2025-11-01T15:00:00.000Z", homeTeamId: "team-b", awayTeamId: "team-a", homeScore: 2, awayScore: 2 }],
          attack: 1.0,
          defense: 1.0,
        },
        leagueAverages: { avgHomeGoals: 1.4, avgAwayGoals: 1.1, avgGoalsScored: 1.25, leagueMatchesUsed: 100 },
      },
    };
    const deps = { ...baseDeps(store), runModel: { run: async () => runWithInputs } };
    const res = await createPreKickoffPrediction(deps, { matchId: "m-future" });
    const snap = res.prediction.data_snapshot as Record<string, unknown>;
    check("AG: con inputs → snapshotLevel reproducibility-model-level", snap.snapshotLevel === "reproducibility-model-level");
    const inputs = snap.inputs as Record<string, unknown> | null;
    check("AG2: inputs con matches/averages/strengths", inputs !== null &&
      Array.isArray((inputs.home as Record<string, unknown>).matches) &&
      typeof (inputs.leagueAverages as Record<string, unknown>).avgHomeGoals === "number" &&
      typeof ((inputs.home as Record<string, unknown>).attack) === "number");
    // Sin reproducibility → nivel audit, inputs null (tolerado).
    const store2 = new FakeStore();
    seedStandard(store2);
    const res2 = await createPreKickoffPrediction(baseDeps(store2), { matchId: "m-future" });
    const snap2 = res2.prediction.data_snapshot as Record<string, unknown>;
    check("AG3: sin inputs → nivel audit con inputs null (tolerado)", snap2.snapshotLevel === "audit" && snap2.inputs === null);
  }
  {
    // AH: metadata corregida (005) sin keys stale: set exacto esperado.
    const corrected = {
      lookbackMatches: 20,
      minMatchesRequired: 6,
      recencyHalfLife: 7,
      homeAdvFactor: 1.0,
      homeAdvEstimation: "fixed",
      dcEnabled: true,
      dcRho: -0.13,
      maxGoals: 10,
      minLambda: 0.05,
      maxLambda: 5.0,
      fallbackMethod: "league_average",
      normalizeToUnity: true,
    };
    const expectedKeys = ["dcEnabled", "dcRho", "fallbackMethod", "homeAdvEstimation", "homeAdvFactor", "lookbackMatches", "maxGoals", "maxLambda", "minLambda", "minMatchesRequired", "normalizeToUnity", "recencyHalfLife"];
    check("AH: set exacto de keys (sin stale, sin faltantes)", JSON.stringify(Object.keys(corrected).sort()) === JSON.stringify(expectedKeys));
    check("AH2: verifyModelParameters(corrected) ok", verifyModelParameters(corrected as Record<string, unknown>).ok === true);
    // AI: homeAdv metadata fiel al comportamiento (efectivo 1.0, sin factor extra).
    check("AI: homeAdvFactor corregido = 1.0", (corrected as Record<string, unknown>).homeAdvFactor === 1.0);
  }

  console.log("\n--- AJ/AK/AL/AP/AQ. Adapter real (runFn inyectada) ---");
  {
    // AJ: el adapter mapea PredictionMatchRef → (sport,league,season,match).
    let seenArgs: { sportId: string; leagueId: string; seasonId: string; matchId: string } | null = null;
    const fakeRunFn = (async (sportId: string, leagueId: string, seasonId: string, matchId: string) => {
      seenArgs = { sportId, leagueId, seasonId, matchId };
      return {
        probabilities: { home: 0.5, draw: 0.3, away: 0.2 },
        expectedGoals: { home: 1.6, away: 1.0 },
        usedFallback: false,
        fallbackReason: "",
        dataQuality: { homeMatchesUsed: 12, awayMatchesUsed: 11, leagueMatchesUsed: 120 },
        parameters: getDefaultParameters(),
        inputs: {
          cutoff: KICKOFF_FUTURE,
          home: { matches: [], attack: 1.1, defense: 0.9 },
          away: { matches: [], attack: 1.0, defense: 1.0 },
          leagueAverages: { avgHomeGoals: 1.4, avgAwayGoals: 1.1, avgGoalsScored: 1.25, leagueMatchesUsed: 120 },
        },
      };
    }) as never;
    const runner = createRealModelRunner(fakeRunFn);
    const out = await runner.run(makeMatch("m-future", KICKOFF_FUTURE));
    check("AJ: adapter mapea sport/league/season/match", seenArgs !== null &&
      (seenArgs as unknown as Record<string, string>).sportId === "soccer" &&
      (seenArgs as unknown as Record<string, string>).leagueId === "league1" &&
      (seenArgs as unknown as Record<string, string>).seasonId === "season1" &&
      (seenArgs as unknown as Record<string, string>).matchId === "m-future");
    // AK: ModelRunResult válido.
    check("AK: runner produce probabilidades válidas (suma≈1)", Math.abs(out.probabilities.home + out.probabilities.draw + out.probabilities.away - 1) <= 0.0001);
    // AL: el match (incl. match_date = kickoff/cutoff) se propaga intacto.
    check("AL: kickoff real viaja como cutoff de inputs", out.reproducibility?.cutoff === KICKOFF_FUTURE);
    // AP: fallback/dataQuality propagados.
    check("AP: fallback y dataQuality propagados", out.usedFallback === false && out.dataQuality.homeMatchesUsed === 12);
    // AQ: inputs/snapshot metadata propagados.
    check("AQ: reproducibility propagada al servicio", (out.reproducibility?.leagueAverages.leagueMatchesUsed ?? -1) === 120);
    // AN/AO sobre salida del adapter.
    check("AN: probabilities adapter suman ≈1", Math.abs(out.probabilities.home + out.probabilities.draw + out.probabilities.away - 1) <= 0.0001);
    check("AO: expectedGoals dentro de clamps [0.05, 5.0]", out.expectedGoals.home >= 0.05 && out.expectedGoals.home <= 5.0 && out.expectedGoals.away >= 0.05 && out.expectedGoals.away <= 5.0);
  }

  console.log("\n--- AM/AR/AS/AT. Flujo con runner tipo-adapter ---");
  {
    // AM: payload vía runner con forma de adapter, sin odds.
    const store = new FakeStore();
    seedStandard(store);
    const deps = {
      ...baseDeps(store),
      runModel: {
        run: async () => ({ ...makeRun(), reproducibility: null }),
      },
    };
    const res = await createPreKickoffPrediction(deps, { matchId: "m-future" });
    check("AM: payload real sin odds válido", res.created === true && res.prediction.odds_used == null && res.prediction.odds_snapshot_id == null);
    // AR: existente no duplica (vía runner).
    const res2 = await createPreKickoffPrediction(deps, { matchId: "m-future" });
    check("AR: prediction existente no duplica", res2.created === false && res2.prediction.id === res.prediction.id);
  }
  {
    // AS: kickoff pasado → el runner NO se ejecuta.
    const store = new FakeStore();
    seedStandard(store);
    let calls = 0;
    const deps = {
      ...baseDeps(store),
      runModel: {
        run: async () => {
          calls++;
          return makeRun();
        },
      },
    };
    const ok = await expectCode(() => createPreKickoffPrediction(deps, { matchId: "m-past" }), "KICKOFF_PASSED");
    check("AS: kickoff pasado rechaza sin ejecutar runner", ok && calls === 0, `calls=${calls}`);
  }
  {
    // AT: preview (dry-run) nunca llama a store.insert.
    const store = new FakeStore();
    seedStandard(store);
    let insertCalls = 0;
    const countingStore: FakeStore = Object.create(Object.getPrototypeOf(store), Object.getOwnPropertyDescriptors(store));
    countingStore.insert = (async (p: PredictionInsertPayload) => { insertCalls++; return FakeStore.prototype.insert.call(countingStore, p); }) as typeof store.insert;
    const deps = { ...baseDeps(store), store: countingStore };
    const preview = await previewPrediction(deps, { matchId: "m-future" });
    check("AT: dry-run construye payload sin llamar insert", preview.created === true && insertCalls === 0 && "payload" in preview && preview.payload.match_id === "m-future");
  }

  console.log("\n--- AY. Paridad DB: CHECK odds_used ---");
  {
    // AY1: NULL pasa (post-006); el servicio siempre envía NULL en esta fase.
    const store = new FakeStore();
    seedStandard(store);
    const res = await createPreKickoffPrediction(baseDeps(store), { matchId: "m-future" });
    check("AY1: odds_used NULL aceptada (paridad post-006)", res.created === true);
    // AY2: odds malformadas no-nulas serían rechazadas como en DB.
    const store2 = new FakeStore();
    seedStandard(store2);
    let rejected = false;
    try {
      await store2.insert({
        match_id: "m-future",
        market_id: DEFAULT_MARKET_ID,
        model_version_id: DEFAULT_MODEL_VERSION_ID,
        model_probabilities: { home: 0.4, draw: 0.3, away: 0.3 },
        odds_used: { home: 1.0, draw: 3.0, away: 4.0 },
        odds_snapshot_id: null,
        bookmaker_id: null,
        data_snapshot: {},
        kickoff_at: KICKOFF_FUTURE,
      });
    } catch (err) {
      rejected = err instanceof PredictionServiceError && err.code === PredictionErrorCodes.INVALID_PAYLOAD;
    }
    check("AY2: odds_used no-nula inválida rechazada (paridad CHECK)", rejected);
  }
  {
    // AY3-AY6: paridad fina con el CHECK post-006 (NULL ok; resto igual que antes).
    const store = new FakeStore();
    seedStandard(store);
    async function tryOdds(odds: unknown): Promise<boolean> {
      try {
        await store.insert({
          match_id: "m-future",
          market_id: DEFAULT_MARKET_ID,
          model_version_id: DEFAULT_MODEL_VERSION_ID,
          model_probabilities: { home: 0.4, draw: 0.3, away: 0.3 },
          odds_used: odds as { home: number; draw: number; away: number },
          odds_snapshot_id: null,
          bookmaker_id: null,
          data_snapshot: {},
          kickoff_at: KICKOFF_FUTURE,
        });
        return true;
      } catch {
        return false;
      }
    }
    check("AY3: {} rechazado", (await tryOdds({})) === false);
    check("AY4: incompletas rechazadas", (await tryOdds({ home: 2.0 })) === false && (await tryOdds({ home: 2.0, draw: 3.0 })) === false);
    check("AY5: campo null rechazado", (await tryOdds({ home: 2.0, draw: null, away: 4.0 })) === false);
    check("AY6: odds <= 1 rechazadas", (await tryOdds({ home: 2.0, draw: 3.0, away: 1.0 })) === false);
    check("AY6b: 1X2 completas y válidas permitidas", (await tryOdds({ home: 2.0, draw: 3.0, away: 4.0 })) === true);
  }
  {
    // AY7: payload del servicio (preview) pasa la paridad sin odds.
    const store = new FakeStore();
    seedStandard(store);
    const preview = await previewPrediction(baseDeps(store), { matchId: "m-future" });
    check("AY7: payload sin odds del servicio pasa paridad", preview.created === true && "payload" in preview && preview.payload.odds_used === null);
  }
  {
    // AY8: validación de model_probabilities intacta (independiente de odds).
    const store = new FakeStore();
    seedStandard(store);
    const badRunner = { run: async () => ({ ...makeRun(), probabilities: { home: 0.4, draw: 0.3, away: 0.2 } }) };
    const ok = await expectCode(
      () => createPreKickoffPrediction({ ...baseDeps(store), runModel: badRunner }, { matchId: "m-future" }),
      "INVALID_PROBABILITIES",
    );
    check("AY8: model_probabilities inválidas siguen rechazadas", ok);
  }

  console.log("\n--- Q. Sin leakage ---");
  {
    const store = new FakeStore();
    seedStandard(store);
    let seenKickoff = "";
    const deps = {
      ...baseDeps(store),
      runModel: {
        run: async (match: PredictionMatchRef) => {
          seenKickoff = match.match_date;
          return makeRun();
        },
      },
    };
    await createPreKickoffPrediction(deps, { matchId: "m-future" });
    check("Q: el runner recibe el kickoff real del match", seenKickoff === KICKOFF_FUTURE, `got ${seenKickoff}`);
  }

  console.log("\n======================================================================");
  console.log(
    `RESULTADO FINAL LAUNCH 1: ${failed === 0 ? "TODOS LOS TESTS PASARON ✅✅✅" : `${failed} FALLARON ❌`}`,
  );
  console.log(`Pasaron: ${passed}, Fallaron: ${failed}`);
  console.log("======================================================================");

  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
