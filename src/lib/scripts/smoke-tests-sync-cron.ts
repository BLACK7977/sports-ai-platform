/**
 * Smoke tests para el cron route de sync Sportmonks (mockeado, sin llamadas
 * reales a Sportmonks ni escrituras a la DB).
 *
 * Tests:
 *  A. CRON_SECRET ausente -> deny (fail closed, 401, sin runSync)
 *  B. Bearer token incorrecto -> deny (401, sin runSync)
 *  C. Bearer token correcto -> allowed (200, runSync una vez)
 *  D. autenticación ocurre antes de provider/DB (spy: 0 llamadas si no autoriza)
 *  E. tablas protegidas fuera del path de sync (SYNC_WRITE_TABLES ∩ PROTECTED_TABLES = ∅)
 *  F. la respuesta no expone el secreto ni payloads del proveedor
 *  G. esquema no-Bearer -> deny
 *  H. guard de solapamiento -> 409 mientras una corrida está activa
 *  I. compactSyncOutcome: errors=0 -> ok, errors>0 -> ok=false
 *
 * Run: npm run smoke:sync-cron
 */
import { loadEnvConfig } from "@next/env";
import {
  authorizeCronRequest,
  createSyncSportmonksController,
  type CompactSyncResult,
} from "@/lib/api/sync-sportmonks-controller";
import {
  compactSyncOutcome,
  PROTECTED_TABLES,
  SYNC_WRITE_TABLES,
  type SportmonksSyncOutcome,
} from "@/lib/services/sportmonks-sync-service";

loadEnvConfig(process.cwd(), true);

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

const SECRET = "nyvorx-cron-s3cret-beta-01";
const GOOD_RESULT: CompactSyncResult = {
  ok: true,
  fetched: 132,
  insertedMatches: 0,
  updatedMatches: 5,
  insertedPlayers: 0,
  updatedPlayers: 0,
  errors: 0,
};

function makeRequest(authorization?: string): Request {
  return new Request("https://nyvorx.vercel.app/api/admin/sync-sportmonks", {
    method: "GET",
    headers: authorization ? { authorization } : {},
  });
}

