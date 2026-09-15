/**
 * Behavioral tests of the production backfill planner and runner.
 * All external effects are injected in-memory; no environment credentials, DB or provider is used.
 * Run: npx tsx --conditions=react-server src/lib/scripts/smoke-tests-lineup-backfill.ts
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { lineupBackfillReader } from "@/lib/db/repositories/lineup-backfill-repo";
import {
  BACKFILL_SCOPE,
  BACKFILL_SCOPE_KEY,
  BackfillError,
  backfillErrorCode,
  emptyBackfillJournal,
  fixtureIdOf,
  planLineupBackfill,
  readBackfillJournal,
  runLineupBackfill,
  type BackfillDeps,
  type BackfillJournal,
  type BackfillMatch,
  type BackfillOptions,
} from "@/lib/services/lineup-backfill-service";

const PROJECT = "https://offline-test-project.supabase.co";
const NOW = "2026-09-15T10:00:00.000Z";
const cases: Array<{ name: string; run: () => void | Promise<void> }> = [];

function test(name: string, run: () => void | Promise<void>) {
  cases.push({ name, run });
}

function match(fixtureId = 19714001, overrides: Partial<BackfillMatch> = {}): BackfillMatch {
  return {
    id: `m-soccer-sportmonks:match:${fixtureId}`,
    sport_id: "soccer",
    league_id: BACKFILL_SCOPE.leagueId,
    season_id: BACKFILL_SCOPE.seasonId,
    status: "finished",
    provider: "sportmonks",
    external_id: `sportmonks:match:${fixtureId}`,
    match_date: "2026-09-13T12:00:00.000Z",
    ...overrides,
  };
}

function plan(matches: BackfillMatch[], existing = new Set<string>(), journal = emptyBackfillJournal(PROJECT)) {
  return planLineupBackfill(matches, existing, journal);
}

function isCode(code: string) {
  return (error: unknown) => error instanceof BackfillError && error.code === code;
}

function fixtureHarness(matches: BackfillMatch[], existing = new Set<string>()) {
  const current = new Map(matches.map(value => [value.id, value]));
  const events: string[] = [];
  const logs: string[] = [];
  const snapshots: BackfillJournal[] = [];
  const calls: Array<{ matchId: string; fixtureId: number }> = [];
  const delays: number[] = [];
  const deps: BackfillDeps = {
    readMatch: async id => {
      events.push(`read:${id}`);
      return current.get(id) ?? null;
    },
    hasEnrichment: async id => {
      events.push(`existing:${id}`);
      return existing.has(id);
    },
    enrich: async (matchId, fixtureId) => {
      calls.push({ matchId, fixtureId });
      events.push(`enrich:${matchId}`);
      existing.add(matchId);
    },
    saveJournal: async journal => {
      events.push("save");
      snapshots.push(structuredClone(journal));
    },
    sleep: async ms => {
      events.push(`sleep:${ms}`);
      delays.push(ms);
    },
    now: () => NOW,
    log: line => logs.push(line),
  };
  return { current, existing, events, logs, snapshots, calls, delays, deps };
}

test("dry run is the default and has no reads, writes, delays, or journal mutation", async () => {
  const values = [match(), match(19714002, { status: "scheduled" }), match(19714003, { provider: null })];
  const journal = emptyBackfillJournal(PROJECT);
  const before = structuredClone(journal);
  const fake = fixtureHarness(values);
  const result = await runLineupBackfill(plan(values), journal, fake.deps);
  assert.deepEqual(result, { candidates: 1, attempted: 0, completed: 0, failed: 1, skipped: 1, stopped: false });
  assert.deepEqual(fake.events, []);
  assert.deepEqual(fake.calls, []);
  assert.deepEqual(fake.snapshots, []);
  assert.deepEqual(journal, before);
  assert.equal(fake.logs.filter(line => line.includes("DRY_RUN")).length, 1);
});

test("confirmation requires the literal boolean true", async () => {
  for (const confirm of [false, undefined, "true", 1]) {
    const value = match();
    const fake = fixtureHarness([value]);
    const result = await runLineupBackfill(plan([value]), emptyBackfillJournal(PROJECT), fake.deps,
      { confirm } as BackfillOptions);
    assert.equal(result.attempted, 0);
    assert.deepEqual(fake.events, []);
  }
});

test("only finished soccer fixtures in the exact league and season are eligible", () => {
  const outOfScope: Partial<BackfillMatch>[] = [
    { status: "scheduled" }, { status: "in_progress" }, { status: "cancelled" },
    { sport_id: "basketball" }, { league_id: "sportmonks-argentina-liga-profesional" },
    { season_id: "sportmonks-denmark-superliga-2025-2026" },
  ];
  for (const change of outOfScope) {
    const [entry] = plan([match(19714001, change)]);
    assert.equal(entry.action, "SKIP");
    assert.equal(entry.reason, "OUT_OF_SCOPE");
  }
  assert.equal(plan([match()])[0].action, "ENRICH");
});

test("protected fixture 19713931 cannot be retried even through an existing journal", async () => {
  const value = match(19713931);
  const journal = emptyBackfillJournal(PROJECT);
  journal.attempts[value.id] = { fixtureId: 19713931, state: "failed", attemptedAt: NOW, errorCode: "ENRICHMENT_FAILED" };
  const fake = fixtureHarness([value], new Set([value.id]));
  const entries = plan([value], fake.existing, journal);
  assert.equal(entries[0].reason, "PROTECTED_EXISTING_FIXTURE");
  const result = await runLineupBackfill(entries, journal, fake.deps, { confirm: true });
  assert.equal(result.skipped, 1);
  assert.deepEqual(fake.events, []);
  assert.equal(plan([match(19714001, { id: value.id })])[0].reason, "PROTECTED_EXISTING_FIXTURE");
});

test("any persisted enrichment presence skips an unrelated existing match", async () => {
  const value = match();
  const fake = fixtureHarness([value], new Set([value.id]));
  const entries = plan([value], fake.existing);
  assert.equal(entries[0].reason, "EXISTING_ENRICHMENT");
  const result = await runLineupBackfill(entries, emptyBackfillJournal(PROJECT), fake.deps, { confirm: true });
  assert.equal(result.skipped, 1);
  assert.deepEqual(fake.events, []);
});

test("invalid providers and internal identifiers are rejected", () => {
  for (const change of [{ provider: "other" }, { provider: null }, { id: "bad/id" }, { id: "" }, { id: "x".repeat(121) }]) {
    assert.equal(plan([match(19714001, change)])[0].action, "FAIL");
  }
});

test("fixture IDs require exact namespace, positive safe integer, and canonical digits", () => {
  const invalid = [null, "", "19714001", "sportmonks:team:19714001", "sportmonks:match:0",
    "sportmonks:match:-1", "sportmonks:match:01", "sportmonks:match:1.5", "sportmonks:match:1e7",
    "sportmonks:match:9007199254740992", " sportmonks:match:123", "sportmonks:match:123\n"];
  for (const external_id of invalid) {
    assert.equal(fixtureIdOf(match(19714001, { external_id })), null, String(external_id));
    assert.equal(plan([match(19714001, { external_id })])[0].action, "FAIL", String(external_id));
  }
  assert.equal(fixtureIdOf(match()), 19714001);
});

test("duplicate external fixture IDs fail every ambiguous candidate and make no request", async () => {
  const values = [match(), match(19714001, { id: "another-internal-match" })];
  const entries = plan(values);
  assert.deepEqual(entries.map(entry => entry.action), ["FAIL", "FAIL"]);
  const fake = fixtureHarness(values);
  const result = await runLineupBackfill(entries, emptyBackfillJournal(PROJECT), fake.deps, { confirm: true });
  assert.equal(result.failed, 2);
  assert.deepEqual(fake.events, []);
});

test("duplicate internal match IDs abort planning", () => {
  assert.throws(() => plan([match(), match(19714002, { id: match().id })]), isCode("DUPLICATE_MATCH_ID"));
});

test("candidate order is deterministic by match date then internal ID", () => {
  const late = match(19714003, { match_date: "2026-09-14T12:00:00.000Z" });
  const earlyA = match(19714001);
  const earlyB = match(19714002);
  const values = [late, earlyB, earlyA];
  const before = [...values];
  const expected = [earlyA.id, earlyB.id, late.id];
  assert.deepEqual(plan(values).map(entry => entry.match.id), expected);
  assert.deepEqual(plan([...values].reverse()).map(entry => entry.match.id), expected);
  assert.deepEqual(values, before, "planner must not reorder caller input");
});

test("confirmed processing checkpoints before each request and completes in sequence", async () => {
  const values = [match(), match(19714002), match(19714003)];
  const journal = emptyBackfillJournal(PROJECT);
  const fake = fixtureHarness(values);
  let active = 0;
  let maximumActive = 0;
  const enrich = fake.deps.enrich;
  fake.deps.enrich = async (id, fixtureId) => {
    active++;
    maximumActive = Math.max(maximumActive, active);
    try {
      assert.equal(fake.snapshots.at(-1)?.attempts[id]?.state, "in_progress");
      await Promise.resolve();
      await enrich(id, fixtureId);
      fake.events.push(`done:${id}`);
    } finally { active--; }
  };
  fake.deps.sleep = async ms => {
    assert.equal(active, 0, "delay starts only after the previous provider request finishes");
    assert.equal(fake.snapshots.at(-1)?.attempts[fake.calls.at(-1)!.matchId]?.state, "completed");
    fake.events.push(`sleep:${ms}`);
    fake.delays.push(ms);
  };
  const result = await runLineupBackfill(plan([...values].reverse()), journal, fake.deps, { confirm: true, delayMs: 1250 });
  assert.equal(maximumActive, 1);
  assert.equal(result.completed, 3);
  assert.deepEqual(fake.calls.map(call => call.fixtureId), [19714001, 19714002, 19714003]);
  assert.deepEqual(fake.delays, [1250, 1250]);
  assert.equal(fake.snapshots.length, 6);
  assert.deepEqual(fake.events, values.flatMap((value, index) => [
    ...(index ? ["sleep:1250"] : []), `read:${value.id}`, `existing:${value.id}`, "save",
    `enrich:${value.id}`, `done:${value.id}`, "save",
  ]));
});

for (const change of [
  { status: "scheduled" },
  { sport_id: "basketball" },
  { league_id: "another-league" },
  { season_id: "another-season" },
  { provider: "another-provider" },
  { external_id: "sportmonks:match:19714099" },
  { external_id: "sportmonks:match:19713931" },
] satisfies Partial<BackfillMatch>[]) {
  test(`fresh match recheck blocks changed ${Object.keys(change)[0]}=${Object.values(change)[0]}`, async () => {
    const value = match();
    const fake = fixtureHarness([value]);
    fake.current.set(value.id, { ...value, ...change });
    const result = await runLineupBackfill(plan([value]), emptyBackfillJournal(PROJECT), fake.deps, { confirm: true });
    assert.equal(result.attempted, 0);
    assert.equal(result.skipped, 1);
    assert.deepEqual(fake.calls, []);
    assert.deepEqual(fake.snapshots, []);
  });
}

test("deleted match skips and never queries its enrichment", async () => {
  const value = match();
  const fake = fixtureHarness([]);
  const result = await runLineupBackfill(plan([value]), emptyBackfillJournal(PROJECT), fake.deps, { confirm: true });
  assert.equal(result.skipped, 1);
  assert.deepEqual(fake.events, [`read:${value.id}`]);
});

test("a fresh read returning another internal ID cannot authorize the original request", async () => {
  const value = match();
  const fake = fixtureHarness([value]);
  fake.current.set(value.id, { ...value, id: "another-internal-match" });
  const result = await runLineupBackfill(plan([value]), emptyBackfillJournal(PROJECT), fake.deps, { confirm: true });
  assert.equal(result.attempted, 0);
  assert.equal(result.skipped, 1);
  assert.deepEqual(fake.calls, []);
  assert.deepEqual(fake.snapshots, []);
});

test("new enrichment discovered just before a request is skipped", async () => {
  const value = match();
  const entries = plan([value]);
  const fake = fixtureHarness([value], new Set([value.id]));
  const result = await runLineupBackfill(entries, emptyBackfillJournal(PROJECT), fake.deps, { confirm: true });
  assert.equal(result.skipped, 1);
  assert.equal(result.attempted, 0);
  assert.deepEqual(fake.snapshots, []);
  assert.deepEqual(fake.calls, []);
});

for (const method of ["readMatch", "hasEnrichment"] as const) {
  test(`${method} failure aborts before checkpoint and provider request`, async () => {
    const value = match();
    const fake = fixtureHarness([value]);
    fake.deps[method] = async () => { throw new Error("offline read failure"); };
    await assert.rejects(runLineupBackfill(plan([value]), emptyBackfillJournal(PROJECT), fake.deps, { confirm: true }));
    assert.deepEqual(fake.calls, []);
    assert.deepEqual(fake.snapshots, []);
  });
}

test("maxMatches limits provider attempts and does not delay after the final permitted attempt", async () => {
  const values = [match(), match(19714002), match(19714003)];
  const fake = fixtureHarness(values);
  const result = await runLineupBackfill(plan(values), emptyBackfillJournal(PROJECT), fake.deps,
    { confirm: true, maxMatches: 2 });
  assert.equal(result.attempted, 2);
  assert.equal(result.completed, 2);
  assert.equal(result.stopped, true);
  assert.deepEqual(fake.calls.map(call => call.fixtureId), [19714001, 19714002]);
  assert.deepEqual(fake.delays, [2000]);
});

test("recheck skips do not consume the attempt budget", async () => {
  const values = [match(), match(19714002), match(19714003)];
  const fake = fixtureHarness(values, new Set([values[0].id]));
  const result = await runLineupBackfill(plan(values), emptyBackfillJournal(PROJECT), fake.deps,
    { confirm: true, maxMatches: 1 });
  assert.equal(result.skipped, 1);
  assert.equal(result.attempted, 1);
  assert.deepEqual(fake.calls.map(call => call.fixtureId), [19714002]);
  assert.deepEqual(fake.delays, []);
});

test("invalid delay and batch limits fail before any side effect", async () => {
  const invalid: BackfillOptions[] = [
    { delayMs: 999 }, { delayMs: 60001 }, { delayMs: 1000.5 }, { delayMs: NaN },
    { maxMatches: 0 }, { maxMatches: -1 }, { maxMatches: 1.5 }, { maxMatches: Infinity },
  ];
  for (const options of invalid) {
    const fake = fixtureHarness([match()]);
    await assert.rejects(runLineupBackfill(plan([match()]), emptyBackfillJournal(PROJECT), fake.deps,
      { confirm: true, ...options }), isCode("INVALID_OPTIONS"));
    assert.deepEqual(fake.events, []);
    assert.deepEqual(fake.logs, []);
  }
});

test("generic provider failure is checkpointed and the next candidate can proceed", async () => {
  const values = [match(), match(19714002)];
  const fake = fixtureHarness(values);
  const journal = emptyBackfillJournal(PROJECT);
  const enrich = fake.deps.enrich;
  fake.deps.enrich = async (id, fixtureId) => {
    await enrich(id, fixtureId);
    if (id === values[0].id) throw new Error("provider 500");
  };
  const result = await runLineupBackfill(plan(values), journal, fake.deps, { confirm: true });
  assert.equal(result.attempted, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.completed, 1);
  assert.equal(result.stopped, false);
  assert.equal(journal.attempts[values[0].id].state, "failed");
  assert.equal(journal.attempts[values[0].id].errorCode, "ENRICHMENT_FAILED");
  assert.equal(fake.snapshots[1].attempts[values[0].id].state, "failed");
});

for (const [message, code] of [["HTTP 429", "RATE_LIMIT"], ["rate limit exceeded", "RATE_LIMIT"],
  ["HTTP 401", "ACCESS_DENIED"], ["HTTP 403", "ACCESS_DENIED"]] as const) {
  test(`${message} checkpoints failure and stops before the next request`, async () => {
    const values = [match(), match(19714002)];
    const fake = fixtureHarness(values);
    const journal = emptyBackfillJournal(PROJECT);
    fake.deps.enrich = async (matchId, fixtureId) => {
      fake.calls.push({ matchId, fixtureId });
      throw new Error(message);
    };
    const result = await runLineupBackfill(plan(values), journal, fake.deps, { confirm: true });
    assert.equal(result.attempted, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.completed, 0);
    assert.equal(result.stopped, true);
    assert.equal(journal.attempts[values[0].id].errorCode, code);
    assert.equal(fake.snapshots[1].attempts[values[0].id].state, "failed");
    assert.deepEqual(fake.delays, []);
    assert.equal(fake.calls.length, 1);
  });
}

test("a failed attempt can reconcile its own partial rows while unrelated existing data is skipped", async () => {
  const failed = match();
  const unrelated = match(19714002);
  const fake = fixtureHarness([failed, unrelated], new Set([unrelated.id]));
  const journal = emptyBackfillJournal(PROJECT);
  const enrich = fake.deps.enrich;
  fake.deps.enrich = async (id, fixtureId) => {
    await enrich(id, fixtureId); // Simulate a partial persistence followed by a failure.
    throw new Error("partial persistence failure");
  };
  const first = await runLineupBackfill(plan([failed, unrelated], fake.existing, journal), journal, fake.deps, { confirm: true });
  assert.equal(first.failed, 1);
  assert.equal(fake.existing.has(failed.id), true);
  const restored = readBackfillJournal(structuredClone(fake.snapshots.at(-1)), PROJECT);
  const retryPlan = plan([failed, unrelated], fake.existing, restored);
  assert.equal(retryPlan.find(entry => entry.match.id === failed.id)?.reason, "RESUME_INTERRUPTED_ATTEMPT");
  assert.equal(retryPlan.find(entry => entry.match.id === unrelated.id)?.reason, "EXISTING_ENRICHMENT");
  fake.deps.enrich = enrich;
  const retry = await runLineupBackfill(retryPlan, restored, fake.deps, { confirm: true });
  assert.equal(retry.completed, 1);
  assert.equal(retry.skipped, 1);
  assert.deepEqual(fake.calls.map(call => call.matchId), [failed.id, failed.id]);
  assert.equal(restored.attempts[failed.id].state, "completed");
  assert.equal(restored.attempts[failed.id].errorCode, undefined);
});

test("a persisted in-progress attempt resumes after interruption even when partial data exists", async () => {
  const value = match();
  const journal = emptyBackfillJournal(PROJECT);
  journal.attempts[value.id] = { fixtureId: 19714001, state: "in_progress", attemptedAt: NOW };
  const restored = readBackfillJournal(structuredClone(journal), PROJECT);
  const fake = fixtureHarness([value], new Set([value.id]));
  const result = await runLineupBackfill(plan([value], fake.existing, restored), restored, fake.deps, { confirm: true });
  assert.equal(result.completed, 1);
  assert.equal(fake.calls.length, 1);
});

test("a completed checkpoint makes reruns idempotent even without stored enrichment rows", async () => {
  const value = match();
  const journal = emptyBackfillJournal(PROJECT);
  const first = fixtureHarness([value]);
  await runLineupBackfill(plan([value]), journal, first.deps, { confirm: true });
  const restored = readBackfillJournal(structuredClone(first.snapshots.at(-1)), PROJECT);
  const rerun = fixtureHarness([value]);
  const entries = plan([value], new Set(), restored);
  assert.equal(entries[0].reason, "CHECKPOINT_COMPLETED");
  const result = await runLineupBackfill(entries, restored, rerun.deps, { confirm: true });
  assert.equal(result.attempted, 0);
  assert.equal(result.skipped, 1);
  assert.deepEqual(rerun.events, []);
});

test("a checkpoint fixture-ID mismatch cannot authorize a retry", async () => {
  const value = match();
  const journal = emptyBackfillJournal(PROJECT);
  journal.attempts[value.id] = { fixtureId: 19714999, state: "in_progress", attemptedAt: NOW };
  const fake = fixtureHarness([value]);
  const entries = plan([value], new Set(), journal);
  assert.equal(entries[0].action, "FAIL");
  assert.equal(entries[0].reason, "CHECKPOINT_ID_MISMATCH");
  const result = await runLineupBackfill(entries, journal, fake.deps, { confirm: true });
  assert.equal(result.failed, 1);
  assert.deepEqual(fake.events, []);
});

test("initial checkpoint failure prevents a provider request", async () => {
  const value = match();
  const fake = fixtureHarness([value]);
  fake.deps.saveJournal = async () => { throw new Error("checkpoint unavailable"); };
  await assert.rejects(runLineupBackfill(plan([value]), emptyBackfillJournal(PROJECT), fake.deps, { confirm: true }));
  assert.deepEqual(fake.calls, []);
  assert.equal(fake.logs.some(line => line.includes("COMPLETED")), false);
});

test("completion checkpoint failure never reports success and leaves a resumable persisted attempt", async () => {
  const value = match();
  const fake = fixtureHarness([value]);
  const save = fake.deps.saveJournal;
  let saves = 0;
  fake.deps.saveJournal = async journal => {
    if (++saves === 2) throw new Error("completion checkpoint unavailable");
    await save(journal);
  };
  await assert.rejects(runLineupBackfill(plan([value]), emptyBackfillJournal(PROJECT), fake.deps, { confirm: true }));
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.logs.some(line => line.includes("COMPLETED")), false);
  assert.equal(fake.snapshots.length, 1);
  const restored = readBackfillJournal(fake.snapshots[0], PROJECT);
  assert.equal(restored.attempts[value.id].state, "in_progress");
  assert.equal(plan([value], fake.existing, restored)[0].reason, "RESUME_INTERRUPTED_ATTEMPT");
});

test("failure checkpoint errors abort before the next provider request", async () => {
  const values = [match(), match(19714002)];
  const fake = fixtureHarness(values);
  let saves = 0;
  fake.deps.enrich = async (matchId, fixtureId) => {
    fake.calls.push({ matchId, fixtureId });
    throw new Error("provider failed");
  };
  fake.deps.saveJournal = async () => { if (++saves === 2) throw new Error("cannot checkpoint failure"); };
  await assert.rejects(runLineupBackfill(plan(values), emptyBackfillJournal(PROJECT), fake.deps, { confirm: true }));
  assert.equal(fake.calls.length, 1);
  assert.deepEqual(fake.delays, []);
  assert.equal(fake.logs.some(line => line.includes("COMPLETED")), false);
});

test("a stop signal before starting causes no external effects", async () => {
  const value = match();
  const fake = fixtureHarness([value]);
  fake.deps.shouldStop = () => true;
  const result = await runLineupBackfill(plan([value]), emptyBackfillJournal(PROJECT), fake.deps, { confirm: true });
  assert.equal(result.stopped, true);
  assert.equal(result.attempted, 0);
  assert.deepEqual(fake.events, []);
});

test("a stop signal during the inter-request delay prevents the next request", async () => {
  const values = [match(), match(19714002)];
  const fake = fixtureHarness(values);
  let stopped = false;
  fake.deps.shouldStop = () => stopped;
  fake.deps.sleep = async () => { stopped = true; };
  const result = await runLineupBackfill(plan(values), emptyBackfillJournal(PROJECT), fake.deps, { confirm: true });
  assert.equal(result.stopped, true);
  assert.equal(result.completed, 1);
  assert.equal(fake.calls.length, 1);
});

test("provider errors are reduced to safe codes in logs and checkpoints", async () => {
  const value = match();
  const fake = fixtureHarness([value]);
  const secret = "SECRET_SENTINEL_DO_NOT_LOG";
  fake.deps.enrich = async () => {
    throw new Error(`GET https://example.invalid/fixtures?api_token=${secret}\nAuthorization: Bearer ${secret}`);
  };
  await runLineupBackfill(plan([value]), emptyBackfillJournal(PROJECT), fake.deps, { confirm: true });
  assert.match(fake.logs.join("\n"), /FAIL ENRICHMENT_FAILED/);
  const emitted = JSON.stringify({ logs: fake.logs, checkpoints: fake.snapshots });
  assert.equal(emitted.includes(secret), false);
  assert.equal(emitted.includes("api_token"), false);
  assert.equal(emitted.includes("Authorization"), false);
});

test("invalid external IDs cannot inject raw text into logs", async () => {
  const value = match(19714001, { id: "invalid\nSECRET_SENTINEL", external_id: "https://example.invalid?api_token=SECRET_SENTINEL" });
  const fake = fixtureHarness([value]);
  await runLineupBackfill(plan([value]), emptyBackfillJournal(PROJECT), fake.deps);
  assert.deepEqual(fake.logs, ["fixture=invalid FAIL INVALID_PROVIDER_OR_ID"]);
});

test("non-Error provider failures still have a fixed safe classification", () => {
  assert.equal(backfillErrorCode({ token: "PRIVATE" }), "ENRICHMENT_FAILED");
  assert.equal(backfillErrorCode(null), "ENRICHMENT_FAILED");
  assert.equal(backfillErrorCode(new Error("429 rate limited")), "RATE_LIMIT");
  assert.equal(backfillErrorCode(new Error("403 forbidden")), "ACCESS_DENIED");
});

test("a valid checkpoint round-trips with the expected scope and project", () => {
  const journal = emptyBackfillJournal(PROJECT);
  assert.equal(journal.scope, BACKFILL_SCOPE_KEY);
  journal.attempts[match().id] = { fixtureId: 19714001, state: "completed", attemptedAt: NOW, finishedAt: NOW };
  assert.deepEqual(readBackfillJournal(JSON.parse(JSON.stringify(journal)), PROJECT), journal);
});

test("checkpoint validation rejects wrong project, scope, version, and unknown top-level data", () => {
  const valid = emptyBackfillJournal(PROJECT);
  const invalid: unknown[] = [null, [], {}, { ...valid, project: "https://other-project.supabase.co" },
    { ...valid, scope: "another/season/finished" }, { ...valid, version: 2 }, { ...valid, token: "PRIVATE" },
    { ...valid, attempts: null }];
  for (const value of invalid) assert.throws(() => readBackfillJournal(value, PROJECT), isCode("INVALID_CHECKPOINT"));
});

test("checkpoint validation rejects invalid attempts and internal entity IDs", () => {
  const valid = emptyBackfillJournal(PROJECT);
  const attempt = { fixtureId: 19714001, state: "in_progress", attemptedAt: NOW };
  const invalid: unknown[] = [
    { ...valid, attempts: { "bad/id": attempt } },
    { ...valid, attempts: { [match().id]: { ...attempt, fixtureId: -1 } } },
    { ...valid, attempts: { [match().id]: { ...attempt, fixtureId: 1.1 } } },
    { ...valid, attempts: { [match().id]: { ...attempt, fixtureId: Number.MAX_SAFE_INTEGER + 1 } } },
    { ...valid, attempts: { [match().id]: { ...attempt, state: "unknown" } } },
    { ...valid, attempts: { [match().id]: { ...attempt, attemptedAt: "yesterday" } } },
    { ...valid, attempts: { [match().id]: { ...attempt, errorCode: "PRIVATE_TOKEN" } } },
    { ...valid, attempts: { [match().id]: { ...attempt, rawError: "PRIVATE_TOKEN" } } },
  ];
  for (const value of invalid) assert.throws(() => readBackfillJournal(value, PROJECT), isCode("INVALID_CHECKPOINT"));
});

type ReadRequest = { url: URL; method: string };
const READER_ORIGIN = "https://lineup-reader-tests.invalid";
const PRESENCE_TABLES = ["match_metadata", "match_statistics", "match_events", "match_lineups"] as const;

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

/** Use the production Supabase query builder; intercept every HTTP request before any network. */
function readerHarness(respond: (request: ReadRequest) => Response) {
  const requests: ReadRequest[] = [];
  const client = createClient(READER_ORIGIN, "offline-test-key-not-a-real-credential", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const request = {
        url: new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url),
        method: init?.method ?? (input instanceof Request ? input.method : "GET"),
      };
      requests.push(request);
      assert.equal(request.url.origin, READER_ORIGIN);
      assert.equal(request.method, "GET", "reader must not perform mutations");
      assert.equal(request.url.pathname.startsWith("/rest/v1/"), true);
      return respond(request);
    } },
  });
  return { reader: lineupBackfillReader(client), requests };
}

