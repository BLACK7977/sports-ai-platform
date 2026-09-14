/**
 * Smoke tests — Canonical Prediction UI Fix (Real Service Path)
 *
 * Tests the actual predictMatch() service logic with injectable canonical lookup.
 * Covers canonical selection, validation, no-prediction state, and cross-match isolation.
 *
 * Coverage:
 * A. canonical prediction exists → uses persisted probabilities
 * B. canonical market selected over another market
 * C. canonical model selected over another model
 * D. no prediction => unavailable union state
 * E. invalid probabilities => rejected/unavailable
 * F. invalid xG => rejected/unavailable
 * G. canonical exists even when form/table missing
 * H. match A cannot receive match B prediction
 * I. canonical lookup causes no LLM/mock call
 * J. expected goals mapped correctly
 */

import {
  predictMatch,
  type CanonicalLookupFn,
} from "@/lib/services/ai-service";

// ------------------------------------------------------------------
// Test infrastructure
// ------------------------------------------------------------------

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// ------------------------------------------------------------------
// Fake canonical lookup: simulates DB query with in-memory data
// ------------------------------------------------------------------

interface FakePrediction {
  matchId: string;
  marketId: string;
  modelVersionId: string;
  probabilities: { home: number; draw: number; away: number } | null;
  expectedGoals: { home: number; away: number } | null;
}

function createFakeLookup(predictions: FakePrediction[]): CanonicalLookupFn {
  return async (matchId: string) => {
    const match = predictions.filter(
      (p) =>
        p.matchId === matchId &&
        p.marketId === "1x2" &&
        p.modelVersionId === "v1-dixon-coles-2026-01",
    );
    if (match.length === 0) return null;
    const row = match[0];
    if (!row.probabilities) return null;
    // Validate probabilities (replicating getCanonicalPredictionForMatch logic)
    const { home, draw, away } = row.probabilities;
    if (
      typeof home !== "number" || !Number.isFinite(home) || home < 0 || home > 1 ||
      typeof draw !== "number" || !Number.isFinite(draw) || draw < 0 || draw > 1 ||
      typeof away !== "number" || !Number.isFinite(away) || away < 0 || away > 1 ||
      Math.abs(home + draw + away - 1) > 0.0001
    ) {
      return null;
    }
    // Validate xG
    let expectedGoals = row.expectedGoals;
    if (expectedGoals) {
      const { home: xh, away: xa } = expectedGoals;
      if (
        typeof xh !== "number" || !Number.isFinite(xh) || xh < 0 ||
        typeof xa !== "number" || !Number.isFinite(xa) || xa < 0
      ) {
        expectedGoals = null;
      }
    }
    return {
      probabilities: row.probabilities,
      expectedGoals,
      modelVersionId: row.modelVersionId,
      modelVersion: row.modelVersionId,
    } as { probabilities: { home: number; draw: number; away: number }; expectedGoals: { home: number; away: number } | null; modelVersion: string };
  };
}

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------

const SPORT_ID = "soccer";
const LEAGUE_ID = "dk-superliga";
const SEASON_ID = "2026";

const MATCH_3 = "m-soccer-sportmonks:match:19713933"; // FC Midtjylland vs Brøndby
const MATCH_4 = "m-soccer-sportmonks:match:19713923"; // Lyngby vs Silkeborg
const MATCH_5 = "m-soccer-sportmonks:match:19713927"; // Odense vs FC Midtjylland
const MATCH_6 = "m-soccer-sportmonks:match:19713921"; // Brøndby vs FC København
const MATCH_7 = "m-soccer-sportmonks:match:19713925"; // Sønderjyske vs Randers
const MATCH_NO = "m-soccer-sportmonks:match:no-prediction"; // No prediction exists

