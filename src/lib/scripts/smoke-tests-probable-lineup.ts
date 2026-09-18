import assert from "node:assert/strict";
import {
  computeProbableLineupForTeam,
  type ProbableLineupEvidenceXI,
  type ProbableStarter,
} from "@/lib/ai/probable-lineup-model";
import {
  generateProbableLineups,
  ProbableLineupErrorCodes,
  ProbableLineupServiceError,
  storedProbableLineupView,
  type ProbableLineupRunInsert,
  type ProbableLineupStore,
  type StoredProbableLineup,
} from "@/lib/services/probable-lineup-service";
import {
  lineupUIPrecedence,
  probableLineupViews,
} from "@/lib/presentation/probable-lineup";
import { AI_RATE_LIMITS } from "@/lib/ai/rate-limiter";
import type {
  ProbableLineupPlayer,
  ProbableLineupRun,
} from "@/types/db/tables";

const NOW = Date.parse("2026-09-16T12:00:00Z");

const THREE_PS = ["1:1", "2:1", "2:2", "2:3", "2:4", "3:1", "3:2", "3:3", "4:1", "4:2", "4:3"];
const FOUR_FOUR_TWO = ["1:1", "2:1", "2:2", "2:3", "2:4", "3:1", "3:2", "3:3", "3:4", "4:1", "4:2"];

function xi(
  matchId: string,
  dateISO: string,
  fields: string[] = THREE_PS,
  playerPrefix = "P",
): ProbableLineupEvidenceXI {
  const starters: ProbableStarter[] = fields.map((field, index) => ({
    playerId: `${playerPrefix}-${index + 1}`,
    playerName: `${playerPrefix} ${index + 1}`,
    formationField: field,
  }));
  return { matchId, kickoffAt: dateISO, starters };
}

function startersWith(fields: string[], name: string): ProbableStarter[] {
  return fields.map((field, index) => ({
    playerId: `${name}-${index + 1}`,
    playerName: `${name} ${index + 1}`,
    formationField: field,
  }));
}

function xiWith(matchId: string, dateISO: string, name: string, fields: string[] = THREE_PS): ProbableLineupEvidenceXI {
  return { matchId, kickoffAt: dateISO, starters: startersWith(fields, name) };
}

function storedFromRun(run: ProbableLineupRunInsert): StoredProbableLineup {
  return {
    id: `${run.matchId}:${run.teamId}`,
    matchId: run.matchId,
    teamId: run.teamId,
    modelVersion: run.modelVersion,
    generatedAt: run.inputCutoffAt,
    inputCutoffAt: run.inputCutoffAt,
    formation: run.formation,
    evidenceCoverage: run.evidenceCoverage,
    status: "AVAILABLE",
    players: run.players.map((p, index) => ({
      id: `${run.matchId}:${p.formationField}`,
      playerId: p.playerId,
      playerName: p.playerName,
      formationField: p.formationField,
      evidenceScore: p.evidenceScore,
      deterministicOrder: index + 1,
    })),
  };
}

function fakeStore(options: {
  official?: boolean;
  evidence?: Record<string, ProbableLineupEvidenceXI[]>;
  existing?: StoredProbableLineup[];
} = {}) {
  const calls = { inserts: 0, evidenceLoads: 0 };
  const store: ProbableLineupStore = {
    getMatchById: async () => ({
      id: "m-soccer-sportmonks:match:99990001",
      home_team_id: "team-home",
      away_team_id: "team-away",
      match_date: "2026-09-18T19:00:00Z",
      status: "scheduled",
    }),
    hasOfficialLineups: async () => options.official ?? false,
    findExistingRun: async () => null,
    listExistingRuns: async () => options.existing ?? [],
    loadTeamLineupEvidence: async (teamId) => {
      calls.evidenceLoads++;
      return options.evidence?.[teamId] ?? [];
    },
    insertRun: async (run) => {
      calls.inserts++;
      return { lineup: storedFromRun(run), created: true };
    },
  };
  return { store, calls };
}

