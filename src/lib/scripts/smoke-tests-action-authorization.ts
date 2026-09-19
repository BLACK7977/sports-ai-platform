import fs from "node:fs";
import {
  resolveActionAccess,
  type SessionAuthClient,
} from "@/lib/auth/session";
import {
  runGenerateUpcomingPrediction,
  runGenerateProbableLineup,
  runGeneratePredictionExplanation,
  AUTH_REQUIRED_ERROR,
  PRO_REQUIRED_ERROR,
  type ExplanationActionDeps,
  type UpcomingPredictionActionDeps,
  type ProbableLineupActionDeps,
} from "@/lib/services/match-generation-actions";
import { checkAiRateLimit, AiRateLimitExceededError } from "@/lib/ai/rate-limiter";
import { presentExplanation } from "@/lib/types/prediction-explanation";
import { probabilityPercentages } from "@/lib/presentation/probability";
import type { getCanonicalPredictionRow } from "@/lib/db/repositories/predictions-repo";
import type { getTeamsByIds } from "@/lib/db/repositories/teams-repo";
import type { getLeagueById } from "@/lib/db/repositories/leagues-repo";
import type { previewPrediction } from "@/lib/ai/prediction-service";
import type { generateProbableLineups } from "@/lib/services/probable-lineup-service";
import type { ExplanationServiceDeps } from "@/lib/services/prediction-explanation-service";
import type { Match } from "@/types/db/tables";
import type { SportId } from "@/types/core/sport";

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

// ── Fake auth client (same shape as smoke-tests-sprint31) ──

function fakeClient(
  user: { id: string; email?: string | null } | null,
  opts: {
    role?: unknown;
    authError?: unknown;
    profileError?: unknown;
    profileMissing?: boolean;
  } = {},
): SessionAuthClient {
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: opts.authError ?? null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (opts.profileError) return { data: null, error: opts.profileError };
            if (opts.profileMissing) return { data: null, error: null };
            return { data: opts.role === undefined ? null : { role: opts.role }, error: null };
          },
        }),
      }),
      upsert: async () => ({ error: null }),
    }),
  } as unknown as SessionAuthClient;
}

const premiumClient = () => fakeClient({ id: "u-pro" }, { role: "premium" });
const freeClient = () => fakeClient({ id: "u-free" }, { role: "free" });
const anonymousClient = () => fakeClient(null);

// ── Fixed fixtures ──

const NOW = Date.parse("2026-09-16T12:00:00Z");
const nowMs = () => NOW;
const MATCH_ID = "m-test:match:1";
const SPORT = "soccer" as SportId;

const futureMatch = {
  id: MATCH_ID,
  home_team_id: "team-home",
  away_team_id: "team-away",
  league_id: "league-1",
  season_id: "season-1",
  match_date: "2026-10-01T18:00:00+00:00",
  status: "scheduled",
} as unknown as Match;

const futureGetMatch = (async () => futureMatch) as UpcomingPredictionActionDeps["getMatch"];

const canonicalRow = {
  id: 3,
  model_probabilities: { home: 0.44, draw: 0.28, away: 0.28 },
  data_snapshot: {
    expectedGoals: { home: 1.3, away: 1.1 },
    dataQuality: { homeMatchesUsed: 10, awayMatchesUsed: 10, leagueMatchesUsed: 20 },
  },
  kickoff_at: "2026-10-01T18:00:00+00:00",
  market_id: "1x2",
  model_version_id: "v1-dixon-coles-2026-01",
};

const validPayload = {
  summary: "El modelo otorga una leve ventaja al local.",
  key_factors: ["Mejor forma del local", "Visitante irregular"],
  model_reading: "Lectura de goles esperados favorable al local.",
};

// ── Provider/repo spies ──

