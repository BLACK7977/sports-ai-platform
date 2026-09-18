import { InMemoryStore, type Tables } from "@/lib/db/in-memory-store";

/**
 * Offline `.or()` parity smoke: validates that the in-memory store implements
 * the PostgREST `or(...)` filter the same way the cloud wrapper delegates it.
 * Regression guard for `db.from(...).or is not a function` in offline mode.
 */

let passed = 0;
let failed = 0;

function ok(label: string): void {
  passed++;
  console.log(`[PASS] ${label}`);
}

function bad(label: string, detail?: unknown): void {
  failed++;
  console.log(`[FAIL] ${label}${detail === undefined ? "" : ` :: ${String(detail)}`}`);
}

const NOW = "2026-01-01T00:00:00.000Z";

function reset(): void {
  InMemoryStore.reset();
}

function seed(): void {
  const base: Array<Pick<Tables["matches"], "id" | "league_id" | "season_id" | "home_team_id" | "away_team_id" | "sport_id" | "status" | "match_date">> = [
    { id: "m-a", league_id: "L1", season_id: "S1", home_team_id: "HOME", away_team_id: "AWAY", sport_id: "soccer", status: "scheduled", match_date: "2026-01-10T00:00:00.000Z" },
    { id: "m-b", league_id: "L1", season_id: "S1", home_team_id: "OTH", away_team_id: "HOME", sport_id: "soccer", status: "finished", match_date: "2026-01-05T00:00:00.000Z" },
    { id: "m-c", league_id: "L2", season_id: "S1", home_team_id: "ZED", away_team_id: "YAK", sport_id: "soccer", status: "scheduled", match_date: "2026-01-12T00:00:00.000Z" },
    { id: "m-d", league_id: "L2", season_id: "S2", home_team_id: "QRS", away_team_id: "TUV", sport_id: "soccer", status: "scheduled", match_date: "2026-02-01T00:00:00.000Z" },
    { id: "m-e", league_id: "L2", season_id: "S2", home_team_id: "NUM", away_team_id: "LOW", sport_id: "soccer", status: "finished", match_date: "2026-02-02T00:00:00.000Z" },
  ];
  for (const m of base) {
    InMemoryStore.upsert("matches", {
      ...m,
      home_score: m.status === "finished" ? 1 : null,
      away_score: null,
      created_at: NOW,
      updated_at: NOW,
    } as never);
  }
}

async function run(): Promise<void> {
  reset();
  seed();

  // 1) Multi-clause OR (matches-repo getMatchesByTeamId shape)
  {
    const { data } = await InMemoryStore.from("matches")
      .or("home_team_id.eq.HOME,away_team_id.eq.HOME")
      .select();
    const ids = (data ?? []).map((m) => m.id).sort();
    if (ids.join(",") === "m-a,m-b") ok("or: home_team_id.eq.X,away_team_id.eq.X returns both roles");
    else bad("or: team-id OR shape", ids);
  }

  // 2) AND groups (matches-repo getMatchesByLeagueSeasons shape)
  {
    const { data } = await InMemoryStore.from("matches")
      .or("and(league_id.eq.L1,season_id.eq.S1),and(league_id.eq.L2,season_id.eq.S2)")
      .select();
    const ids = (data ?? []).map((m) => m.id).sort();
    if (ids.join(",") === "m-a,m-b,m-d,m-e") ok("or: and() groups joined by comma");
    else bad("or: and() groups", ids);
  }

  // 3) AND group requires BOTH conditions (league AND season must match)
  {
    const { data } = await InMemoryStore.from("matches")
      .or("and(league_id.eq.L1,season_id.eq.S9)")
      .select();
    if ((data ?? []).length === 0) ok("or: and() group is conjunctive");
    else bad("or: and() group is conjunctive", (data ?? []).map((m) => m.id));
  }

  // 4) Mixed with eq chaining (and() AND eq)
  {
    const { data } = await InMemoryStore.from("matches")
      .eq("sport_id", "soccer")
      .or("and(league_id.eq.L2,season_id.eq.S2)")
      .eq("status", "finished")
      .select();
    const ids = (data ?? []).map((m) => m.id).sort();
    if (ids.join(",") === "m-e") ok("or: composes with eq chain");
    else bad("or: composes with eq chain", ids);
  }

  // 5) neq
  {
    const { data } = await InMemoryStore.from("matches")
      .or("status.neq.finished")
      .select();
    const ids = (data ?? []).map((m) => m.id).sort();
    if (ids.join(",") === "m-a,m-c,m-d") ok("or: neq operator");
    else bad("or: neq operator", ids);
  }

  // 6) Date comparison (gte) on ISO match_date
  {
    const { data } = await InMemoryStore.from("matches")
      .or("match_date.gte.2026-02-01T00:00:00.000Z")
      .select();
    const ids = (data ?? []).map((m) => m.id).sort();
    if (ids.join(",") === "m-d,m-e") ok("or: gte ISO comparison");
    else bad("or: gte ISO comparison", ids);
  }

  // 7) Empty result when nothing matches
  {
    const { data } = await InMemoryStore.from("matches")
      .or("home_team_id.eq.DOESNOTEXIST,away_team_id.eq.DOESNOTEXIST")
      .select();
    if ((data ?? []).length === 0) ok("or: empty result set");
    else bad("or: empty result set", (data ?? []).length);
  }

  // 8) Unknown operator token is ignored (returns no rows, never throws)
  {
    const { data, error } = await InMemoryStore.from("matches")
      .or("home_team_id.eq.HOME,lol.ful.home")
      .select();
    const ids = (data ?? []).map((m) => m.id).sort();
    if (error === null && ids.join(",") === "m-a") ok("or: unknown token ignored without error");
    else bad("or: unknown token ignored", ids);
  }

  // 9) Quoted value
  {
    const { data } = await InMemoryStore.from("matches")
      .or('home_team_id.eq."HOME"')
      .select();
    if ((data ?? []).length === 1) ok("or: quoted value handling");
    else bad("or: quoted value handling", (data ?? []).map((m) => m.id));
  }

  // 10) Integration: composes with order()
  {
    const { data } = await InMemoryStore.from("matches")
      .or("home_team_id.eq.HOME,away_team_id.eq.HOME")
      .order("match_date", "desc")
      .select();
    const ids = (data ?? []).map((m) => m.id);
    if (ids.join(",") === "m-a,m-b") ok("or: composes with order()");
    else bad("or: composes with order()", ids);
  }

  reset();
}

run()
  .then(() => {
    console.log(`\n[SUMMARY] offline or() parity smoke: ${passed} passed, ${failed} failed`);
    console.log(`RESULTADO FINAL OFFLINE-OR: ${failed === 0 ? "TODOS LOS TESTS PASARON ✅" : `${failed} FALLARON ❌`}`);
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error("[FATAL] offline or() parity smoke crashed:", err);
    process.exit(1);
  });