test("reader paginates finished fixtures with exact scope filters and stable order on every page", async () => {
  const values = Array.from({ length: 1001 }, (_, index) => match(19715000 + index));
  const fake = readerHarness(({ url }) => {
    const offset = Number(url.searchParams.get("offset"));
    const limit = Number(url.searchParams.get("limit"));
    return jsonResponse(values.slice(offset, offset + limit));
  });
  assert.deepEqual(await fake.reader.readFinished(), values);
  assert.deepEqual(fake.requests.map(({ url }) => url.searchParams.get("offset")), ["0", "500", "1000"]);
  for (const { url } of fake.requests) {
    assert.equal(url.pathname, "/rest/v1/matches");
    assert.equal(url.searchParams.get("sport_id"), "eq.soccer");
    assert.equal(url.searchParams.get("league_id"), `eq.${BACKFILL_SCOPE.leagueId}`);
    assert.equal(url.searchParams.get("season_id"), `eq.${BACKFILL_SCOPE.seasonId}`);
    assert.equal(url.searchParams.get("status"), "eq.finished");
    assert.equal(url.searchParams.get("order"), "match_date.asc,id.asc");
    assert.equal(url.searchParams.get("limit"), "500");
    assert.equal(url.searchParams.get("select"), "id,sport_id,league_id,season_id,status,provider,external_id,match_date");
  }
});

