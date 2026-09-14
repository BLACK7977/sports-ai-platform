/**
 * Smoke tests for score-refresh-service with mocked dependencies.
 *
 * Tests:
 *  A. scheduled → finished update (scores 1-1)
 *  B. exactly ONE Sportmonks request
 *  C. invalid/non-Sportmonks match → no provider call
 *  D. invalid fixture ID → no provider call
 *  E. provider API error → no DB write
 *  F. HTTP 429 → no DB write, safe error
 *  G. malformed provider status → no DB write
 *  H. negative/decimal scores → no DB write
 *  I. upsert failure → service throws, never success
 *  J. existing sport_specific metadata preserved
 *  K. source.provider and source.external_id preserved
 *  L. unchanged fixture → no DB write (changed=false)
 *  M. predictions table never accessed
 *  N. ABN/ABANDONED status → throws, no DB write
 *  O. Transition: finished 2-1 → scheduled → null scores persisted
 *  P. Transition: finished 2-1 → postponed → null scores persisted
 *  Q. Transition: finished 2-1 → cancelled → null scores persisted
 *  R. Null serialization: upsert payload contains explicit null, not undefined
 *
 * Run: npm run smoke:score-refresh
 */
import { refreshMatchScore, ScoreRefreshError } from "@/lib/services/score-refresh-service";
import { mapSportmonksState, extractCurrentScores, normalizeFixtureResult } from "@/sports/soccer/data-sources/sportmonks-normalize";
import type { Match, MatchStatus } from "@/types/db/tables";

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

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "m-soccer-sportmonks:match:19713931",
    sport_id: "soccer",
    league_id: "sportmonks-denmark-superliga",
    season_id: "sportmonks-denmark-superliga-2026-2027",
    home_team_id: "sportmonks-team-86",
    away_team_id: "sportmonks-team-2447",
    match_date: "2026-09-13T12:00:00+00:00",
    status: "scheduled",
    external_id: "sportmonks:match:19713931",
    provider: "sportmonks",
    created_at: "2026-09-12T20:53:16.784+00:00",
    updated_at: "2026-09-12T20:53:22.784+00:00",
    sport_specific: { duration_minutes: 90, round: 407054 },
    ...overrides,
  };
}

function makeFixtureResult(id: number, stateShort: string, scores: Array<{ description: string; score: { participant: string; goals: number } }> = []) {
  return { id, state: { short_name: stateShort, name: stateShort }, scores };
}

type UpsertPayload = {
  id: string;
  status: MatchStatus;
  home_score: number | null;
  away_score: number | null;
  sport_specific: Record<string, unknown>;
  [key: string]: unknown;
};

/** Cast helper to avoid TypeScript control-flow narrowing to `never` after null init. */
function asPayload(v: UpsertPayload | null): UpsertPayload | null {
  return v;
}