async function runTests(): Promise<void> {
  // A. Missing CRON_SECRET -> deny (direct + controller)
  check("A0: authorizeCronRequest(undefined) false", authorizeCronRequest(makeRequest(`Bearer ${SECRET}`), undefined) === false);
  check("A1: authorizeCronRequest(empty) false", authorizeCronRequest(makeRequest(`Bearer ${SECRET}`), "") === false);

  let calls = 0;
  const recorder = () => {
    calls++;
    return Promise.resolve(GOOD_RESULT);
  };
  const noSecret = createSyncSportmonksController({ getCronSecret: () => undefined, runSync: recorder });
  const a401 = await noSecret.GET(makeRequest(`Bearer ${SECRET}`));
  check("A2: missing secret -> 401", a401.status === 401, `status=${a401.status}`);
  check("A3: runSync not called (missing secret)", calls === 0, `calls=${calls}`);

  // B. Wrong Bearer token
  const wrongSecret = createSyncSportmonksController({ getCronSecret: () => SECRET, runSync: recorder });
  const b401 = await wrongSecret.GET(makeRequest(`Bearer not-the-secret`));
  const b401Low = await wrongSecret.GET(makeRequest(`Token ${SECRET}`));
  check("B1: wrong bearer -> 401", b401.status === 401, `status=${b401.status}`);
  check("B2: wrong scheme header -> 401", b401Low.status === 401, `status=${b401Low.status}`);
  check("B3: runSync not called (wrong token)", calls === 0, `calls=${calls}`);

  // G. Non-Bearer scheme
  check("G1: 'Basic' scheme denied", authorizeCronRequest(makeRequest(`Basic ${SECRET}`), SECRET) === false);
  check("G2: bare token no scheme denied", authorizeCronRequest(makeRequest(SECRET), SECRET) === false);

  // C. Correct token -> allowed
  const ok = createSyncSportmonksController({ getCronSecret: () => SECRET, runSync: recorder });
  const c = await ok.GET(makeRequest(`Bearer ${SECRET}`));
  check("C1: correct bearer -> 200", c.status === 200, `status=${c.status}`);
  const body = (await c.json()) as CompactSyncResult;
  check("C2: runSync called exactly once", calls === 1, `calls=${calls}`);
  check("C3: ok echoed", body.ok === true && body.fetched === 132 && body.errors === 0, JSON.stringify(body));
  check("C4: response has only compact keys", JSON.stringify(Object.keys(body).sort()) === JSON.stringify(["errors", "fetched", "insertedMatches", "insertedPlayers", "ok", "updatedMatches", "updatedPlayers"]), JSON.stringify(Object.keys(body)));

  // D. Auth before provider/DB work (spy never fired on unauthorized)
  const dCalls = () => calls;
  check("D1: zero runSync invocations across all unauthorized attempts", dCalls() === 1, `calls=${dCalls()} (only the authorized C1)`);

  // F. Response never exposes the secret
  const fBody401 = JSON.stringify(await a401.clone().json());
  check("F1: 401 body does not contain secret", fBody401.indexOf(SECRET) === -1, fBody401);
  const fBody200 = JSON.stringify(body);
  check("F2: 200 body does not contain secret", fBody200.indexOf(SECRET) === -1, fBody200);
  check("F3: 200 body exposes no provider payload (teams/standings/statuses)", !fBody200.includes("standings") && !fBody200.includes("fixtureWindows") && !fBody200.includes("shortCode"), fBody200.slice(0, 120));

  // H. Concurrency guard -> 409 while in-flight
  let release: (r: CompactSyncResult) => void = () => undefined;
  const gate = new Promise<CompactSyncResult>((resolve) => { release = resolve; });
  let inflightCalls = 0;
  const concurrency = createSyncSportmonksController({
    getCronSecret: () => SECRET,
    runSync: () => {
      inflightCalls++;
      return gate;
    },
  });
  const first = concurrency.GET(makeRequest(`Bearer ${SECRET}`));
  const second = await concurrency.GET(makeRequest(`Bearer ${SECRET}`));
  check("H1: second concurrent run -> 409", second.status === 409, `status=${second.status}`);
  release(GOOD_RESULT);
  const firstResult = await first;
  check("H2: first run completes 200 after release", firstResult.status === 200, `status=${firstResult.status}`);
  check("H3: in-flight guard counted 1 run", inflightCalls === 1, `calls=${inflightCalls}`);

  // E. Protected tables not part of sync path
  const overlapping = SYNC_WRITE_TABLES.filter((t) => (PROTECTED_TABLES as readonly string[]).includes(t));
  check("E1: SYNC_WRITE_TABLES disjoint from PROTECTED_TABLES", overlapping.length === 0, overlapping.join(","));
  const requiredProtected = ["predictions", "prediction_evaluations", "prediction_explanations", "probable_lineup_runs", "match_lineups"];
  check("E2: protected set covers the 5 required tables", requiredProtected.every((t) => (PROTECTED_TABLES as readonly string[]).includes(t)));
  check("E3: sync write scope includes matches/teams/players/sports", ["sports", "matches", "teams", "players"].every((t) => (SYNC_WRITE_TABLES as readonly string[]).includes(t)));

  // I. compactSyncOutcome mapping
  const okOutcome = { mode: "CONFIRM" as const, summary: { mode: "CONFIRM" as const, errors: [] } as unknown, result: { fetched: 1, insertedMatches: 0, updatedMatches: 1, insertedTeams: 0, updatedTeams: 0, insertedPlayers: 0, updatedPlayers: 0, insertedStats: 0, updatedStats: 0, errors: 0 } };
  const failOutcome = { ...okOutcome, result: { ...(okOutcome.result as object), errors: 2 } };
  check("I1: errors=0 -> ok", compactSyncOutcome(okOutcome as unknown as SportmonksSyncOutcome).ok === true);
  check("I2: errors=2 -> ok=false", compactSyncOutcome(failOutcome as unknown as SportmonksSyncOutcome).ok === false);

  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});