test("reader discovers presence beyond 1000 rows in all four enrichment tables", async () => {
  const shared = match().id;
  const lateIds = PRESENCE_TABLES.map((_, index) => match(19714010 + index).id);
  const ids = [shared, ...lateIds];
  const rows = new Map(PRESENCE_TABLES.map((table, index) => [table,
    [...Array.from({ length: 1000 }, () => ({ match_id: shared })), { match_id: lateIds[index] }],
  ]));
  const fake = readerHarness(({ url }) => {
    const table = url.pathname.split("/").at(-1) as typeof PRESENCE_TABLES[number];
    const offset = Number(url.searchParams.get("offset"));
    const limit = Number(url.searchParams.get("limit"));
    return jsonResponse(rows.get(table)!.slice(offset, offset + limit));
  });
  assert.deepEqual(await fake.reader.readPresence(ids), new Set(ids));
  assert.equal(fake.requests.length, 12);
  for (const table of PRESENCE_TABLES) {
    const requests = fake.requests.filter(({ url }) => url.pathname === `/rest/v1/${table}`);
    assert.deepEqual(requests.map(({ url }) => url.searchParams.get("offset")), ["0", "500", "1000"]);
    for (const { url } of requests) {
      assert.equal(url.searchParams.get("select"), "match_id");
      assert.equal(url.searchParams.get("match_id"), `in.(${ids.join(",")})`);
      assert.equal(url.searchParams.get("limit"), "500");
      assert.equal(url.searchParams.get("order"), table === "match_metadata" ? "match_id.asc" : "id.asc");
    }
  }
});