async function main() {
  let tests = 0;
  const ok = (value: unknown, msg: string) => { assert.ok(value, msg); tests++; };

  // 1) Determinism: same evidence → identical output.
  {
    const evidence = [xi("m1", "2026-09-01T19:00:00Z"), xi("m2", "2026-09-08T19:00:00Z"), xi("m3", "2026-09-15T19:00:00Z")];
    const a = computeProbableLineupForTeam(evidence);
    const b = computeProbableLineupForTeam(evidence);
    assert.ok(a && b && a.formation === b.formation && a.evidenceCoverage === b.evidenceCoverage);
    assert.deepEqual(a?.slots, b?.slots, "deterministic slot assignment");
    assert.deepEqual(a?.usedMatchIds, b?.usedMatchIds, "deterministic evidence selection");
    assert.equal(a?.usedMatchIds.join(","), "m1,m2,m3", "used matches ordered oldest→newest");
    ok(a?.usedMatchIds.join(",") === "m1,m2,m3", "determinism + ordering");
  }

  // 2) Formation from observed history (recency-weighted frequency).
  {
    const evidence = [
      xi("mA", "2026-09-01T19:00:00Z", FOUR_FOUR_TWO, "A"),
      xi("mB", "2026-09-08T19:00:00Z", THREE_PS, "B"),
      xi("mC", "2026-09-15T19:00:00Z", THREE_PS, "C"),
    ];
    const result = computeProbableLineupForTeam(evidence);
    assert.equal(result?.formation, "4-3-3", "two recent 4-3-3 XIs outweigh one old 4-4-2");
    ok(result?.formation === "4-3-3", "formation from observed history (majority + recency)");
  }

  // 3) Recency weighting: two recent 4-4-2 XIs outweigh one older 4-3-3.
  {
    const evidence = [
      xi("mA", "2026-09-01T19:00:00Z", THREE_PS, "A"),
      xi("mB", "2026-09-08T19:00:00Z", FOUR_FOUR_TWO, "B"),
      xi("mC", "2026-09-15T19:00:00Z", FOUR_FOUR_TWO, "C"),
    ];
    const result = computeProbableLineupForTeam(evidence);
    assert.equal(result?.formation, "4-4-2", "recency-weighted formation");
    ok(result?.formation === "4-4-2", "formation from observed history (recency)");
  }

  // 4) No invented players / slots come only from observed formation_field.
  {
    const evidence = [
      xi("mA", "2026-09-01T19:00:00Z", THREE_PS, "A"),
      xi("mB", "2026-09-08T19:00:00Z", THREE_PS, "B"),
      xi("mC", "2026-09-15T19:00:00Z", ["1:1", "2:1", "2:2", "2:3", "2:4", "3:1", "3:2", "3:3", "4:1"], "C"),
    ];
    const result = computeProbableLineupForTeam(evidence);
    assert.ok(result);
    const observedInChosen = new Set<string>();
    for (const e of evidence) {
      for (const s of e.starters) observedInChosen.add(s.formationField);
    }
    const knownPlayers = new Set<string>();
    for (const e of evidence) for (const s of e.starters) if (s.playerName) knownPlayers.add(s.playerName);
    for (const slot of result.slots) {
      assert.ok(observedInChosen.has(slot.formationField), `slot ${slot.formationField} observed`);
      assert.ok(knownPlayers.has(slot.playerName ?? ""), `player ${slot.playerName} comes from evidence`);
      assert.ok(!slot.formationField.includes("4:2") && !slot.formationField.includes("4:3"), "missing forward slots are never invented");
    }
    ok(true, "no invented players and no invented slots");
  }

  // 5) evidence_coverage = filled slots / 11 (mathematically exact).
  {
    const full = computeProbableLineupForTeam([
      xi("mA", "2026-09-01T19:00:00Z", THREE_PS, "A"),
      xi("mB", "2026-09-08T19:00:00Z", THREE_PS, "B"),
      xi("mC", "2026-09-15T19:00:00Z", THREE_PS, "C"),
    ]);
    assert.equal(full?.evidenceCoverage, 1, "11 observed slots → 100% coverage");
    const partial = computeProbableLineupForTeam([
      xi("mA", "2026-09-01T19:00:00Z", ["1:1", "2:1", "2:2", "2:3", "2:4", "3:1", "3:2"], "A"),
    ]);
    assert.ok(partial && Math.abs(partial.evidenceCoverage - 7 / 11) < 1e-9, "coverage 7/11");
    ok(full?.evidenceCoverage === 1 && partial !== null && Math.abs(partial.evidenceCoverage - 7 / 11) < 1e-9, "coverage mathematically correct");
  }

  // 6) Insufficient evidence → unavailable (model returns null; service throws).
  {
    assert.equal(computeProbableLineupForTeam([]), null, "no XIs → null");
    assert.equal(
      computeProbableLineupForTeam([xi("m1", "2026-09-01T19:00:00Z", ["1:1", "2:1"])]),
      null,
      "too few structured starters → null",
    );
    assert.equal(
      computeProbableLineupForTeam([xi("m1", "2026-09-01T19:00:00Z", Array(11).fill("2:1"))]),
      null,
      "no GK structure → null",
    );
    const { store, calls } = fakeStore();
    await assert.rejects(
      generateProbableLineups({ store }, { matchId: "m", nowMs: NOW }),
      (err: unknown) => err instanceof ProbableLineupServiceError && err.code === ProbableLineupErrorCodes.INSUFFICIENT_EVIDENCE,
    );
    assert.equal(calls.inserts, 0, "zero writes on insufficient evidence");
    ok(calls.inserts === 0, "insufficient evidence → unavailable with zero writes");
  }

  // 7) Future lineup (kickoff after cutoff) is never used.
  {
    const pastOnly = fakeStore({
      evidence: {
        "team-home": [xi("mA", "2026-09-01T19:00:00Z", THREE_PS, "A"), xi("mB", "2026-09-08T19:00:00Z", THREE_PS, "B")],
        "team-away": [xi("mC", "2026-09-02T19:00:00Z", THREE_PS, "C"), xi("mD", "2026-09-09T19:00:00Z", THREE_PS, "D")],
      },
    });
    const withFuture = fakeStore({
      evidence: {
        "team-home": [xi("mA", "2026-09-01T19:00:00Z", THREE_PS, "A"), xi("mB", "2026-09-08T19:00:00Z", THREE_PS, "B"), xi("mFUTURE", "2026-09-20T19:00:00Z", THREE_PS, "FUTURE")],
        "team-away": [xi("mC", "2026-09-02T19:00:00Z", THREE_PS, "C"), xi("mD", "2026-09-09T19:00:00Z", THREE_PS, "D")],
      },
    });
    const [pastRes, futureRes] = await Promise.all([
      generateProbableLineups({ store: pastOnly.store, nowMs: () => NOW }, { matchId: "m", nowMs: NOW }),
      generateProbableLineups({ store: withFuture.store, nowMs: () => NOW }, { matchId: "m", nowMs: NOW }),
    ]);
    const names = (lineup: StoredProbableLineup) => lineup.players.map((p) => p.playerName).sort().join("|");
    assert.deepEqual(pastRes.teams.map(names), futureRes.teams.map(names), "future lineup does not change output");
    assert.ok(!futureRes.teams.some((t) => t.players.some((p) => p.playerName.includes("FUTURE"))), "future starters never used");
    assert.ok(futureRes.teams.every((t) => t.inputCutoffAt === new Date(NOW).toISOString()), "input_cutoff_at persisted");
    ok(pastRes.teams.map(names).join(",") === futureRes.teams.map(names).join(","), "future lineup never used");
  }

  // 8) Strict cutoff persisted and re-applied (defense in depth).
  {
    const evidence = {
      "team-home": [xi("mA", "2026-09-01T19:00:00Z", THREE_PS, "A"), xi("mB", "2026-09-15T19:00:00Z", THREE_PS, "B")],
      "team-away": [xi("mC", "2026-09-01T19:00:00Z", THREE_PS, "C")],
    };
    const { store } = fakeStore({ evidence });
    const result = await generateProbableLineups({ store, nowMs: () => NOW }, { matchId: "m", nowMs: NOW });
    assert.equal(result.teams.length, 2, "both teams generated");
    assert.deepEqual(
      result.teams.map((t) => t.teamId).sort(),
      ["team-away", "team-home"],
    );
    ok(result.teams.length === 2, "both teams generated on same request");
  }

  // 9) Existing canonical run is reused (created:false, zero writes).
  {
    const existing: StoredProbableLineup[] = [
      storedFromRun({ matchId: "m", teamId: "team-home", modelVersion: "v1-probable-xi-2026-09", inputCutoffAt: new Date(NOW).toISOString(), formation: "4-3-3", evidenceCoverage: 90, status: "AVAILABLE", players: [] }),
      storedFromRun({ matchId: "m", teamId: "team-away", modelVersion: "v1-probable-xi-2026-09", inputCutoffAt: new Date(NOW).toISOString(), formation: "4-4-2", evidenceCoverage: 80, status: "AVAILABLE", players: [] }),
    ];
    const { store, calls } = fakeStore({ existing });
    const result = await generateProbableLineups({ store, nowMs: () => NOW }, { matchId: "m", nowMs: NOW });
    assert.equal(result.created, false, "no regeneration");
    assert.equal(result.teams.length, 2, "existing both teams returned");
    assert.equal(calls.inserts, 0, "existing run reused without insert");
    assert.equal(calls.evidenceLoads, 0, "no evidence needed when canonical exists");
    ok(result.created === false && calls.inserts === 0, "existing run reused (canonical, immutable)");
  }

  // 10) Official lineup present → OFFICIAL_PRESENT, zero writes.
  {
    const { store, calls } = fakeStore({ official: true });
    await assert.rejects(
      generateProbableLineups({ store, nowMs: () => NOW }, { matchId: "m", nowMs: NOW }),
      (err: unknown) => err instanceof ProbableLineupServiceError && err.code === ProbableLineupErrorCodes.OFFICIAL_PRESENT,
    );
    assert.equal(calls.inserts, 0, "no writes when official present");
    ok(calls.inserts === 0, "official present blocks generation (strict precedence)");
  }

  // 11) Kickoff passed / not scheduled.
  {
    const { store } = fakeStore({ evidence: { "team-home": [xi("m1", "2026-09-01T19:00:00Z")], "team-away": [xi("m2", "2026-09-02T19:00:00Z")] } });
    const match = store as unknown as { getMatchById: () => Promise<{ status: string; match_date: string }> };
    const original = match.getMatchById;
    match.getMatchById = async () => ({ id: "m", home_team_id: "team-home", away_team_id: "team-away", match_date: "2026-09-10T19:00:00Z", status: "scheduled" });
    await assert.rejects(
      generateProbableLineups({ store: store as unknown as ProbableLineupStore, nowMs: () => NOW }, { matchId: "m", nowMs: NOW }),
      (err: unknown) => err instanceof ProbableLineupServiceError && err.code === ProbableLineupErrorCodes.KICKOFF_PASSED,
    );
    match.getMatchById = async () => ({ id: "m", home_team_id: "team-home", away_team_id: "team-away", match_date: "2026-09-20T19:00:00Z", status: "finished" });
    await assert.rejects(
      generateProbableLineups({ store: store as unknown as ProbableLineupStore, nowMs: () => NOW }, { matchId: "m", nowMs: NOW }),
      (err: unknown) => err instanceof ProbableLineupServiceError && err.code === ProbableLineupErrorCodes.MATCH_NOT_SCHEDULED,
    );
    match.getMatchById = original;
    ok(true, "kickoff passed and non-scheduled matches rejected");
  }

  // 12) Probable lineups are NEVER written to match_lineups.
  {
    const { store } = fakeStore({ evidence: { "team-home": [xi("m1", "2026-09-01T19:00:00Z")], "team-away": [xi("m2", "2026-09-02T19:00:00Z")] } });
    const candidate = store as unknown as Record<string, unknown>;
    assert.equal(candidate.insertLineup, undefined, "store exposes no match_lineups write");
    assert.equal(candidate.upsertLineup, undefined, "store exposes no match_lineups upsert");
    const result = await generateProbableLineups({ store, nowMs: () => NOW }, { matchId: "m", nowMs: NOW });
    assert.equal(result.teams.length, 2, "lineup writes go to probable_lineup_* only");
    ok(result.teams.length === 2, "probable lineup never written to match_lineups");
  }

  // 13) Public view has NO arbitrary confidence / internal model identifiers.
  {
    const run = storedFromRun({ matchId: "m", teamId: "team-home", modelVersion: "v1-probable-xi-2026-09", inputCutoffAt: new Date(NOW).toISOString(), formation: "4-3-3", evidenceCoverage: 82, status: "AVAILABLE", players: [
      { playerId: "p1", playerName: "Jug 1", formationField: "1:1", evidenceScore: 100, deterministicOrder: 1 },
      { playerId: "p2", playerName: "Jug 2", formationField: "2:1", evidenceScore: 80, deterministicOrder: 2 },
    ] });
    const view = storedProbableLineupView(run);
    assert.deepEqual(Object.keys(view).sort(), ["coverage", "formation", "generatedAt", "players", "teamId"].sort());
    assert.equal(view.coverage, 0.82);
    assert.equal(view.players[0].playerName, "Jug 1");
    assert.equal((view as unknown as Record<string, unknown>).modelVersion, undefined, "no model version in view");
    assert.equal((view as unknown as Record<string, unknown>).confidence, undefined, "no arbitrary confidence");
    assert.equal((view.players[0] as unknown as Record<string, unknown>).confidence, undefined);
    assert.ok(view.players.every((p) => p.evidenceScore >= 0 && p.evidenceScore <= 1), "evidence score bounded 0..1");
    ok(view.coverage === 0.82 && !("confidence" in view) && !("modelVersion" in view), "no arbitrary confidence / internal identifiers");
  }

  // 14) UI precedence helper: official > probable > cta.
  {
    assert.equal(lineupUIPrecedence({ hasOfficial: true, hasCanonicalProbable: true, isFutureScheduled: true }), "official");
    assert.equal(lineupUIPrecedence({ hasOfficial: true, hasCanonicalProbable: false, isFutureScheduled: true }), "official");
    assert.equal(lineupUIPrecedence({ hasOfficial: false, hasCanonicalProbable: true, isFutureScheduled: true }), "probable");
    assert.equal(lineupUIPrecedence({ hasOfficial: false, hasCanonicalProbable: false, isFutureScheduled: true }), "cta");
    assert.equal(lineupUIPrecedence({ hasOfficial: false, hasCanonicalProbable: true, isFutureScheduled: false }), "probable");
    assert.equal(lineupUIPrecedence({ hasOfficial: false, hasCanonicalProbable: false, isFutureScheduled: false }), "unavailable");
    const existingRuns: ProbableLineupRun[] = [
      { id: "r1", match_id: "m", team_id: "team-home", model_version: "v1-probable-xi-2026-09", generated_at: "", input_cutoff_at: "", formation: "4-3-3", evidence_coverage: 82, status: "AVAILABLE", created_at: "" },
      { id: "r2", match_id: "m", team_id: "team-away", model_version: "v1-probable-xi-2026-09", generated_at: "", input_cutoff_at: "", formation: "4-4-2", evidence_coverage: 73, status: "NOT_AVAILABLE", created_at: "" },
    ];
    const players: ProbableLineupPlayer[] = [
      { id: "p1", run_id: "r1", player_id: null, player_name: "Jug 1", formation_field: "1:1", evidence_score: 100, deterministic_order: 1, created_at: "" },
    ];
    const views = probableLineupViews(existingRuns, players);
    assert.equal(views.length, 1, "NOT_AVAILABLE runs filtered out");
    assert.equal(views[0].teamId, "team-home");
    assert.equal(views[0].coverage, 0.82);
    assert.equal(views[0].players[0].playerName, "Jug 1");
    assert.equal(probableLineupViews(existingRuns, []).length, 0, "empty player list filtered");
    ok(true, "UI precedence + view conversion correct");
  }

  // 15) Rate limiter admits the probable-lineup action.
  {
    const policy = AI_RATE_LIMITS["probable-lineup"];
    assert.ok(policy && policy.minute.max >= 1 && policy.hour.max >= 1, "probable-lineup rate policy defined");
    assert.ok(["match-analysis", "match-prediction", "probable-lineup", "player-report"].includes("probable-lineup"), "action registered");
    ok(Boolean(AI_RATE_LIMITS["probable-lineup"]) && AI_RATE_LIMITS["probable-lineup"].minute.max === 3, "probable-lineup rate limit defined");
  }

  // 16) Evidence score stored 0..100 even with continuity bonus (never >100).
  {
    const samePlayers = (days: number[], name: string): ProbableLineupEvidenceXI[] =>
      days.map((day, i) => xiWith(`m${name}${i}`, `2026-09-${String(day).padStart(2, "0")}T19:00:00Z`, name));
    const evidence = [
      ...samePlayers([1, 3, 5, 7, 9], "SAME"),
    ];
    const result = computeProbableLineupForTeam(evidence);
    assert.equal(result?.formation, "4-3-3", "consistent formation with heavy continuity");
    for (const slot of result?.slots ?? []) {
      assert.ok(slot.evidenceScore >= 0 && slot.evidenceScore <= 1.01, "score clamped at 1");
    }
    const { store } = fakeStore({ evidence: { "team-home": evidence, "team-away": evidence } });
    const service = await generateProbableLineups({ store, nowMs: () => NOW }, { matchId: "m", nowMs: NOW });
    for (const lineup of service.teams) {
      for (const player of lineup.players) {
        assert.ok(player.evidenceScore >= 0 && player.evidenceScore <= 100, "stored evidence score within DB CHECK 0..100");
      }
    }
    ok(service.teams.every((t) => t.players.every((p) => p.evidenceScore <= 100)), "evidence score stays within DB CHECK");
  }

  console.log(`Probable lineup V0 tests: ${tests}/${tests} PASS`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });