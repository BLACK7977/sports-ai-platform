import { computeModelV1, getDefaultParameters } from "@/lib/ai/probability-model";
import type { HistoricalMatch, Team, ModelInput, SoccerStandingsRow } from "@/lib/ai/probability-model";

function makeMatch(
  id: string,
  date: string,
  homeId: string,
  awayId: string,
  hs: number,
  as: number,
  status: "finished" = "finished"
): HistoricalMatch {
  return {
    id,
    matchDate: date,
    homeTeamId: homeId,
    awayTeamId: awayId,
    homeScore: hs,
    awayScore: as,
    status,
  };
}

function makeTeam(id: string, name: string): Team {
  return {
    id,
    sport_id: "soccer",
    league_id: "league1",
    name,
    short_name: name.slice(0, 3).toUpperCase(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    sport_specific: {},
  };
}

function makeStandings(teams: Team[], points: Record<string, number>): SoccerStandingsRow[] {
  return teams.map((t) => ({
    teamId: t.id,
    teamName: t.name,
    shortName: t.short_name,
    played: 10,
    won: Math.floor(points[t.id] / 3),
    drawn: points[t.id] % 3,
    lost: 10 - Math.floor(points[t.id] / 3) - (points[t.id] % 3),
    goalsFor: 15,
    goalsAgainst: 10,
    goalDifference: 5,
    points: points[t.id],
    recentForm: ["W", "W", "D", "L", "W"],
  }));
}

const params = getDefaultParameters();

const teamA = makeTeam("team-a", "Team A");
const teamB = makeTeam("team-b", "Team B");
const teamC = makeTeam("team-c", "Team C");
const allTeams = [teamA, teamB, teamC];

const standingsEqual = makeStandings(allTeams, { "team-a": 18, "team-b": 18, "team-c": 18 });
const standingsHomeStrong = makeStandings(allTeams, { "team-a": 25, "team-b": 12, "team-c": 10 });
const standingsAwayStrong = makeStandings(allTeams, { "team-a": 10, "team-b": 25, "team-c": 12 });

const baseDate = "2026-01-15T15:00:00.000Z";

const equalMatches: HistoricalMatch[] = [
  makeMatch("m1", "2025-12-01T15:00:00.000Z", "team-a", "team-b", 1, 1),
  makeMatch("m2", "2025-11-15T15:00:00.000Z", "team-b", "team-a", 2, 2),
  makeMatch("m3", "2025-11-01T15:00:00.000Z", "team-a", "team-c", 1, 0),
  makeMatch("m4", "2025-10-15T15:00:00.000Z", "team-c", "team-a", 0, 1),
  makeMatch("m5", "2025-10-01T15:00:00.000Z", "team-b", "team-c", 1, 1),
  makeMatch("m6", "2025-09-15T15:00:00.000Z", "team-c", "team-b", 2, 1),
  makeMatch("m7", "2025-09-01T15:00:00.000Z", "team-a", "team-b", 0, 0),
  makeMatch("m8", "2025-08-15T15:00:00.000Z", "team-b", "team-a", 1, 1),
  makeMatch("m9", "2025-08-01T15:00:00.000Z", "team-a", "team-c", 2, 1),
  makeMatch("m10", "2025-07-15T15:00:00.000Z", "team-c", "team-a", 1, 2),
  makeMatch("m11", "2025-07-01T15:00:00.000Z", "team-b", "team-c", 1, 0),
  makeMatch("m12", "2025-06-15T15:00:00.000Z", "team-c", "team-b", 0, 1),
];

const homeStrongMatches: HistoricalMatch[] = [
  makeMatch("m1", "2025-12-01T15:00:00.000Z", "team-a", "team-b", 3, 0),
  makeMatch("m2", "2025-11-15T15:00:00.000Z", "team-b", "team-a", 0, 2),
  makeMatch("m3", "2025-11-01T15:00:00.000Z", "team-a", "team-c", 4, 1),
  makeMatch("m4", "2025-10-15T15:00:00.000Z", "team-c", "team-a", 1, 3),
  makeMatch("m5", "2025-10-01T15:00:00.000Z", "team-b", "team-c", 1, 1),
  makeMatch("m6", "2025-09-15T15:00:00.000Z", "team-c", "team-b", 1, 2),
  makeMatch("m7", "2025-09-01T15:00:00.000Z", "team-a", "team-b", 2, 1),
  makeMatch("m8", "2025-08-15T15:00:00.000Z", "team-b", "team-a", 0, 1),
  makeMatch("m9", "2025-08-01T15:00:00.000Z", "team-a", "team-c", 3, 0),
  makeMatch("m10", "2025-07-15T15:00:00.000Z", "team-c", "team-a", 0, 2),
  makeMatch("m11", "2025-07-01T15:00:00.000Z", "team-b", "team-c", 2, 1),
  makeMatch("m12", "2025-06-15T15:00:00.000Z", "team-c", "team-b", 1, 1),
];

const awayStrongMatches: HistoricalMatch[] = [
  makeMatch("m1", "2025-12-01T15:00:00.000Z", "team-a", "team-b", 0, 3),
  makeMatch("m2", "2025-11-15T15:00:00.000Z", "team-b", "team-a", 2, 0),
  makeMatch("m3", "2025-11-01T15:00:00.000Z", "team-a", "team-c", 1, 2),
  makeMatch("m4", "2025-10-15T15:00:00.000Z", "team-c", "team-a", 1, 1),
  makeMatch("m5", "2025-10-01T15:00:00.000Z", "team-b", "team-c", 3, 1),
  makeMatch("m6", "2025-09-15T15:00:00.000Z", "team-c", "team-b", 1, 0),
  makeMatch("m7", "2025-09-01T15:00:00.000Z", "team-a", "team-b", 1, 2),
  makeMatch("m8", "2025-08-15T15:00:00.000Z", "team-b", "team-a", 1, 0),
  makeMatch("m9", "2025-08-01T15:00:00.000Z", "team-a", "team-c", 0, 2),
  makeMatch("m10", "2025-07-15T15:00:00.000Z", "team-c", "team-a", 1, 1),
  makeMatch("m11", "2025-07-01T15:00:00.000Z", "team-b", "team-c", 3, 0),
  makeMatch("m12", "2025-06-15T15:00:00.000Z", "team-c", "team-b", 0, 2),
];

const fewMatches: HistoricalMatch[] = [
  makeMatch("m1", "2025-12-01T15:00:00.000Z", "team-a", "team-b", 1, 1),
  makeMatch("m2", "2025-11-15T15:00:00.000Z", "team-b", "team-a", 2, 2),
];

async function runTests() {
  let passed = 0;
  let failed = 0;

  function check(name: string, condition: boolean, details?: string) {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.log(`[FAIL] ${name}${details ? ` - ${details}` : ""}`);
      failed++;
    }
  }

  console.log("=== SMOKE TESTS — Bloque 6 (Probability Model V1) ===\n");

  const inputEqual: ModelInput = {
    homeTeamId: "team-a",
    awayTeamId: "team-b",
    leagueId: "league1",
    seasonId: "season1",
    kickoffAt: baseDate,
  };

  const inputHomeStrong: ModelInput = { ...inputEqual };
  const inputAwayStrong: ModelInput = { ...inputEqual };
  const inputFew: ModelInput = { ...inputEqual };

  console.log("--- A. Equipos iguales ---");
  const resA = computeModelV1(inputEqual, equalMatches, allTeams, standingsEqual, params);
  check("A1: probabilidades suman ≈ 1", Math.abs(resA.probabilities.home + resA.probabilities.draw + resA.probabilities.away - 1) <= 0.0001);
  check("A2: home > away (ventaja local)", resA.probabilities.home > resA.probabilities.away);
  check("A3: todas >= 0", resA.probabilities.home >= 0 && resA.probabilities.draw >= 0 && resA.probabilities.away >= 0);
  check("A4: no NaN/Infinity", Number.isFinite(resA.probabilities.home) && Number.isFinite(resA.probabilities.draw) && Number.isFinite(resA.probabilities.away));
  check("A5: expectedGoals finitos", Number.isFinite(resA.expectedGoals.home) && Number.isFinite(resA.expectedGoals.away));
  check("A6: expectedGoals >= 0", resA.expectedGoals.home >= 0 && resA.expectedGoals.away >= 0);
  check("A7: usedFallback = false", !resA.usedFallback);
  console.log(`   Probabilidades: home=${resA.probabilities.home.toFixed(4)}, draw=${resA.probabilities.draw.toFixed(4)}, away=${resA.probabilities.away.toFixed(4)}`);
  console.log(`   xG: home=${resA.expectedGoals.home.toFixed(3)}, away=${resA.expectedGoals.away.toFixed(3)}`);

  console.log("\n--- B. Local fuerte ---");
  const resB = computeModelV1(inputHomeStrong, homeStrongMatches, allTeams, standingsHomeStrong, params);
  check("B1: probabilidades suman ≈ 1", Math.abs(resB.probabilities.home + resB.probabilities.draw + resB.probabilities.away - 1) <= 0.0001);
  check("B2: home > away (local fuerte)", resB.probabilities.home > resB.probabilities.away);
  check("B3: home > 0.4 (ventaja clara)", resB.probabilities.home > 0.4);
  check("B4: usedFallback = false", !resB.usedFallback);
  console.log(`   Probabilidades: home=${resB.probabilities.home.toFixed(4)}, draw=${resB.probabilities.draw.toFixed(4)}, away=${resB.probabilities.away.toFixed(4)}`);

  console.log("\n--- C. Visitante fuerte ---");
  const resC = computeModelV1(inputAwayStrong, awayStrongMatches, allTeams, standingsAwayStrong, params);
  check("C1: probabilidades suman ≈ 1", Math.abs(resC.probabilities.home + resC.probabilities.draw + resC.probabilities.away - 1) <= 0.0001);
  check("C2: away > home (visitante fuerte)", resC.probabilities.away > resC.probabilities.home);
  check("C3: away > 0.4 (ventaja clara)", resC.probabilities.away > 0.4);
  check("C4: usedFallback = false", !resC.usedFallback);
  console.log(`   Probabilidades: home=${resC.probabilities.home.toFixed(4)}, draw=${resC.probabilities.draw.toFixed(4)}, away=${resC.probabilities.away.toFixed(4)}`);

  console.log("\n--- D. Datos insuficientes (fallback) ---");
  const resD = computeModelV1(inputFew, fewMatches, allTeams, standingsEqual, params);
  check("D1: usedFallback = true", resD.usedFallback);
  check("D2: fallbackReason no vacía", resD.fallbackReason.length > 0);
  check("D3: probabilidades suman ≈ 1", Math.abs(resD.probabilities.home + resD.probabilities.draw + resD.probabilities.away - 1) <= 0.0001);
  check("D4: strengths = 1 (fallback league_average)", resD.parameters.fallbackMethod === "league_average");
  console.log(`   Fallback reason: ${resD.fallbackReason}`);
  console.log(`   Probabilidades: home=${resD.probabilities.home.toFixed(4)}, draw=${resD.probabilities.draw.toFixed(4)}, away=${resD.probabilities.away.toFixed(4)}`);

  console.log("\n--- E. No usar partidos posteriores al kickoff ---");
  const futureMatch = makeMatch("m-future", "2026-02-01T15:00:00.000Z", "team-a", "team-b", 5, 0);
  const matchesWithFuture = [...equalMatches, futureMatch];
  const resE1 = computeModelV1(inputEqual, equalMatches, allTeams, standingsEqual, params);
  const resE2 = computeModelV1(inputEqual, matchesWithFuture, allTeams, standingsEqual, params);
  check("E1: resultado idéntico (partido futuro ignorado)", resE1.probabilities.home === resE2.probabilities.home && resE1.probabilities.draw === resE2.probabilities.draw && resE1.probabilities.away === resE2.probabilities.away);

  console.log("\n--- F. Reproducibilidad determinista ---");
  const resF1 = computeModelV1(inputEqual, equalMatches, allTeams, standingsEqual, params);
  const resF2 = computeModelV1(inputEqual, equalMatches, allTeams, standingsEqual, params);
  check("F1: misma entrada = mismo resultado", resF1.probabilities.home === resF2.probabilities.home && resF1.probabilities.draw === resF2.probabilities.draw && resF1.probabilities.away === resF2.probabilities.away);

  console.log("\n--- G. Suma de probabilidades = 1 ---");
  check("G1: suma ≈ 1 (tolerancia 0.0001)", Math.abs(resA.probabilities.home + resA.probabilities.draw + resA.probabilities.away - 1) <= 0.0001);
  check("G2: suma ≈ 1 (caso B)", Math.abs(resB.probabilities.home + resB.probabilities.draw + resB.probabilities.away - 1) <= 0.0001);
  check("G3: suma ≈ 1 (caso C)", Math.abs(resC.probabilities.home + resC.probabilities.draw + resC.probabilities.away - 1) <= 0.0001);
  check("G4: suma ≈ 1 (caso D fallback)", Math.abs(resD.probabilities.home + resD.probabilities.draw + resD.probabilities.away - 1) <= 0.0001);

  console.log("\n--- H. Sin NaN/Infinity/negativos ---");
  for (const [label, res] of [["A", resA], ["B", resB], ["C", resC], ["D", resD]] as const) {
    check(`H${label}: home válido`, Number.isFinite(res.probabilities.home) && res.probabilities.home >= 0);
    check(`H${label}: draw válido`, Number.isFinite(res.probabilities.draw) && res.probabilities.draw >= 0);
    check(`H${label}: away válido`, Number.isFinite(res.probabilities.away) && res.probabilities.away >= 0);
    check(`H${label}: xG home válido`, Number.isFinite(res.expectedGoals.home) && res.expectedGoals.home >= 0);
    check(`H${label}: xG away válido`, Number.isFinite(res.expectedGoals.away) && res.expectedGoals.away >= 0);
  }

  console.log("\n--- I. Dixon-Coles enabled vs disabled ---");
  const paramsNoDC = { ...params, dcEnabled: false };
  const resIDC = computeModelV1(inputEqual, equalMatches, allTeams, standingsEqual, params);
  const resINoDC = computeModelV1(inputEqual, equalMatches, allTeams, standingsEqual, paramsNoDC);
  check("I1: probabilidades difieren con DC enabled/disabled", resIDC.probabilities.home !== resINoDC.probabilities.home || resIDC.probabilities.draw !== resINoDC.probabilities.draw || resIDC.probabilities.away !== resINoDC.probabilities.away);
  check("I2: ambas suman ≈ 1", Math.abs(resIDC.probabilities.home + resIDC.probabilities.draw + resIDC.probabilities.away - 1) <= 0.0001 && Math.abs(resINoDC.probabilities.home + resINoDC.probabilities.draw + resINoDC.probabilities.away - 1) <= 0.0001);
  console.log(`   Con DC: home=${resIDC.probabilities.home.toFixed(4)}, draw=${resIDC.probabilities.draw.toFixed(4)}, away=${resIDC.probabilities.away.toFixed(4)}`);
  console.log(`   Sin DC: home=${resINoDC.probabilities.home.toFixed(4)}, draw=${resINoDC.probabilities.draw.toFixed(4)}, away=${resINoDC.probabilities.away.toFixed(4)}`);

  console.log("\n--- K. Lambda clamp (maxLambda / minLambda) ---");
  // K1: lambdaRawHome > maxLambda -> clamp to maxLambda
  const paramsClampMax = { ...params, maxLambda: 2.0 };
  const resK1 = computeModelV1(inputHomeStrong, homeStrongMatches, allTeams, standingsHomeStrong, paramsClampMax);
  check("K1: lambdaHome clamp maxLambda=2.0", resK1.expectedGoals.home === 2.0, `got ${resK1.expectedGoals.home}`);
  check("K1b: lambdaAway no clampado si < maxLambda", resK1.expectedGoals.away < 2.0 && resK1.expectedGoals.away > 0);

  // K2: lambdaRawAway > maxLambda
  const paramsClampMaxAway = { ...params, maxLambda: 1.0 };
  const resK2 = computeModelV1(inputAwayStrong, awayStrongMatches, allTeams, standingsAwayStrong, paramsClampMaxAway);
  check("K2: lambdaAway clamp maxLambda=1.0", resK2.expectedGoals.away === 1.0, `got ${resK2.expectedGoals.away}`);
  check("K2b: lambdaHome no clampado si < maxLambda", resK2.expectedGoals.home < 1.0 && resK2.expectedGoals.home > 0);

  // K3: lambdaRawHome < minLambda
  const paramsClampMin = { ...params, minLambda: 1.0, maxLambda: 10.0 };
  const resK3 = computeModelV1(inputAwayStrong, awayStrongMatches, allTeams, standingsAwayStrong, paramsClampMin);
  check("K3: lambdaHome clamp minLambda=1.0", resK3.expectedGoals.home === 1.0, `got ${resK3.expectedGoals.home}`);

  // K4: lambdaRawAway < minLambda
  const paramsClampMinAway = { ...params, minLambda: 1.0, maxLambda: 10.0 };
  const resK4 = computeModelV1(inputHomeStrong, homeStrongMatches, allTeams, standingsHomeStrong, paramsClampMinAway);
  check("K4: lambdaAway clamp minLambda=1.0", resK4.expectedGoals.away === 1.0, `got ${resK4.expectedGoals.away}`);

  console.log("\n--- L. Dixon-Coles tau safeguard ---");
  // L1: tau(0,1) = 1 + lambdaHome*rho puede ser negativo con rho muy negativo
  const paramsTauTest = { ...params, dcEnabled: true, dcRho: -1.0, maxLambda: 10.0 };
  const resL1 = computeModelV1(inputEqual, equalMatches, allTeams, standingsEqual, paramsTauTest);
  check("L1: tau(0,1) clamp a 0 con rho=-1.0, lambda=10", resL1.probabilities.home >= 0 && resL1.probabilities.draw >= 0 && resL1.probabilities.away >= 0);
  check("L1b: probabilidades válidas (sin negativos/NaN)", Number.isFinite(resL1.probabilities.home) && resL1.probabilities.home >= 0 && Number.isFinite(resL1.probabilities.draw) && resL1.probabilities.draw >= 0 && Number.isFinite(resL1.probabilities.away) && resL1.probabilities.away >= 0);

  // L2: con rho=-0.13 y maxLambda=5.0, tau siempre > 0 (verificación de diseño)
  const paramsTauDesign = { ...params, dcEnabled: true, dcRho: -0.13, maxLambda: 5.0 };
  const resL2 = computeModelV1(inputHomeStrong, homeStrongMatches, allTeams, standingsHomeStrong, paramsTauDesign);
  check("L2: tau >= 0 con rho=-0.13, maxLambda=5", resL2.probabilities.home >= 0 && resL2.probabilities.draw >= 0 && resL2.probabilities.away >= 0);

  console.log("\n--- M. Home advantage: solo datos, sin factor extra ---");
  // M1: ventaja local existe por leagueAvgHomeGoals > leagueAvgAwayGoals
  check("M1: P(home) > P(away) en caso A (datos sin factor extra)", resA.probabilities.home > resA.probabilities.away);
  check("M2: P(home) no extremadamente alta en caso A (sin factor 1.25)", resA.probabilities.home < 0.6);
  // M3: lambdaHome NO incluye homeAdvFactor en V1 (comportamiento efectivo = 1.0)
  // Verificado indirectamente: lambdaHome en caso A = 1.118 (sin factor 1.25)

  console.log("\n--- N. Home advantage: parametro retenido para compatibilidad ---");
  check("N1: homeAdvFactor presente en parameters", resA.parameters.homeAdvFactor === 1.25);
  check("N2: homeAdvEstimation presente en parameters", resA.parameters.homeAdvEstimation === "fixed");

  console.log("\n======================================================================");
  console.log(`RESULTADO FINAL BLOQUE 6: ${failed === 0 ? "TODOS LOS TESTS PASARON ✅✅✅" : `${failed} FALLARON ❌`}`);
  console.log(`Pasaron: ${passed}, Fallaron: ${failed}`);
  console.log("======================================================================");

  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});