test("reader batches presence IDs in groups of 50 and queries every table for each batch", async () => {
  const ids = Array.from({ length: 51 }, (_, index) => match(19715000 + index).id);
  const fake = readerHarness(() => jsonResponse([]));
  assert.deepEqual(await fake.reader.readPresence(ids), new Set());
  assert.equal(fake.requests.length, 8);
  for (const table of PRESENCE_TABLES) {
    const requests = fake.requests.filter(({ url }) => url.pathname === `/rest/v1/${table}`);
    assert.deepEqual(requests.map(({ url }) => url.searchParams.get("match_id")), [
      `in.(${ids.slice(0, 50).join(",")})`, `in.(${ids[50]})`,
    ]);
  }
});

test("reader makes no requests for an empty presence list", async () => {
  const fake = readerHarness(() => { throw new Error("empty read unexpectedly used transport"); });
  assert.deepEqual(await fake.reader.readPresence([]), new Set());
  assert.deepEqual(fake.requests, []);
});

test("hasEnrichment recognizes metadata-only presence and distinguishes an absent match", async () => {
  const value = match();
  let exists = true;
  const fake = readerHarness(({ url }) => jsonResponse(
    exists && url.pathname.endsWith("/match_metadata") ? [{ match_id: value.id }] : [],
  ));
  assert.equal(await fake.reader.hasEnrichment(value.id), true);
  exists = false;
  assert.equal(await fake.reader.hasEnrichment(value.id), false);
  assert.equal(fake.requests.length, 8);
  assert.equal(fake.requests.every(({ url }) => url.searchParams.get("match_id") === `in.(${value.id})`), true);
});