function makeServiceDeps(): {
  deps: ExplanationServiceDeps;
  providerCalls: () => number;
  generatedInserts: () => number;
} {
  let providerCalls = 0;
  let generatedInserts = 0;
  const deps: ExplanationServiceDeps = {
    repo: {
      getGeneratedExplanation: async () => null,
      insertGenerated: async (input) => {
        generatedInserts++;
        return {
          row: {
            id: 1,
            predictionId: input.predictionId,
            provider: input.provider,
            modelName: input.modelName,
            promptSchema: input.promptSchema,
            promptVersion: input.promptVersion,
            language: input.language,
            payload: input.payload,
            inputFingerprint: input.inputFingerprint,
            generatedAt: new Date(NOW).toISOString(),
          },
          created: true,
        };
      },
      insertFailed: async () => {
        throw new Error("insertFailed must never be called in the authorized test");
      },
    },
    provider: {
      generate: async () => {
        providerCalls++;
        return { ok: true as const, text: JSON.stringify(validPayload) };
      },
    },
    modelName: "test-model",
    apiKey: "test-key",
  };
  return { deps, providerCalls: () => providerCalls, generatedInserts: () => generatedInserts };
}

function explanationDeps(overrides: {
  authClient: SessionAuthClient;
  clientKey: string;
  serviceDeps: ExplanationServiceDeps;
}): ExplanationActionDeps {
  return {
    authClient: overrides.authClient,
    clientKey: overrides.clientKey,
    getMatch: (async () => futureMatch) as ExplanationActionDeps["getMatch"],
    getCanonicalPrediction: (async () => canonicalRow) as unknown as typeof getCanonicalPredictionRow,
    getTeams: (async () => [
      { id: "team-home", name: "Local FC" },
      { id: "team-away", name: "Visitante FC" },
    ]) as unknown as typeof getTeamsByIds,
    getLeague: (async () => ({ id: "league-1", name: "Liga Test" })) as unknown as typeof getLeagueById,
    serviceDeps: overrides.serviceDeps,
  };
}