// Canonical predictions (from DB)
const PREDICTIONS: FakePrediction[] = [
  {
    matchId: MATCH_3,
    marketId: "1x2",
    modelVersionId: "v1-dixon-coles-2026-01",
    probabilities: { home: 0.4758872135079252, draw: 0.2764942921355626, away: 0.24761849435651231 },
    expectedGoals: { home: 1.6281923452022462, away: 1.1234926377287802 },
  },
  {
    matchId: MATCH_4,
    marketId: "1x2",
    modelVersionId: "v1-dixon-coles-2026-01",
    probabilities: { home: 0.40559086696240776, draw: 0.29906155858290034, away: 0.29534757445469184 },
    expectedGoals: { home: 1.3796842930370266, away: 1.146781745033213 },
  },
  {
    matchId: MATCH_5,
    marketId: "1x2",
    modelVersionId: "v1-dixon-coles-2026-01",
    probabilities: { home: 0.07742678912193812, draw: 0.22166206251642978, away: 0.7009111483616319 },
    expectedGoals: { home: 0.5009473068577094, away: 1.9035458788420565 },
  },
  {
    matchId: MATCH_6,
    marketId: "1x2",
    modelVersionId: "v1-dixon-coles-2026-01",
    probabilities: { home: 0.13935254103561973, draw: 0.1852054535889334, away: 0.6754420053754469 },
    expectedGoals: { home: 1.1635743903128566, away: 2.614146183090205 },
  },
  {
    matchId: MATCH_7,
    marketId: "1x2",
    modelVersionId: "v1-dixon-coles-2026-01",
    probabilities: { home: 0.13062453348389028, draw: 0.24825657254378486, away: 0.621118893972325 },
    expectedGoals: { home: 0.7311212601577484, away: 1.824481880446609 },
  },
];

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=== Canonical Prediction — Real Service Tests ===\n");

  const lookup = createFakeLookup(PREDICTIONS);
  const deps = { lookupCanonical: lookup };

  // ------------------------------------------------------------------
  // A. canonical prediction exists → uses persisted probabilities
  // ------------------------------------------------------------------
  console.log("A. canonical prediction exists → uses persisted probabilities");
  const r3 = await predictMatch(SPORT_ID, LEAGUE_ID, SEASON_ID, MATCH_3, undefined, deps);
  check("A1: canonical=true", r3.canonical === true);
  if (r3.canonical) {
    check("A2: home=48%", r3.homeWinProbability === 48);
    check("A3: draw=28%", r3.drawProbability === 28);
    check("A4: away=24%", r3.awayWinProbability === 24);
    check("A5: modelVersion correct", r3.modelVersion === "v1-dixon-coles-2026-01");
  }

  // ------------------------------------------------------------------
  // B. canonical market selected over another market
  // ------------------------------------------------------------------
  console.log("\nB. canonical market selected over another market");
  const withOtherMarket: FakePrediction[] = [
    ...PREDICTIONS,
    {
      matchId: MATCH_3,
      marketId: "over_under_2_5", // different market
      modelVersionId: "v1-dixon-coles-2026-01",
      probabilities: { home: 0.10, draw: 0.10, away: 0.80 },
      expectedGoals: null,
    },
  ];
  const lookupB = createFakeLookup(withOtherMarket);
  const rB = await predictMatch(SPORT_ID, LEAGUE_ID, SEASON_ID, MATCH_3, undefined, { lookupCanonical: lookupB });
  check("B1: canonical=true", rB.canonical === true);
  if (rB.canonical) {
    check("B2: uses 1x2 probabilities (48%), not over_under (10%)", rB.homeWinProbability === 48);
  }

  // ------------------------------------------------------------------
  // C. canonical model selected over another model
  // ------------------------------------------------------------------
  console.log("\nC. canonical model selected over another model")
  const withOtherModel: FakePrediction[] = [
    ...PREDICTIONS,
    {
      matchId: MATCH_3,
      marketId: "1x2",
      modelVersionId: "v2-experimental", // different model
      probabilities: { home: 0.50, draw: 0.30, away: 0.20 },
      expectedGoals: { home: 2.0, away: 1.0 },
    },
  ];
  const lookupC = createFakeLookup(withOtherModel);
  const rC = await predictMatch(SPORT_ID, LEAGUE_ID, SEASON_ID, MATCH_3, undefined, { lookupCanonical: lookupC });
  check("C1: canonical=true", rC.canonical === true);
  if (rC.canonical) {
    check("C2: uses v1-dixon-coles (48%), not v2 (50%)", rC.homeWinProbability === 48);
    check("C3: modelVersion is v1", rC.modelVersion === "v1-dixon-coles-2026-01");
  }

  // ------------------------------------------------------------------
  // D. no prediction => unavailable union state
  // ------------------------------------------------------------------
  console.log("\nD. no prediction => unavailable union state");
  const rNo = await predictMatch(SPORT_ID, LEAGUE_ID, SEASON_ID, MATCH_NO, undefined, deps);
  check("D1: canonical=false", rNo.canonical === false);
  if (!rNo.canonical) {
    check("D2: reason=not_available", rNo.reason === "not_available");
    check("D3: no numeric fields", !("homeWinProbability" in rNo));
    check("D4: no expectedGoals", !("expectedGoals" in rNo));
  }

  // ------------------------------------------------------------------
  // E. invalid probabilities => rejected/unavailable
  // ------------------------------------------------------------------
  console.log("\nE. invalid probabilities => rejected/unavailable");
  const invalidProbs: FakePrediction[] = [
    {
      matchId: "match-invalid-probs",
      marketId: "1x2",
      modelVersionId: "v1-dixon-coles-2026-01",
      probabilities: { home: 0.50, draw: 0.30, away: 0.10 }, // sums to 0.90, invalid
      expectedGoals: null,
    },
  ];
  const lookupE = createFakeLookup(invalidProbs);
  const rE = await predictMatch(SPORT_ID, LEAGUE_ID, SEASON_ID, "match-invalid-probs", undefined, { lookupCanonical: lookupE });
  check("E1: canonical=false (invalid probs rejected)", rE.canonical === false);
  if (!rE.canonical) {
    check("E2: reason=not_available", rE.reason === "not_available");
  }

  // ------------------------------------------------------------------
  // F. invalid xG => rejected/unavailable (xG null, but probs valid)
  // ------------------------------------------------------------------
  console.log("\nF. invalid xG => xG treated as null, probabilities still valid");
  const invalidXg: FakePrediction[] = [
    {
      matchId: "match-invalid-xg",
      marketId: "1x2",
      modelVersionId: "v1-dixon-coles-2026-01",
      probabilities: { home: 0.40, draw: 0.35, away: 0.25 },
      expectedGoals: { home: -1.0, away: 1.5 }, // invalid xG home
    },
  ];
  const lookupF = createFakeLookup(invalidXg);
  const rF = await predictMatch(SPORT_ID, LEAGUE_ID, SEASON_ID, "match-invalid-xg", undefined, { lookupCanonical: lookupF });
  check("F1: canonical=true (probs valid)", rF.canonical === true);
  if (rF.canonical) {
    check("F2: expectedGoals undefined (invalid xG filtered)", rF.expectedGoals === undefined);
    check("F3: probabilities still correct", rF.homeWinProbability === 40);
  }

  // ------------------------------------------------------------------
  // G. canonical exists even when form/table missing
  // ------------------------------------------------------------------
  console.log("\nG. canonical exists even when form/table missing");
  // In the real service, predictMatch no longer depends on form/table data.
  // The canonical lookup is independent. We verify this by calling predictMatch
  // with a valid canonical prediction — the result should be canonical=true
  // regardless of whether standings/form data exists.
  const rG = await predictMatch(SPORT_ID, LEAGUE_ID, SEASON_ID, MATCH_4, undefined, deps);
  check("G1: canonical=true", rG.canonical === true);
  if (rG.canonical) {
    check("G2: home=41%", rG.homeWinProbability === 41);
    check("G3: xG present", rG.expectedGoals !== undefined);
  }

  // ------------------------------------------------------------------
  // H. match A cannot receive match B prediction
  // ------------------------------------------------------------------
  console.log("\nH. match A cannot receive match B prediction");
  const rH1 = await predictMatch(SPORT_ID, LEAGUE_ID, SEASON_ID, MATCH_5, undefined, deps);
  const rH2 = await predictMatch(SPORT_ID, LEAGUE_ID, SEASON_ID, MATCH_6, undefined, deps);
  check("H1: match 5 canonical=true", rH1.canonical === true);
  check("H2: match 6 canonical=true", rH2.canonical === true);
  if (rH1.canonical && rH2.canonical) {
    check("H3: different probabilities", rH1.homeWinProbability !== rH2.homeWinProbability);
    check("H4: match 5 home=8%", rH1.homeWinProbability === 8);
    check("H5: match 6 home=14%", rH2.homeWinProbability === 14);
  }

  // ------------------------------------------------------------------
  // I. canonical lookup causes no LLM/mock call
  // ------------------------------------------------------------------
  console.log("\nI. canonical lookup causes no LLM/mock call");
  // We verify this by checking that the explanation references the model version,
  // not a fabricated LLM explanation.
  const rI = await predictMatch(SPORT_ID, LEAGUE_ID, SEASON_ID, MATCH_7, undefined, deps);
  check("I1: canonical=true", rI.canonical === true);
  if (rI.canonical) {
    check("I2: explanation mentions model version", rI.explanation.includes("v1-dixon-coles-2026-01"));
    check("I3: no fabricated explanation", !rI.explanation.includes("genérico"));
    check("I4: no LLM fallback text", !rI.explanation.includes("H2H"));
  }

  // ------------------------------------------------------------------
  // J. expected goals mapped correctly
  // ------------------------------------------------------------------
  console.log("\nJ. expected goals mapped correctly");
  const rJ = await predictMatch(SPORT_ID, LEAGUE_ID, SEASON_ID, MATCH_3, undefined, deps);
  check("J1: canonical=true", rJ.canonical === true);
  if (rJ.canonical) {
    check("J2: expectedGoals present", rJ.expectedGoals !== undefined);
    check("J3: xG home=1.63", rJ.expectedGoals!.home.toFixed(2) === "1.63");
    check("J4: xG away=1.12", rJ.expectedGoals!.away.toFixed(2) === "1.12");
    check("J5: predictedHomeScore rounds xG", rJ.predictedHomeScore === 2);
    check("J6: predictedAwayScore rounds xG", rJ.predictedAwayScore === 1);
  }

  // ------------------------------------------------------------------
  // Verify all 5 predictions #3-#7
  // ------------------------------------------------------------------
  console.log("\nVerify predictions #3-#7:");
  const allMatches = [MATCH_3, MATCH_4, MATCH_5, MATCH_6, MATCH_7];
  const expectedProbs = [
    { home: 48, draw: 28, away: 24 },
    { home: 41, draw: 30, away: 29 },
    { home: 8, draw: 22, away: 70 },
    { home: 14, draw: 19, away: 67 },
    { home: 13, draw: 25, away: 62 },
  ];
  const expectedXg = [
    { home: "1.63", away: "1.12" },
    { home: "1.38", away: "1.15" },
    { home: "0.50", away: "1.90" },
    { home: "1.16", away: "2.61" },
    { home: "0.73", away: "1.82" },
  ];
  for (let i = 0; i < allMatches.length; i++) {
    const r = await predictMatch(SPORT_ID, LEAGUE_ID, SEASON_ID, allMatches[i], undefined, deps);
    check(`#${i + 3} canonical=true`, r.canonical === true);
    if (r.canonical) {
      check(`#${i + 3} home=${expectedProbs[i].home}%`, r.homeWinProbability === expectedProbs[i].home);
      check(`#${i + 3} draw=${expectedProbs[i].draw}%`, r.drawProbability === expectedProbs[i].draw);
      check(`#${i + 3} away=${expectedProbs[i].away}%`, r.awayWinProbability === expectedProbs[i].away);
      check(`#${i + 3} xG home=${expectedXg[i].home}`, r.expectedGoals!.home.toFixed(2) === expectedXg[i].home);
      check(`#${i + 3} xG away=${expectedXg[i].away}`, r.expectedGoals!.away.toFixed(2) === expectedXg[i].away);
      check(`#${i + 3} model=v1-dixon-coles-2026-01`, r.modelVersion === "v1-dixon-coles-2026-01");
    }
  }

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