async function runTests(): Promise<void> {
  console.log("=== SMOKE TESTS — Score Refresh Service (Mocked) ===\n");

  // --- Unit tests for normalization ---
  console.log("--- A0. Status mapping ---");
  check("A0.1: NS → scheduled", mapSportmonksState({ short_name: "NS" }) === "scheduled");
  check("A0.2: FT → finished", mapSportmonksState({ short_name: "FT" }) === "finished");
  check("A0.3: 1H → in_progress", mapSportmonksState({ short_name: "1H" }) === "in_progress");
  check("A0.4: PST → postponed", mapSportmonksState({ short_name: "PST" }) === "postponed");
  check("A0.5: CANC → cancelled", mapSportmonksState({ short_name: "CANC" }) === "cancelled");

  console.log("\n--- A0. ABN/ABANDONED → unsupported (throws) ---");
  {
    let threwAbn = false;
    let threwAbandoned = false;
    try { mapSportmonksState({ short_name: "ABN" }); } catch { threwAbn = true; }
    try { mapSportmonksState({ short_name: "ABANDONED" }); } catch { threwAbandoned = true; }
    check("A0.6: ABN throws", threwAbn);
    check("A0.7: ABANDONED throws", threwAbandoned);
  }

  console.log("\n--- A0. Score extraction ---");
  const scores1 = [
    { description: "CURRENT", score: { participant: "home", goals: 1 } },
    { description: "CURRENT", score: { participant: "away", goals: 1 } },
  ];
  const { homeScore: h1, awayScore: a1 } = extractCurrentScores(scores1);
  check("A0.8: home score = 1", h1 === 1);
  check("A0.9: away score = 1", a1 === 1);
  const { homeScore: h2, awayScore: a2 } = extractCurrentScores(null);
  check("A0.10: null scores → null", h2 === null && a2 === null);

  // --- Service tests ---
  console.log("\n--- A. scheduled → finished update (scores 1-1) ---");
  {
    let upsertedWith: UpsertPayload | null = null;
    let requestCount = 0;
    const match = makeMatch();
    const fixture = makeFixtureResult(19713931, "FT", [
      { description: "CURRENT", score: { participant: "home", goals: 1 } },
      { description: "CURRENT", score: { participant: "away", goals: 1 } },
    ]);
    const result = await refreshMatchScore(match.id, {
      getMatchById: async () => match,
      updateMatchResult: async (row) => { upsertedWith = row as UpsertPayload; return row as unknown as Match; },
      createClient: () => ({
        getFixtureById: async () => { requestCount++; return fixture; },
      } as never),
    });
    check("A1: changed=true", result.changed === true);
    check("A2: after status=finished", result.after.status === "finished");
    check("A3: after homeScore=1", result.after.homeScore === 1);
    check("A4: after awayScore=1", result.after.awayScore === 1);
    check("A5: upsert was called", asPayload(upsertedWith) !== null);
    check("A6: saved status=finished", asPayload(upsertedWith)!.status === "finished");
    check("A7: saved home_score=1", asPayload(upsertedWith)!.home_score === 1);
    check("A8: saved away_score=1", asPayload(upsertedWith)!.away_score === 1);
  }

  console.log("\n--- B. exactly ONE Sportmonks request ---");
  {
    let requestCount = 0;
    const match = makeMatch();
    const fixture = makeFixtureResult(19713931, "FT", [
      { description: "CURRENT", score: { participant: "home", goals: 2 } },
      { description: "CURRENT", score: { participant: "away", goals: 0 } },
    ]);
    await refreshMatchScore(match.id, {
      getMatchById: async () => match,
      updateMatchResult: async (row) => row as unknown as Match,
      createClient: () => ({
        getFixtureById: async () => { requestCount++; return fixture; },
      } as never),
    });
    check("B1: exactly 1 request", requestCount === 1);
  }

  console.log("\n--- C. invalid/non-Sportmonks match → no provider call ---");
  {
    let requestCount = 0;
    const match = makeMatch({ provider: "statsbomb" });
    let threw = false;
    try {
      await refreshMatchScore(match.id, {
        getMatchById: async () => match,
        updateMatchResult: async () => { requestCount++; return null; },
        createClient: () => ({
          getFixtureById: async () => { requestCount++; return {}; },
        } as never),
      });
    } catch (e) {
      threw = true;
      check("C1: throws ScoreRefreshError", e instanceof ScoreRefreshError);
    }
    check("C2: threw", threw);
    check("C3: no provider call", requestCount === 0);
  }

  console.log("\n--- D. invalid fixture ID → no provider call ---");
  {
    let requestCount = 0;
    const match = makeMatch({ external_id: "sportmonks:match:abc" });
    let threw = false;
    try {
      await refreshMatchScore(match.id, {
        getMatchById: async () => match,
        updateMatchResult: async () => { requestCount++; return null; },
        createClient: () => ({
          getFixtureById: async () => { requestCount++; return {}; },
        } as never),
      });
    } catch (e) {
      threw = true;
      check("D1: throws ScoreRefreshError", e instanceof ScoreRefreshError);
    }
    check("D2: threw", threw);
    check("D3: no provider call", requestCount === 0);
  }

  console.log("\n--- D4. fixture ID edge cases ---");
  {
    const cases = [
      { ext: "sportmonks:match:0", label: "zero" },
      { ext: "sportmonks:match:-1", label: "negative" },
      { ext: "sportmonks:match:1.5", label: "decimal" },
      { ext: "sportmonks:match:NaN", label: "NaN" },
      { ext: "sportmonks:match:Infinity", label: "Infinity" },
      { ext: "sportmonks:match:", label: "empty" },
    ];
    for (const c of cases) {
      const match = makeMatch({ external_id: c.ext });
      let threw = false;
      try {
        await refreshMatchScore(match.id, {
          getMatchById: async () => match,
          updateMatchResult: async () => null,
          createClient: () => ({ getFixtureById: async () => ({}) } as never),
        });
      } catch (e) {
        threw = true;
      }
      check(`D4.${c.label}: throws`, threw);
    }
  }

  console.log("\n--- E. provider API error → no DB write ---");
  {
    let upsertCount = 0;
    const match = makeMatch();
    let threw = false;
    try {
      await refreshMatchScore(match.id, {
        getMatchById: async () => match,
        updateMatchResult: async () => { upsertCount++; return null; },
        createClient: () => ({
          getFixtureById: async () => { throw new Error("API down"); },
        } as never),
      });
    } catch (e) {
      threw = true;
      check("E1: throws ScoreRefreshError", e instanceof ScoreRefreshError);
    }
    check("E2: threw", threw);
    check("E3: no DB write", upsertCount === 0);
  }

  console.log("\n--- F. HTTP 429 → no DB write, safe error ---");
  {
    let upsertCount = 0;
    const match = makeMatch();
    let threw = false;
    try {
      await refreshMatchScore(match.id, {
        getMatchById: async () => match,
        updateMatchResult: async () => { upsertCount++; return null; },
        createClient: () => ({
          getFixtureById: async () => { throw new Error("[sportmonks] /fixtures/19713931 respondió HTTP 429."); },
        } as never),
      });
    } catch (e) {
      threw = true;
      check("F1: throws ScoreRefreshError", e instanceof ScoreRefreshError);
      check("F2: message mentions rate limit", (e as Error).message.includes("rate limit"));
    }
    check("F3: threw", threw);
    check("F4: no DB write", upsertCount === 0);
  }

  console.log("\n--- G. malformed provider status → no DB write ---");
  {
    let upsertCount = 0;
    const match = makeMatch();
    const fixture = { id: 19713931, state: { short_name: "XYZ" }, scores: [] };
    let threw = false;
    try {
      await refreshMatchScore(match.id, {
        getMatchById: async () => match,
        updateMatchResult: async () => { upsertCount++; return null; },
        createClient: () => ({
          getFixtureById: async () => fixture,
        } as never),
      });
    } catch (e) {
      threw = true;
    }
    check("G1: threw on bad status", threw);
    check("G2: no DB write", upsertCount === 0);
  }

  console.log("\n--- H. negative/decimal scores → no DB write ---");
  {
    const badScores = [
      { home: -1, away: 1, label: "negative home" },
      { home: 1, away: -1, label: "negative away" },
      { home: 1.5, away: 1, label: "decimal home" },
      { home: 1, away: 2.5, label: "decimal away" },
    ];
    for (const bs of badScores) {
      let upsertCount = 0;
      const match = makeMatch();
      const fixture = makeFixtureResult(19713931, "FT", [
        { description: "CURRENT", score: { participant: "home", goals: bs.home } },
        { description: "CURRENT", score: { participant: "away", goals: bs.away } },
      ]);
      let threw = false;
      try {
        await refreshMatchScore(match.id, {
          getMatchById: async () => match,
          updateMatchResult: async () => { upsertCount++; return null; },
          createClient: () => ({
            getFixtureById: async () => fixture,
          } as never),
        });
      } catch (e) {
        threw = true;
        check(`H.${bs.label}: throws ScoreRefreshError`, e instanceof ScoreRefreshError);
      }
      check(`H.${bs.label}: threw`, threw);
      check(`H.${bs.label}: no DB write`, upsertCount === 0);
    }
  }

  console.log("\n--- H2. valid score edge cases ---");
  {
    const validScores = [
      { home: 0, away: 0, label: "0-0" },
      { home: 1, away: 1, label: "1-1" },
      { home: 10, away: 5, label: "10-5" },
    ];
    for (const vs of validScores) {
      let upsertedWith: UpsertPayload | null = null;
      const match = makeMatch({ status: "in_progress" });
      const fixture = makeFixtureResult(19713931, "FT", [
        { description: "CURRENT", score: { participant: "home", goals: vs.home } },
        { description: "CURRENT", score: { participant: "away", goals: vs.away } },
      ]);
      await refreshMatchScore(match.id, {
        getMatchById: async () => match,
      updateMatchResult: async (row) => { upsertedWith = row as UpsertPayload; return row as unknown as Match; },
        createClient: () => ({
          getFixtureById: async () => fixture,
        } as never),
      });
      check(`H2.${vs.label}: persisted`, asPayload(upsertedWith) !== null);
    }
  }

  console.log("\n--- I. upsert failure → service throws, never success ---");
  {
    const match = makeMatch();
    const fixture = makeFixtureResult(19713931, "FT", [
      { description: "CURRENT", score: { participant: "home", goals: 1 } },
      { description: "CURRENT", score: { participant: "away", goals: 1 } },
    ]);
    let threw = false;
    try {
      await refreshMatchScore(match.id, {
        getMatchById: async () => match,
        updateMatchResult: async () => null,
        createClient: () => ({
          getFixtureById: async () => fixture,
        } as never),
      });
    } catch (e) {
      threw = true;
      check("I1: throws ScoreRefreshError", e instanceof ScoreRefreshError);
      check("I2: message mentions DB failure", (e as Error).message.includes("DB upsert failed"));
    }
    check("I3: threw", threw);
  }

  console.log("\n--- J. existing sport_specific metadata preserved ---");
  {
    let savedSportSpecific: Record<string, unknown> | undefined;
    const match = makeMatch({
      sport_specific: { duration_minutes: 90, round: 407054, customField: "keep-me" },
    });
    const fixture = makeFixtureResult(19713931, "FT", [
      { description: "CURRENT", score: { participant: "home", goals: 3 } },
      { description: "CURRENT", score: { participant: "away", goals: 2 } },
    ]);
    await refreshMatchScore(match.id, {
      getMatchById: async () => match,
      updateMatchResult: async (row) => { savedSportSpecific = (row as UpsertPayload).sport_specific; return row as unknown as Match; },
      createClient: () => ({
        getFixtureById: async () => fixture,
      } as never),
    });
    const ss = savedSportSpecific as Record<string, unknown>;
    check("J1: duration_minutes preserved", ss.duration_minutes === 90);
    check("J2: round preserved", ss.round === 407054);
    check("J3: customField preserved", ss.customField === "keep-me");
  }

  console.log("\n--- K. source.provider and source.external_id preserved ---");
  {
    let savedSportSpecific: Record<string, unknown> | undefined;
    const match = makeMatch({
      sport_specific: {
        duration_minutes: 90,
        source: { provider: "sportmonks", external_id: 19713931, last_synced_at: "2026-09-12T20:53:12.101Z" },
      },
    });
    const fixture = makeFixtureResult(19713931, "FT", [
      { description: "CURRENT", score: { participant: "home", goals: 1 } },
      { description: "CURRENT", score: { participant: "away", goals: 1 } },
    ]);
    await refreshMatchScore(match.id, {
      getMatchById: async () => match,
      updateMatchResult: async (row) => { savedSportSpecific = (row as UpsertPayload).sport_specific; return row as unknown as Match; },
      createClient: () => ({
        getFixtureById: async () => fixture,
      } as never),
    });
    const ss = savedSportSpecific as Record<string, unknown>;
    const source = ss.source as Record<string, unknown>;
    check("K1: source.provider = sportmonks", source.provider === "sportmonks");
    check("K2: source.external_id = 19713931", source.external_id === 19713931);
    check("K3: source.last_synced_at updated", typeof source.last_synced_at === "string" && source.last_synced_at !== "2026-09-12T20:53:12.101Z");
  }

  console.log("\n--- L. unchanged fixture → no DB write (changed=false) ---");
  {
    let upsertCount = 0;
    const match = makeMatch({ status: "finished", home_score: 1, away_score: 1 });
    const fixture = makeFixtureResult(19713931, "FT", [
      { description: "CURRENT", score: { participant: "home", goals: 1 } },
      { description: "CURRENT", score: { participant: "away", goals: 1 } },
    ]);
    const result = await refreshMatchScore(match.id, {
      getMatchById: async () => match,
      updateMatchResult: async () => { upsertCount++; return null; },
      createClient: () => ({
        getFixtureById: async () => fixture,
      } as never),
    });
    check("L1: changed=false", result.changed === false);
    check("L2: no DB write", upsertCount === 0);
  }

  console.log("\n--- M. predictions table never accessed ---");
  {
    const dbTablesAccessed: string[] = [];
    const match = makeMatch();
    const fixture = makeFixtureResult(19713931, "FT", [
      { description: "CURRENT", score: { participant: "home", goals: 1 } },
      { description: "CURRENT", score: { participant: "away", goals: 1 } },
    ]);
    await refreshMatchScore(match.id, {
      getMatchById: async () => { dbTablesAccessed.push("matches"); return match; },
      updateMatchResult: async (row) => { dbTablesAccessed.push("matches_upsert"); return row as unknown as Match; },
      createClient: () => ({
        getFixtureById: async () => fixture,
      } as never),
    });
    check("M1: no prediction table access", !dbTablesAccessed.some((t) => t.includes("prediction")));
  }

  // --- N. ABN/ABANDONED status → throws, no DB write ---
  console.log("\n--- N. ABN/ABANDONED → throws, no DB write ---");
  {
    for (const state of ["ABN", "ABANDONED"]) {
      let upsertCount = 0;
      const match = makeMatch();
      const fixture = { id: 19713931, state: { short_name: state }, scores: [] };
      let threw = false;
      try {
        await refreshMatchScore(match.id, {
          getMatchById: async () => match,
          updateMatchResult: async () => { upsertCount++; return null; },
          createClient: () => ({
            getFixtureById: async () => fixture,
          } as never),
        });
      } catch (e) {
        threw = true;
      }
      check(`N.${state}: throws`, threw);
      check(`N.${state}: no DB write`, upsertCount === 0);
    }
  }

  // --- O. Transition: finished 2-1 → scheduled → null scores persisted ---
  console.log("\n--- O. Transition: finished 2-1 → scheduled ---");
  {
    let savedPayload: UpsertPayload | null = null;
    const match = makeMatch({ status: "finished", home_score: 2, away_score: 1 });
    const fixture = makeFixtureResult(19713931, "NS", []);
    const result = await refreshMatchScore(match.id, {
      getMatchById: async () => match,
      updateMatchResult: async (row) => { savedPayload = row as UpsertPayload; return row as unknown as Match; },
      createClient: () => ({
        getFixtureById: async () => fixture,
      } as never),
    });
    check("O1: changed=true", result.changed === true);
    check("O2: after status=scheduled", result.after.status === "scheduled");
    check("O3: after homeScore=null", result.after.homeScore === null);
    check("O4: after awayScore=null", result.after.awayScore === null);
    check("O5: payload home_score is null (not undefined)", asPayload(savedPayload) !== null && asPayload(savedPayload)!.home_score === null);
    check("O6: payload away_score is null (not undefined)", asPayload(savedPayload) !== null && asPayload(savedPayload)!.away_score === null);
    check("O7: payload home_score is NOT undefined", asPayload(savedPayload) !== null && asPayload(savedPayload)!.home_score !== undefined);
    check("O8: payload away_score is NOT undefined", asPayload(savedPayload) !== null && asPayload(savedPayload)!.away_score !== undefined);
  }

  // --- P. Transition: finished 2-1 → postponed → null scores persisted ---
  console.log("\n--- P. Transition: finished 2-1 → postponed ---");
  {
    let savedPayload: UpsertPayload | null = null;
    const match = makeMatch({ status: "finished", home_score: 2, away_score: 1 });
    const fixture = makeFixtureResult(19713931, "PST", []);
    const result = await refreshMatchScore(match.id, {
      getMatchById: async () => match,
      updateMatchResult: async (row) => { savedPayload = row as UpsertPayload; return row as unknown as Match; },
      createClient: () => ({
        getFixtureById: async () => fixture,
      } as never),
    });
    check("P1: changed=true", result.changed === true);
    check("P2: after status=postponed", result.after.status === "postponed");
    check("P3: after homeScore=null", result.after.homeScore === null);
    check("P4: after awayScore=null", result.after.awayScore === null);
    check("P5: payload home_score is null", asPayload(savedPayload) !== null && asPayload(savedPayload)!.home_score === null);
    check("P6: payload away_score is null", asPayload(savedPayload) !== null && asPayload(savedPayload)!.away_score === null);
  }

  // --- Q. Transition: finished 2-1 → cancelled → null scores persisted ---
  console.log("\n--- Q. Transition: finished 2-1 → cancelled ---");
  {
    let savedPayload: UpsertPayload | null = null;
    const match = makeMatch({ status: "finished", home_score: 2, away_score: 1 });
    const fixture = makeFixtureResult(19713931, "CANC", []);
    const result = await refreshMatchScore(match.id, {
      getMatchById: async () => match,
      updateMatchResult: async (row) => { savedPayload = row as UpsertPayload; return row as unknown as Match; },
      createClient: () => ({
        getFixtureById: async () => fixture,
      } as never),
    });
    check("Q1: changed=true", result.changed === true);
    check("Q2: after status=cancelled", result.after.status === "cancelled");
    check("Q3: after homeScore=null", result.after.homeScore === null);
    check("Q4: after awayScore=null", result.after.awayScore === null);
    check("Q5: payload home_score is null", asPayload(savedPayload) !== null && asPayload(savedPayload)!.home_score === null);
    check("Q6: payload away_score is null", asPayload(savedPayload) !== null && asPayload(savedPayload)!.away_score === null);
  }

  // --- R. Null serialization: verify payload types ---
  console.log("\n--- R. Null serialization: payload contains explicit null ---");
  {
    let savedPayload: UpsertPayload | null = null;
    const match = makeMatch({ status: "finished", home_score: 3, away_score: 0 });
    const fixture = makeFixtureResult(19713931, "NS", []);
    await refreshMatchScore(match.id, {
      getMatchById: async () => match,
      updateMatchResult: async (row) => { savedPayload = row as UpsertPayload; return row as unknown as Match; },
      createClient: () => ({
        getFixtureById: async () => fixture,
      } as never),
    });
    check("R1: payload exists", asPayload(savedPayload) !== null);
    check("R2: home_score === null (strict)", asPayload(savedPayload)!.home_score === null);
    check("R3: away_score === null (strict)", asPayload(savedPayload)!.away_score === null);
    check("R4: typeof home_score is object (null)", typeof asPayload(savedPayload)!.home_score === "object");
    check("R5: typeof away_score is object (null)", typeof asPayload(savedPayload)!.away_score === "object");
    check("R6: home_score is not undefined", asPayload(savedPayload)!.home_score !== undefined);
    check("R7: away_score is not undefined", asPayload(savedPayload)!.away_score !== undefined);
  }

  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
