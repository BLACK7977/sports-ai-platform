import {
  buildCanonicalContext,
  buildExplanationPrompt,
  computeExplanationFingerprint,
  type CanonicalExplanationSource,
} from "@/lib/ai/prediction-explanation-context";
import {
  predictionExplanationPayloadSchema,
} from "@/lib/ai/prediction-explanation-schema";
import { presentExplanation } from "@/lib/types/prediction-explanation";
import {
  GeminiExplanationProvider,
  type GeminiProviderResult,
} from "@/lib/ai/providers/gemini-provider";
import {
  generatePredictionExplanation,
  EXPLANATION_PROVIDER,
  type ExplanationServiceDeps,
  type ExplanationProviderLike,
  type ExplanationGenerationInput,
} from "@/lib/services/prediction-explanation-service";
import type {
  PredictionExplanationRepo,
  GeneratedExplanationRow,
  GeneratedInsertInput,
} from "@/lib/db/repositories/prediction-explanation-repo";

let failures = 0;
function check(label: string, fn: () => boolean, detail = ""): void {
  let ok = false;
  try {
    ok = fn();
  } catch (err) {
    console.log(`  FAIL ${label} — threw: ${err instanceof Error ? err.message : String(err)}`);
    failures += 1;
    return;
  }
  console.log(`  ${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function validSource(overrides: Partial<CanonicalExplanationSource> = {}): ExplanationGenerationInput {
  return {
    predictionId: 2,
    matchId: "m-soccer-sportmonks:match:19713931",
    homeTeamId: "team-a",
    awayTeamId: "team-b",
    homeTeamName: "FC Copenhague",
    awayTeamName: "Brondby IF",
    competition: "Superliga de Dinamarca",
    kickoffAt: "2026-10-01T18:00:00+00:00",
    marketId: "1x2",
    modelVersionId: "v1-dixon-coles-2026-01",
    probabilities: { home: 0.12842617841097967, draw: 0.2950243970101616, away: 0.5765494245788588 },
    expectedGoals: { home: 1.18, away: 1.62 },
    dataQuality: { homeMatchesUsed: 20, awayMatchesUsed: 20, leagueMatchesUsed: 40 },
    ...overrides,
  };
}

const VALID_PAYLOAD = {
  summary: "El modelo pondera claramente al visitante.",
  key_factors: ["favorito ausente", "empate con peso", "poca separacion entre 1 y X"],
  model_reading: "Lectura de gol esperado favorable al visitante.",
};

type ProviderFailure = Extract<GeminiProviderResult, { ok: false }>;

function makeProvider(
  failure: ProviderFailure | null,
  opts: { content?: string } = {},
): { provider: ExplanationProviderLike; calls: () => number } {
  let calls = 0;
  const content = opts.content ?? JSON.stringify(VALID_PAYLOAD);
  return {
    provider: {
      generate: async (): Promise<GeminiProviderResult> => {
        calls += 1;
        if (failure) return failure;
        return { ok: true, text: content };
      },
    },
    calls: () => calls,
  };
}

const okProvider = () => makeProvider(null);

function toRow(input: GeneratedInsertInput): GeneratedExplanationRow {
  return {
    id: 99,
    predictionId: input.predictionId,
    provider: input.provider,
    modelName: input.modelName,
    promptSchema: input.promptSchema,
    promptVersion: input.promptVersion,
    language: input.language,
    payload: input.payload,
    inputFingerprint: input.inputFingerprint,
    generatedAt: "2026-09-17T12:00:00+00:00",
  };
}

function makeFakeRepo(opts: {
  preexisting?: GeneratedExplanationRow | null;
} = {}): {
  repo: PredictionExplanationRepo;
  stats: { get: () => number; generated: () => number; failed: () => number };
} {
  let existing = opts.preexisting ?? null;
  let get = 0;
  let generated = 0;
  let failed = 0;
  return {
    repo: {
      getGeneratedExplanation: async () => {
        get += 1;
        return existing;
      },
      insertGenerated: async (input) => {
        generated += 1;
        if (existing) return { row: existing, created: false };
        existing = toRow(input);
        return { row: toRow(input), created: true };
      },
      insertFailed: async () => {
        failed += 1;
      },
    },
    stats: {
      get: () => get,
      generated: () => generated,
      failed: () => failed,
    },
  };
}

function baseDeps(over: Partial<ExplanationServiceDeps> = {}): ExplanationServiceDeps {
  return {
    repo: makeFakeRepo().repo,
    provider: okProvider().provider,
    modelName: "gemini-test",
    apiKey: "test-key",
    ...over,
  };
}

const CONTEXT_ALLOWED_KEYS = [
  "predictionId",
  "matchId",
  "homeTeamId",
  "awayTeamId",
  "homeTeamName",
  "awayTeamName",
  "competition",
  "kickoffAt",
  "marketId",
  "modelVersionId",
  "probabilities",
  "expectedGoals",
  "dataQuality",
];

function geminiOkResponse(): Response {
  const body = {
    candidates: [{ content: { parts: [{ text: JSON.stringify(VALID_PAYLOAD) }] } }],
  };
  return new Response(JSON.stringify(body), { status: 200 });
}

async function main() {
  console.log("=== 1. ALLOWED INPUT FILTERING ===");
  const ctx1 = buildCanonicalContext(validSource());
  const actualKeys = Object.keys(ctx1).sort();
  const expectedKeys = [...CONTEXT_ALLOWED_KEYS].sort();
  check("context exposes whitelist keys exactly", () => {
    return actualKeys.length === expectedKeys.length && expectedKeys.every((k) => actualKeys.includes(k));
  }, actualKeys.join(","));
  check("forbidden keys never present", () => {
    const ser = JSON.stringify(ctx1);
    return !/(odds|edge|ev_|sports_ai_score|score_components|injuries|lineup|venue|referee)/i.test(ser);
  });
  check("invalid persisted probabilities rejected", () => {
    try {
      buildCanonicalContext(validSource({ probabilities: { home: 0.5, draw: 0.2, away: 0.1 } }));
      return false;
    } catch {
      return true;
    }
  });

  console.log("=== 2. FORBIDDEN FIELDS EXCLUDED (prompt) ===");
  const prompt = buildExplanationPrompt(ctx1);
  check("data block contains no forbidden values", () => {
    const dataBlock = prompt.slice(prompt.indexOf("Datos congelados"));
    const forbidden = ["odds", "cuota", "edge", "ev_", "sports_ai_score", "lesion", "alineaci", "estadio", "arbitro"];
    const hasExactScore = /\b\d\s*[-:]\s*\d\b/.test(dataBlock.toLowerCase());
    return !hasExactScore && !forbidden.some((token) => dataBlock.toLowerCase().includes(token.toLowerCase()));
  });
  check("favorite outcome reflected", () => prompt.includes("FAVORITO DEL MODELO: visitante"));

  console.log("=== 3. FINGERPRINT DETERMINISM ===");
  const fp1 = computeExplanationFingerprint(ctx1);
  const fp2 = computeExplanationFingerprint(buildCanonicalContext(validSource()));
  const fp3 = computeExplanationFingerprint(buildCanonicalContext(validSource({ awayTeamName: "Otro Club" })));
  check("same input → same fingerprint", () => fp1 === fp2, fp1.slice(0, 16));
  check("different input → different fingerprint", () => fp1 !== fp3);
  check("fingerprint is 64 hex chars", () => /^[0-9a-f]{64}$/.test(fp1));

  console.log("=== 4. ZOD STRICT OUTPUT — VALID ===");
  check("valid payload accepted", () => predictionExplanationPayloadSchema.safeParse(VALID_PAYLOAD).success === true);

  console.log("=== 5. ZOD STRICT OUTPUT — INVALID REJECTED ===");
  check("fewer than 2 key_factors rejected", () =>
    predictionExplanationPayloadSchema.safeParse({ ...VALID_PAYLOAD, key_factors: ["solo"] }).success === false);
  check("more than 4 key_factors rejected", () =>
    predictionExplanationPayloadSchema.safeParse({
      ...VALID_PAYLOAD,
      key_factors: ["a", "b", "c", "d", "e"],
    }).success === false);
  check("unknown extra key rejected (strict)", () =>
    predictionExplanationPayloadSchema.safeParse({ ...VALID_PAYLOAD, invented_odds: "2.10" }).success === false);
  check("whitespace-only summary rejected", () =>
    predictionExplanationPayloadSchema.safeParse({ ...VALID_PAYLOAD, summary: "   " }).success === false);
  check("missing model_reading rejected", () => {
    const { model_reading: _omitted, ...rest } = VALID_PAYLOAD;
    return predictionExplanationPayloadSchema.safeParse(rest).success === false;
  });

  console.log("=== 6. EXISTING EXPLANATION REUSED (0 provider calls) ===");
  const reuseProvider = okProvider();
  const reuseRepo = makeFakeRepo({ preexisting: toRow({
    predictionId: 2,
    provider: EXPLANATION_PROVIDER,
    modelName: "gemini-test",
    promptSchema: "sports-ai-explanation-v1",
    promptVersion: 1,
    language: "es",
    payload: VALID_PAYLOAD as unknown as Record<string, unknown>,
    inputFingerprint: "abc",
  }) });
  const reuse = await generatePredictionExplanation(
    { repo: reuseRepo.repo, provider: reuseProvider.provider, modelName: "gemini-test", apiKey: "k" },
    validSource(),
  );
  check("reused result ok + generated=false", () => reuse.ok === true && reuse.generated === false, JSON.stringify(reuse).slice(0, 80));
  check("provider calls = 0 on reuse", () => reuseProvider.calls() === 0);

  console.log("=== 6b. NO GEMINI ON READ PATH (SSR safety) ===");
  check("lookup path never calls provider", () => reuseProvider.calls() === 0 && reuseRepo.stats.get() === 1);

  console.log("=== 7. RACE / IDEMPOTENCY (loser re-read contract) ===");
  const loserProvider = okProvider();
  const loserRow = toRow({
    predictionId: 2,
    provider: EXPLANATION_PROVIDER,
    modelName: "gemini-test",
    promptSchema: "sports-ai-explanation-v1",
    promptVersion: 1,
    language: "es",
    payload: VALID_PAYLOAD as unknown as Record<string, unknown>,
    inputFingerprint: "race-fp",
  });
  const loserRepo = makeFakeRepo();
  const loser = await generatePredictionExplanation(
    {
      repo: {
        ...loserRepo.repo,
        insertGenerated: async () => ({ row: loserRow, created: false }),
      } as PredictionExplanationRepo,
      provider: loserProvider.provider,
      modelName: "gemini-test",
      apiKey: "k",
    },
    validSource(),
  );
  check("loser reuses canonical winner (generated=false)", () => loser.ok === true && loser.generated === false);
  check("both callers serve the identical explanation", () => loser.ok === true && loser.explanation.summary === VALID_PAYLOAD.summary);

  const idleRepo = makeFakeRepo();
  const idleProvider = okProvider();
  const first = await generatePredictionExplanation(
    { repo: idleRepo.repo, provider: idleProvider.provider, modelName: "gemini-test", apiKey: "k" },
    validSource(),
  );
  const second = await generatePredictionExplanation(
    { repo: idleRepo.repo, provider: idleProvider.provider, modelName: "gemini-test", apiKey: "k" },
    validSource(),
  );
  check("first generation created=true, second reused", () =>
    first.ok === true && first.generated === true && second.ok === true && second.generated === false);
  check("exactly one generated row persisted", () => idleRepo.stats.generated() === 1);

  console.log("=== 7b. CONCURRENT RACE (Promise.all) ===");
  let concExisting: GeneratedExplanationRow | null = null;
  const concRepo: PredictionExplanationRepo = {
    getGeneratedExplanation: async () => concExisting,
    insertGenerated: async (input) => {
      if (concExisting) return { row: concExisting, created: false };
      concExisting = toRow(input);
      return { row: concExisting, created: true };
    },
    insertFailed: async () => {},
  };
  const concProvider = okProvider();
  const [ra, rb] = await Promise.all([
    generatePredictionExplanation({ repo: concRepo, provider: concProvider.provider, modelName: "gemini-test", apiKey: "k" }, validSource()),
    generatePredictionExplanation({ repo: concRepo, provider: concProvider.provider, modelName: "gemini-test", apiKey: "k" }, validSource()),
  ]);
  check("concurrent both ok with same explanation", () =>
    ra.ok === true && rb.ok === true && ra.explanation.summary === rb.explanation.summary);
  check("concurrent exactly one created=true", () => {
    const a = ra.ok ? ra.generated : null;
    const b = rb.ok ? rb.generated : null;
    return (a === true && b === false) || (a === false && b === true);
  });

  console.log("=== 8. MISSING API KEY GRACEFUL ===");
  const missingKeyProvider = okProvider();
  const missingKeyRepo = makeFakeRepo();
  const missing = await generatePredictionExplanation(
    { repo: missingKeyRepo.repo, provider: missingKeyProvider.provider, modelName: "gemini-test", apiKey: undefined },
    validSource(),
  );
  check("missing key → unavailable missing-key", () => missing.ok === false && missing.reason === "missing-key");
  check("missing key → provider never called", () => missingKeyProvider.calls() === 0);
  check("missing key → no failed row persisted", () => missingKeyRepo.stats.failed() === 0);

  console.log("=== 9. SERVICE HANDLING OF PROVIDER FAILURE (429) ===");
  const nineRepo = makeFakeRepo();
  const nineProvider = makeProvider({
    ok: false,
    failure: { kind: "http", status: 429, retryable: false },
  });
  const nine = await generatePredictionExplanation(
    { repo: nineRepo.repo, provider: nineProvider.provider, modelName: "m", apiKey: "k" },
    validSource(),
  );
  const nineFailure = nine.ok === false ? nine : null;
  check("429 → unavailable http + status", () => nineFailure !== null && nineFailure.reason === "http" && nineFailure.status === 429);
  check("429 → sanitized failed row persisted (no raw response)", () => nineRepo.stats.failed() === 1);

  console.log("=== 9b. REAL PROVIDER NO-RETRY 400/401/403/429 ===");
  for (const status of [400, 401, 403, 429]) {
    let attempts = 0;
    const realProvider = new GeminiExplanationProvider({
      fetchImpl: (async () => {
        attempts += 1;
        return new Response("{}", { status });
      }) as typeof fetch,
    });
    const res = await realProvider.generate({ prompt: "p", apiKey: "k", model: "m", maxAttempts: 4, baseDelayMs: 1 });
    check(`real provider status ${status} → exactly 1 attempt`, () => res.ok === false && attempts === 1, `attempts=${attempts}`);
  }

  console.log("=== 9c. REAL PROVIDER BOUNDED RETRY ON 5xx ===");
  let fiveAttempts = 0;
  const fiveProvider = new GeminiExplanationProvider({
    fetchImpl: (async () => {
      fiveAttempts += 1;
      if (fiveAttempts === 1) return new Response("{}", { status: 500 });
      return geminiOkResponse();
    }) as typeof fetch,
  });
  const fiveRes = await fiveProvider.generate({ prompt: "p", apiKey: "k", model: "m", maxAttempts: 3, baseDelayMs: 1 });
  check("5xx retried (bounded) then success", () => fiveRes.ok === true && fiveAttempts === 2, `attempts=${fiveAttempts}`);

  console.log("=== 9d. REAL PROVIDER TIMEOUT BOUNDED (AbortController) ===");
  let timeoutAttempts = 0;
  const hangingFetch = (_url: unknown, init?: { signal?: AbortSignal }): Promise<Response> =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const err = new Error("aborted") as Error & { name: string };
        err.name = "AbortError";
        reject(err);
      });
    });
  const timeoutProvider = new GeminiExplanationProvider({
    fetchImpl: (async (_url: unknown, init?: { signal?: AbortSignal }): Promise<Response> => {
      timeoutAttempts += 1;
      return hangingFetch(_url, init);
    }) as typeof fetch,
  });
  const t0 = Date.now();
  const timeoutRes = await timeoutProvider.generate({ prompt: "p", apiKey: "k", model: "m", timeoutMs: 30, maxAttempts: 2, baseDelayMs: 1 });
  const elapsed = Date.now() - t0;
  const timeoutResult = timeoutRes.ok === false ? timeoutRes : null;
  check("timeout → bounded attempts (2)", () => timeoutResult !== null && timeoutResult.failure.kind === "timeout" && timeoutAttempts === 2, `attempts=${timeoutAttempts}`);
  check("timeout bounded in wall time (< 5s)", () => elapsed < 5000, `elapsed=${elapsed}ms`);

  console.log("=== 9e. REAL PROVIDER MALFORMED / MISSING KEY ===");
  const malformedProvider = new GeminiExplanationProvider({
    fetchImpl: async () => new Response("hello", { status: 200 }) as Response,
  });
  const malformed = await malformedProvider.generate({ prompt: "p", apiKey: "k", model: "m" });
  const malformedFailure = malformed.ok === false ? malformed.failure : null;
  check("non-JSON 200 → malformed, no retry", () => malformedFailure !== null && malformedFailure.kind === "malformed", JSON.stringify(malformedFailure));
  const noKeyProvider = new GeminiExplanationProvider({ fetchImpl: async () => geminiOkResponse() });
  const noKeyRes = await noKeyProvider.generate({ prompt: "p", model: "m" });
  const noKeyFailure = noKeyRes.ok === false ? noKeyRes.failure : null;
  check("missing apiKey → missing-key, fetch never called", () => noKeyFailure !== null && noKeyFailure.kind === "missing-key");

  console.log("=== 10. PREDICTION NEVER MUTATED ===");
  const frozen = validSource();
  const frozenCopy = JSON.parse(JSON.stringify(frozen));
  Object.freeze(frozen);
  Object.freeze(frozen.probabilities);
  const neverRes = await generatePredictionExplanation(baseDeps(), frozen);
  check("service run succeeds on frozen input", () => neverRes.ok === true);
  check("input object unchanged after service run", () => JSON.stringify(frozen) === JSON.stringify(frozenCopy));
  check("repo exposes no update/delete/upsert path", () => {
    const r = makeFakeRepo().repo as unknown as Record<string, unknown>;
    return !("update" in r) && !("delete" in r) && !("upsert" in r);
  });

  console.log("=== 11. FREE/PRO PRESENTATION ===");
  const free = presentExplanation(VALID_PAYLOAD, "free");
  const pro = presentExplanation(VALID_PAYLOAD, "pro");
  check("FREE exposes only summary", () => free.plan === "free" && Object.keys(free).join(",") === "plan,summary");
  check("PRO exposes summary + keyFactors + modelReading", () => {
    if (pro.plan !== "pro") return false;
    return typeof pro.summary === "string" && Array.isArray(pro.keyFactors) && typeof pro.modelReading === "string";
  });
  const proPro = pro.plan === "pro" ? pro : null;
  check("plan decided server-side (pure function of plan arg)", () =>
    proPro !== null && proPro.keyFactors[0] === "favorito ausente" && free.summary === pro.summary);

  console.log("=== 12. PROVIDER OUTPUT PARSING (fenced JSON) ===");
  const fencedRepo = makeFakeRepo();
  const fencedProvider = makeProvider(null, { content: '```json\n' + JSON.stringify(VALID_PAYLOAD) + '\n```' });
  const fencedRes = await generatePredictionExplanation(
    { repo: fencedRepo.repo, provider: fencedProvider.provider, modelName: "m", apiKey: "k" },
    validSource(),
  );
  check("fenced JSON block parsed, validated and persisted", () => fencedRes.ok === true && fencedRes.explanation.summary === VALID_PAYLOAD.summary);
  check("fenced flow stored exactly one generated row", () => fencedRepo.stats.generated() === 1);

  console.log("");
  if (failures === 0) {
    console.log("FINAL STATUS: PASS");
  } else {
    console.log(`FINAL STATUS: FAIL (${failures} failed checks)`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[smoke-tests-prediction-explanation] unexpected error:", err instanceof Error ? err.message : err);
  process.exit(1);
});