test("reader fetches an exact internal match ID and returns null when it no longer exists", async () => {
  const value = match();
  let exists = true;
  const fake = readerHarness(() => jsonResponse(exists ? [value] : []));
  assert.deepEqual(await fake.reader.readMatch(value.id), value);
  exists = false;
  assert.equal(await fake.reader.readMatch(value.id), null);
  assert.equal(fake.requests.length, 2);
  for (const { url } of fake.requests) {
    assert.equal(url.pathname, "/rest/v1/matches");
    assert.equal(url.searchParams.get("id"), `eq.${value.id}`);
  }
});

test("finished-reader DB errors reject with a safe code rather than a partial page result", async () => {
  const values = Array.from({ length: 500 }, (_, index) => match(19715000 + index));
  const fake = readerHarness(({ url }) => url.searchParams.get("offset") === "0"
    ? jsonResponse(values)
    : jsonResponse({ message: "PRIVATE_DATABASE_ERROR", code: "42501" }, 403));
  await assert.rejects(fake.reader.readFinished(), isCode("DB_READ_FAILED"));
  assert.equal(fake.requests.length, 2);
});

for (const table of PRESENCE_TABLES) {
  test(`presence-reader ${table} errors reject instead of implying enrichment is absent`, async () => {
    const fake = readerHarness(({ url }) => url.pathname === `/rest/v1/${table}`
      ? jsonResponse({ message: "PRIVATE_DATABASE_ERROR", code: "42501" }, 403)
      : jsonResponse([]));
    await assert.rejects(fake.reader.readPresence([match().id]), isCode("DB_ENRICHMENT_READ_FAILED"));
  });
}