async function runTests(): Promise<void> {
  console.log("=== SMOKE TESTS — Server Action authorization (pre-commit security fix) ===\n");

  // ── A. resolveActionAccess (real function, fake clients) ──
  console.log("--- A. resolveActionAccess (functional) ---");
  {
    const anon = await resolveActionAccess(anonymousClient());
    check("A1: no session → anonymous", anon.status === "anonymous");
    const anonErr = await resolveActionAccess(fakeClient(null, { authError: { code: "x" } }));
    check("A2: auth error → anonymous", anonErr.status === "anonymous");
    const pro = await resolveActionAccess(premiumClient());
    check("A3: premium profile → authenticated premium", pro.status === "authenticated" && pro.role === "premium");
    const free = await resolveActionAccess(freeClient());
    check("A4: free profile → authenticated free", free.status === "authenticated" && free.role === "free");
    const missing = await resolveActionAccess(fakeClient({ id: "u" }, { profileMissing: true }));
    check("A5: missing profile → authenticated free (fail-closed)", missing.status === "authenticated" && missing.role === "free");
    const error = await resolveActionAccess(fakeClient({ id: "u" }, { profileError: { message: "boom" } }));
    check("A6: profile error → authenticated free (fail-closed)", error.status === "authenticated" && error.role === "free");

    // Client-supplied plan/role decoys must be ignored: only profiles.role counts.
    const decoy = fakeClient({ id: "u", email: "u@b.com" } as { id: string; email?: string | null }, { role: "free" });
    (decoy as unknown as Record<string, unknown>).plan = "premium";
    (decoy as unknown as Record<string, unknown>).role = "premium";
    const decoyAccess = await resolveActionAccess(decoy);
    check("A7: client plan/role decoy cannot elevate (still free)", decoyAccess.status === "authenticated" && decoyAccess.role === "free");
  }

  // ── B. Explanation action: PRO-only generation ──
  console.log("\n--- B. actionGeneratePredictionExplanation (PRO-only) ---");
  {
    // Anonymous: denied, 0 provider calls.
    {
      const spy = makeServiceDeps();
      const result = await runGeneratePredictionExplanation(
        SPORT,
        MATCH_ID,
        explanationDeps({ authClient: anonymousClient(), clientKey: "expl-anon", serviceDeps: spy.deps }),
      );
      check("B1: anonymous → denied UNAUTHORIZED", !result.ok && result.code === "UNAUTHORIZED", JSON.stringify(result));
      check("B2: anonymous error is sanitized auth message", !result.ok && result.error === AUTH_REQUIRED_ERROR);
      check("B3: anonymous causes 0 provider calls", spy.providerCalls() === 0, `calls=${spy.providerCalls()}`);
      check("B4: anonymous causes 0 explanation writes", spy.generatedInserts() === 0);
      check("B5: anonymous receives no keyFactors/modelReading", !result.ok && !("explanation" in result));
    }

    // Authenticated FREE: denied, 0 provider calls.
    {
      const spy = makeServiceDeps();
      const result = await runGeneratePredictionExplanation(
        SPORT,
        MATCH_ID,
        explanationDeps({ authClient: freeClient(), clientKey: "expl-free", serviceDeps: spy.deps }),
      );
      check("B6: FREE → denied PRO_REQUIRED", !result.ok && result.code === "PRO_REQUIRED", JSON.stringify(result));
      check("B7: FREE error is sanitized Pro message", !result.ok && result.error === PRO_REQUIRED_ERROR);
      check("B8: FREE causes 0 provider calls", spy.providerCalls() === 0, `calls=${spy.providerCalls()}`);
      check("B9: FREE causes 0 explanation writes", spy.generatedInserts() === 0);
      check("B10: FREE receives no keyFactors/modelReading", !result.ok && !("explanation" in result));
    }

    // Client-supplied plan cannot elevate: FREE + decoy plan in deps → still denied.
    {
      const spy = makeServiceDeps();
      const deps = explanationDeps({ authClient: freeClient(), clientKey: "expl-decoy", serviceDeps: spy.deps }) as ExplanationActionDeps & {
        plan?: string;
        role?: string;
      };
      deps.plan = "premium";
      deps.role = "premium";
      const result = await runGeneratePredictionExplanation(SPORT, MATCH_ID, deps);
      check("B11: FREE with decoy plan stays denied", !result.ok && result.code === "PRO_REQUIRED");
      check("B12: decoy plan causes 0 provider calls", spy.providerCalls() === 0);
    }

    // Authenticated PRO: allowed to reach the mocked service; exactly 1 provider call.
    {
      const spy = makeServiceDeps();
      const result = await runGeneratePredictionExplanation(
        SPORT,
        MATCH_ID,
        explanationDeps({ authClient: premiumClient(), clientKey: "expl-pro", serviceDeps: spy.deps }),
      );
      check("B13: PRO → ok", result.ok, JSON.stringify(result));
      check("B14: PRO reaches mocked provider exactly once", spy.providerCalls() === 1, `calls=${spy.providerCalls()}`);
      check("B15: PRO receives full PRO view (plan/keyFactors/modelReading)", result.ok && result.explanation.plan === "pro" && "keyFactors" in result.explanation && "modelReading" in result.explanation);
    }

    // Ordering: auth BEFORE rate limit. Exhaust the bucket, then anonymous must
    // still be denied with UNAUTHORIZED (not RATE_LIMIT) and 0 provider calls.
    {
      const key = "expl-exhausted";
      for (let i = 0; i < 200; i++) {
        try {
          checkAiRateLimit("explanation", key);
        } catch (err) {
          if (err instanceof AiRateLimitExceededError) break;
          throw err;
        }
      }
      const spy = makeServiceDeps();
      const result = await runGeneratePredictionExplanation(
        SPORT,
        MATCH_ID,
        explanationDeps({ authClient: anonymousClient(), clientKey: key, serviceDeps: spy.deps }),
      );
      check("B16: auth precedes rate limit (anonymous still UNAUTHORIZED when bucket exhausted)", !result.ok && result.code === "UNAUTHORIZED", JSON.stringify(result));
      check("B17: exhausted-bucket anonymous still 0 provider calls", spy.providerCalls() === 0);
    }
  }

  // ── C. Upcoming prediction: authenticated required ──
  console.log("\n--- C. actionGenerateUpcomingPrediction (authenticated) ---");
  {
    function upcomingDeps(authClient: SessionAuthClient, clientKey: string, spy: { calls: () => number; persistCalls: () => number }): UpcomingPredictionActionDeps {
      return {
        authClient,
        clientKey,
        getMatch: futureGetMatch,
        nowMs,
        preview: (async () => {
          spy.calls();
          return {
            prediction: {
              model_probabilities: { home: 0.4, draw: 0.3, away: 0.3 },
              data_snapshot: {},
              predicted_at: new Date(NOW).toISOString(),
            },
            created: false as const,
          };
        }) as unknown as typeof previewPrediction,
        persist: (async () => {
          spy.persistCalls();
          throw new Error("persist must not be called when created=false");
        }) as unknown as NonNullable<UpcomingPredictionActionDeps["persist"]>,
      };
    }

    // Anonymous: denied, 0 service calls, 0 writes.
    {
      let calls = 0;
      let writes = 0;
      const result = await runGenerateUpcomingPrediction(
        SPORT,
        MATCH_ID,
        upcomingDeps(anonymousClient(), "up-anon", { calls: () => calls++, persistCalls: () => writes++ }),
      );
      check("C1: anonymous → denied UNAUTHORIZED", !result.ok && result.code === "UNAUTHORIZED", JSON.stringify(result));
      check("C2: anonymous causes 0 model/service calls", calls === 0, `calls=${calls}`);
      check("C3: anonymous causes 0 writes", writes === 0);
    }

    // Authenticated FREE: allowed (current product rule), reaches mocked service.
    {
      let calls = 0;
      let writes = 0;
      const result = await runGenerateUpcomingPrediction(
        SPORT,
        MATCH_ID,
        upcomingDeps(freeClient(), "up-free", { calls: () => calls++, persistCalls: () => writes++ }),
      );
      check("C4: authenticated FREE → reaches mocked service", result.ok && !!result.prediction, JSON.stringify(result));
      check("C5: authenticated FREE causes exactly 1 service call", calls === 1, `calls=${calls}`);
      check("C6: authenticated FREE reuses cached prediction (0 writes, generated=false)", writes === 0 && result.ok && result.generated === false);
    }

    // Authenticated PREMIUM: allowed.
    {
      let calls = 0;
      let writes = 0;
      const result = await runGenerateUpcomingPrediction(
        SPORT,
        MATCH_ID,
        upcomingDeps(premiumClient(), "up-pro", { calls: () => calls++, persistCalls: () => writes++ }),
      );
      check("C7: authenticated PREMIUM → reaches mocked service", result.ok);
      check("C8: authenticated PREMIUM service called once", calls === 1);
    }
  }

  // ── D. Probable lineup: PRO-only (authenticated required, premium to run) ──
  console.log("\n--- D. actionGenerateProbableLineup (PRO-only) ---");
  {
    function probableDeps(authClient: SessionAuthClient, clientKey: string, counter: { n: number }): ProbableLineupActionDeps {
      return {
        authClient,
        clientKey,
        getMatch: futureGetMatch as ProbableLineupActionDeps["getMatch"],
        nowMs,
        store: {} as ProbableLineupActionDeps["store"],
        generate: (async () => {
          counter.n++;
          return { teams: [], created: false };
        }) as unknown as typeof generateProbableLineups,
      };
    }

    // Anonymous: denied, 0 model calls/writes.
    {
      const counter = { n: 0 };
      const result = await runGenerateProbableLineup(
        SPORT,
        MATCH_ID,
        probableDeps(anonymousClient(), "prob-anon", counter),
      );
      check("D1: anonymous → denied UNAUTHORIZED", !result.ok && result.code === "UNAUTHORIZED", JSON.stringify(result));
      check("D2: anonymous causes 0 model calls", counter.n === 0, `calls=${counter.n}`);
    }

    // Authenticated FREE: denied (PRO-only), 0 model calls.
    {
      const counter = { n: 0 };
      const result = await runGenerateProbableLineup(
        SPORT,
        MATCH_ID,
        probableDeps(freeClient(), "prob-free", counter),
      );
      check("D3: authenticated FREE → denied PRO_REQUIRED", !result.ok && result.code === "PRO_REQUIRED", JSON.stringify(result));
      check("D4: authenticated FREE error is sanitized Pro message", !result.ok && result.error === PRO_REQUIRED_ERROR);
      check("D5: authenticated FREE causes 0 model calls", counter.n === 0, `calls=${counter.n}`);
    }

    // FREE + client-supplied plan/role decoy cannot elevate.
    {
      const counter = { n: 0 };
      const deps = probableDeps(freeClient(), "prob-decoy", counter) as ProbableLineupActionDeps & {
        plan?: string;
        role?: string;
      };
      deps.plan = "premium";
      deps.role = "premium";
      const result = await runGenerateProbableLineup(SPORT, MATCH_ID, deps);
      check("D6: FREE with decoy plan stays denied PRO_REQUIRED", !result.ok && result.code === "PRO_REQUIRED");
      check("D7: decoy plan causes 0 model calls", counter.n === 0);
    }

    // Authenticated PREMIUM: allowed.
    {
      const counter = { n: 0 };
      const result = await runGenerateProbableLineup(
        SPORT,
        MATCH_ID,
        probableDeps(premiumClient(), "prob-pro", counter),
      );
      check("D8: authenticated PREMIUM → reaches mocked service", result.ok);
      check("D9: authenticated PREMIUM model called exactly once", counter.n === 1);
    }
  }

  // ── E. Regression: render read path + probability display ──
  console.log("\n--- E. Regression (read path + probability display) ---");
  {
    const free = presentExplanation(validPayload, "free");
    const pro = presentExplanation(validPayload, "pro");
    check("E1: FREE read view exposes ONLY plan+summary", JSON.stringify(Object.keys(free).sort()) === JSON.stringify(["plan", "summary"]));
    check("E2: PRO read view exposes keyFactors+modelReading", pro.plan === "pro" && pro.keyFactors.length === validPayload.key_factors.length && pro.modelReading === validPayload.model_reading);

    const p = probabilityPercentages({ home: 0.44, draw: 0.28, away: 0.28 });
    check("E3: probability display still totals 100", p.home + p.draw + p.away === 100 && p.total === 100, JSON.stringify(p));

    const cwd = process.cwd();
    const page = fs.readFileSync(`${cwd}/src/app/[sport]/matches/[id]/page.tsx`, "utf8");
    check("E4: render path reads persisted explanation (readPersistedExplanation)", page.includes("readPersistedExplanation"));
    check("E5: render path never imports Gemini/provider/generate", !page.includes("gemini-provider") && !page.includes("generatePredictionExplanation") && !page.includes("GEMINI"));

    const actionsSrc = fs.readFileSync(`${cwd}/src/app/[sport]/matches/[id]/actions.ts`, "utf8");
    check("E6: actions no longer build the provider inline (delegated to guarded core)", !actionsSrc.includes("createGeminiExplanationProvider"));
    const core = fs.readFileSync(`${cwd}/src/lib/services/match-generation-actions.ts`, "utf8");
    const authIdx = core.indexOf("resolveActionAccess(deps.authClient)");
    const rateIdx = core.indexOf('checkAiRateLimit("explanation"');
    check("E7: core enforces auth before rate limit (source order)", authIdx > -1 && rateIdx > authIdx, `auth=${authIdx} rate=${rateIdx}`);
  }

  // ── F. Legacy AI actions now auth-gated (closed beta: anonymous denied) ──
  console.log("\n--- F. actionAnalyzeMatch / actionPredictMatch / actionGeneratePlayerReport (anonymous denied) ---");
  {
    const cwd = process.cwd();
    const matchActions = fs.readFileSync(`${cwd}/src/app/[sport]/matches/[id]/actions.ts`, "utf8");
    const playerActions = fs.readFileSync(`${cwd}/src/app/[sport]/players/[id]/actions.ts`, "utf8");
    const sessionSrc = fs.readFileSync(`${cwd}/src/lib/auth/session.ts`, "utf8");
    const shared = fs.readFileSync(`${cwd}/src/lib/services/match-generation-actions.ts`, "utf8");
    const actionErrors = fs.readFileSync(`${cwd}/src/lib/services/action-errors.ts`, "utf8");

    // The correct gate primitive (server-side, ignores client-supplied role/plan) is used.
    check("F1: analyze action uses server-side resolveActionAccess", matchActions.includes("resolveActionAccess"));
    check("F2: predict action uses server-side resolveActionAccess", matchActions.includes("resolveActionAccess"));
    check("F3: player-report action uses server-side resolveActionAccess", playerActions.includes("resolveActionAccess"));

    // Auth precedes rate-limit consumption (same invariant as the protected core).
    const fAnalyzeAuth = matchActions.indexOf("resolveActionAccess");
    const fAnalyzeRate = matchActions.indexOf('checkAiRateLimit("match-analysis"');
    check("F4: analyze gates auth BEFORE rate limit", fAnalyzeAuth > -1 && fAnalyzeRate > fAnalyzeAuth, `auth=${fAnalyzeAuth} rate=${fAnalyzeRate}`);
    const fPredictAuth = matchActions.indexOf("resolveActionAccess");
    const fPredictRate = matchActions.indexOf('checkAiRateLimit("match-prediction"');
    check("F5: predict gates auth BEFORE rate limit", fPredictAuth > -1 && fPredictRate > fPredictAuth, `auth=${fPredictAuth} rate=${fPredictRate}`);
    const fReportAuth = playerActions.indexOf("resolveActionAccess");
    const fReportRate = playerActions.indexOf('checkAiRateLimit("player-report"');
    check("F6: player-report gates auth BEFORE rate limit", fReportAuth > -1 && fReportRate > fReportAuth, `auth=${fReportAuth} rate=${fReportRate}`);

    // Anonymous denial happens BEFORE the LLM service call (0 provider calls by construction).
    const fAnalyzeDenyBeforeService = matchActions.indexOf("if (access.status === \"anonymous\")") < matchActions.indexOf("generateMatchAnalysis(");
    check("F7: analyze denies anonymous before reaching the LLM service", fAnalyzeDenyBeforeService);
    const fPredictDenyBeforeService = matchActions.indexOf("if (access.status === \"anonymous\")") < matchActions.indexOf("await predictMatch(");
    check("F8: predict denies anonymous before reaching the LLM service", fPredictDenyBeforeService);
    const fReportDenyBeforeService = playerActions.indexOf("if (access.status === \"anonymous\")") < playerActions.indexOf("generatePlayerReport(");
    check("F9: player-report denies anonymous before reaching the LLM service", fReportDenyBeforeService);

    // The denied path returns ONLY the shared sanitized message (no code/data/model leaks).
    check("F10: deny shape is { ok:false, error } with shared AUTH_REQUIRED_ERROR message",
      matchActions.includes(`error: AUTH_REQUIRED_ERROR`) &&
      playerActions.includes(`error: AUTH_REQUIRED_ERROR`));
    check("F11: AUTH_REQUIRED_ERROR is the same sanitized string used by protected actions",
      actionErrors.includes(`AUTH_REQUIRED_ERROR = "Iniciá sesión para continuar."`) &&
      /error:\s*AUTH_REQUIRED_ERROR/.test(matchActions) &&
      /error:\s*AUTH_REQUIRED_ERROR/.test(playerActions));

    // The gate never consults client-supplied role/plan (only profiles.role via getCurrentProfile).
    check("F12: gate helper ignores client role/plan (only profiles-based)",
      sessionSrc.includes("getCurrentUser") && sessionSrc.includes("getCurrentProfile"));
    const noPlanParam =
      !/function actionAnalyzeMatch\([^)]*(role|plan)/.test(matchActions) &&
      !/function actionPredictMatch\([^)]*(role|plan)/.test(matchActions) &&
      !/function actionGeneratePlayerReport\([^)]*(role|plan)/.test(playerActions);
    check("F13: neither action accepts a role/plan argument", noPlanParam);
  }

  // ── G. PRO entitlement on legacy actions (analyze / player report), predict stays FREE ──
  console.log("\n--- G. actionAnalyzeMatch / actionGeneratePlayerReport (PRO-only) ---");
  {
    const cwd = process.cwd();
    const matchActions = fs.readFileSync(`${cwd}/src/app/[sport]/matches/[id]/actions.ts`, "utf8");
    const playerActions = fs.readFileSync(`${cwd}/src/app/[sport]/players/[id]/actions.ts`, "utf8");
    const shared = fs.readFileSync(`${cwd}/src/lib/services/match-generation-actions.ts`, "utf8");
    const actionErrors = fs.readFileSync(`${cwd}/src/lib/services/action-errors.ts`, "utf8");

    // PRO gate exists, after the anonymous auth check, returning the sanitized Pro message.
    check("G1: analyze gates PRO after auth (access.role !== premium → PRO_REQUIRED_ERROR)",
      matchActions.includes(`if (access.role !== "premium")`) &&
      matchActions.includes(`error: PRO_REQUIRED_ERROR`));
    check("G2: player-report gates PRO after auth",
      playerActions.includes(`if (access.role !== "premium")`) &&
      playerActions.includes(`error: PRO_REQUIRED_ERROR`));

    // PRO gate precedes rate-limit consumption (same invariant as explanation).
    const gAnalyzePro = matchActions.indexOf(`access.role !== "premium"`);
    const gAnalyzeRate = matchActions.indexOf(`checkAiRateLimit("match-analysis"`);
    check("G3: analyze PRO gate precedes rate limit", gAnalyzePro > -1 && gAnalyzeRate > gAnalyzePro, `pro=${gAnalyzePro} rate=${gAnalyzeRate}`);
    const gReportPro = playerActions.indexOf(`access.role !== "premium"`);
    const gReportRate = playerActions.indexOf(`checkAiRateLimit("player-report"`);
    check("G4: player-report PRO gate precedes rate limit", gReportPro > -1 && gReportRate > gReportPro, `pro=${gReportPro} rate=${gReportRate}`);

    // PRO gate precedes any LLM provider call.
    check("G5: analyze PRO gate precedes the LLM service call",
      gAnalyzePro < matchActions.indexOf("generateMatchAnalysis("));
    check("G6: player-report PRO gate precedes the LLM service call",
      gReportPro < playerActions.indexOf("generatePlayerReport("));

    // actionPredictMatch (1X2) and upcoming prediction remain FREE: auth-only, no PRO gate.
    const predictFn = matchActions.slice(
      matchActions.indexOf("export async function actionPredictMatch"),
      matchActions.indexOf("export async function actionGenerateUpcomingPrediction"),
    );
    check("G7: predictMatch has NO PRO gate (stays FREE)",
      !/PRO_REQUIRED|access\.role !== "premium"/.test(predictFn));

    // Shared sanitized PRO string defined once in the guarded core and surfaced by both actions.
    check("G8: PRO_REQUIRED_ERROR is the shared sanitized Pro string",
      actionErrors.includes(`PRO_REQUIRED_ERROR`) &&
      actionErrors.includes(`"Esta función está disponible con el plan Pro de NYVORX."`));
    check("G9: both legacy actions surface the shared PRO_REQUIRED_ERROR constant",
      /error:\s*PRO_REQUIRED_ERROR/.test(matchActions) &&
      /error:\s*PRO_REQUIRED_ERROR/.test(playerActions));
  }

  console.log("\n======================================================================");
  console.log(`Server Action authorization smoke: ${passed} passed, ${failed} failed`);
  console.log("======================================================================");
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("[FATAL] smoke-tests-action-authorization failed", err);
  process.exit(1);
});