test("single-match reader errors reject rather than returning null", async () => {
  const fake = readerHarness(() => jsonResponse({ message: "PRIVATE_DATABASE_ERROR", code: "42501" }, 403));
  await assert.rejects(fake.reader.readMatch(match().id), isCode("DB_READ_FAILED"));
});

test("reader rejects malformed finished match rows at runtime", async () => {
  const fake = readerHarness(() => jsonResponse([{ ...match(), external_id: 19714001 }]));
  await assert.rejects(fake.reader.readFinished(), isCode("INVALID_DB_MATCH_ROWS"));
});

test("reader rejects malformed presence rows at runtime", async () => {
  const fake = readerHarness(() => jsonResponse([{ match_id: 19714001 }]));
  await assert.rejects(fake.reader.readPresence([match().id]), isCode("INVALID_DB_ENRICHMENT_ROWS"));
});

test("reader rejects malformed single-match rows at runtime", async () => {
  const fake = readerHarness(() => jsonResponse([{ ...match(), league_id: null }]));
  await assert.rejects(fake.reader.readMatch(match().id), isCode("INVALID_DB_MATCH_ROW"));
});

async function main() {
  let passed = 0;
  let failed = 0;
  for (const entry of cases) {
    try {
      await entry.run();
      console.log(`[PASS] ${entry.name}`);
      passed++;
    } catch (error) {
      console.error(`[FAIL] ${entry.name}`, error);
      failed++;
    }
  }
  console.log(`Lineup backfill: ${passed}/${cases.length} cases passed; ${failed} failed.`);
  assert.equal(failed, 0, "Lineup backfill behavioral tests failed");
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
