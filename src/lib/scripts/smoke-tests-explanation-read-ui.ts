import {
  readPersistedExplanation,
} from "@/lib/services/prediction-explanation-service";
import {
  presentExplanation,
  type PredictionExplanationView,
} from "@/lib/types/prediction-explanation";
import {
  predictionExplanationPayloadSchema,
  type PredictionExplanationPayload,
} from "@/lib/ai/prediction-explanation-schema";
import {
  resolvePremiumAccess,
  type ProfileResult,
} from "@/lib/auth/session";
import { probabilityPercentages } from "@/lib/presentation/probability";
import {
  createProductionPredictionExplanationRepo,
  type PredictionExplanationRepo,
} from "@/lib/db/repositories/prediction-explanation-repo";
import { getCanonicalPredictionRow } from "@/lib/db/repositories/predictions-repo";
import { listPredictionRows } from "@/lib/db/repositories/predictions-repo";
import {
  DEFAULT_MARKET_ID,
  DEFAULT_MODEL_VERSION_ID,
} from "@/lib/ai/prediction-service";

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

const TARGET_MATCH_ID = "m-soccer-sportmonks:match:19713933";

const validPayload: PredictionExplanationPayload = {
  summary: "El equipo local parte como favorito por su superioridad estadística en casa.",
  key_factors: [
    "Local con mejor forma reciente",
    "Visitante sin victorias a domicilio",
    "El enfrentamiento directo favorece al local",
  ],
  model_reading: "El modelo asigna probabilidades consistentes con un favoritismo moderado del local.",
};

const FORBIDDEN_TOKENS = [
  "gemini",
  "google",
  "google-generative-ai",
  "dixon",
  "dixon-coles",
  "sports-ai-explanation-v1",
  "prompt_schema",
  "fingerprint",
  "input_fingerprint",
  "model_name",
  "modelVersionId",
];

function scanForbidden(text: string): string[] {
  return FORBIDDEN_TOKENS.filter((token) => text.toLowerCase().includes(token.toLowerCase()));
}

function fakeRepo(row: PredictionExplanationPayload | null): {
  repo: Pick<PredictionExplanationRepo, "getGeneratedExplanation" | "insertGenerated" | "insertFailed">;
  reads: () => number;
} {
  let reads = 0;
  return {
    reads: () => reads,
    repo: {
      getGeneratedExplanation: async () => {
        reads++;
        if (row === null) return null;
        return {
          id: 1,
          predictionId: 3,
          provider: "fake",
          modelName: "fake",
          promptSchema: "fake",
          promptVersion: 1,
          language: "es",
          payload: row as unknown as Record<string, unknown>,
          inputFingerprint: "fake",
          generatedAt: "2026-09-17T00:00:00+00:00",
        };
      },
      // SMOKE-TEST GUARD: the read path must NEVER write. If any write is
      // attempted these spies fail the suite.
      insertGenerated: async () => {
        throw new Error("READ PATH MUST NOT WRITE (insertGenerated called)");
      },
      insertFailed: async () => {
        throw new Error("READ PATH MUST NOT WRITE (insertFailed called)");
      },
    },
  };
}

async function main(): Promise<void> {
  // ------------------------------------------------------------------
  // A) FREE cannot receive PRO fields; PRO receives full validated payload.
  // ------------------------------------------------------------------
  {
    const pro = presentExplanation(validPayload, "pro");
    const free = presentExplanation(validPayload, "free");
    check(
      "PRO view is the full validated payload (plan/summary/keyFactors/modelReading)",
      pro.plan === "pro" &&
        pro.summary === validPayload.summary &&
        pro.keyFactors.length === validPayload.key_factors.length &&
        pro.modelReading === validPayload.model_reading,
    );
    check(
      "FREE view exposes ONLY plan + summary",
      JSON.stringify(Object.keys(free).sort()) === JSON.stringify(["plan", "summary"]),
      `got keys ${Object.keys(free)}`,
    );
    check(
      "FREE cannot receive PRO fields",
      !("keyFactors" in free) && !("modelReading" in free),
    );
    check(
      "PRO payload round-trips through the strict schema",
      predictionExplanationPayloadSchema.safeParse(validPayload).success,
    );
  }

  // ------------------------------------------------------------------
  // B) Read path: persisted read, never writes, never fabricates.
  // ------------------------------------------------------------------
  {
    const missing = fakeRepo(null);
    const missingResult = await readPersistedExplanation(
      { repo: missing.repo },
      { predictionId: 3 },
    );
    check(
      "missing persisted explanation returns null (does not fabricate)",
      missingResult === null,
      `got ${JSON.stringify(missingResult)}`,
    );
    check(
      "missing read issues exactly one SELECT",
      missing.reads() === 1,
      `reads=${missing.reads()}`,
    );

    const present = fakeRepo(validPayload);
    const presentResult = await readPersistedExplanation(
      { repo: present.repo },
      { predictionId: 3 },
    );
    check(
      "persisted explanation is read back unchanged",
      presentResult !== null &&
        presentResult.summary === validPayload.summary &&
        presentResult.key_factors.length === validPayload.key_factors.length &&
        presentResult.model_reading === validPayload.model_reading,
    );
  }

  // ------------------------------------------------------------------
  // C) Corrupt row: read path rejects out-of-schema payloads (strict).
  // ------------------------------------------------------------------
  {
    const corrupt = fakeRepo({
      summary: validPayload.summary,
      key_factors: validPayload.key_factors,
      model_reading: validPayload.model_reading,
      provenance: "gemini internal detail that must not leak",
    } as unknown as PredictionExplanationPayload);
    const corruptResult = await readPersistedExplanation(
      { repo: corrupt.repo },
      { predictionId: 3 },
    );
    check(
      "row with unknown keys is rejected by the strict read schema",
      corruptResult === null,
      `got ${JSON.stringify(corruptResult)}`,
    );
  }

  // ------------------------------------------------------------------
  // D) Server-side plan gating (pure), fail-closed.
  // ------------------------------------------------------------------
  {
    const cases: Array<{ result: ProfileResult; allowed: boolean; reason?: string }> = [
      { result: { status: "ok", profile: { userId: "u", role: "premium" } }, allowed: true },
      { result: { status: "ok", profile: { userId: "u", role: "free" } }, allowed: false, reason: "free" },
      { result: { status: "missing" }, allowed: false, reason: "missing" },
      { result: { status: "error", message: "boom" }, allowed: false, reason: "error" },
    ];
    for (const c of cases) {
      const access = resolvePremiumAccess(c.result);
      const gateOk =
        access.allowed === c.allowed &&
        (access.allowed || (c.reason !== undefined && access.reason === c.reason));
      check(
        `plan gate ${c.reason ?? "premium"}: allowed=${c.allowed}`,
        gateOk,
        `got ${JSON.stringify(access)}`,
      );
    }
  }

  // ------------------------------------------------------------------
  // E) Public copy safety: presented views never carry provider/internal
  //    model/prompt/schema/fingerprint tokens.
  // ------------------------------------------------------------------
  {
    const pro = presentExplanation(validPayload, "pro") as PredictionExplanationView & {
      keyFactors: string[];
      modelReading: string;
    };
    const free = presentExplanation(validPayload, "free");
    const proTokens = scanForbidden(
      JSON.stringify({ summary: pro.summary, keyFactors: pro.keyFactors, modelReading: pro.modelReading }),
    );
    const freeTokens = scanForbidden(JSON.stringify(free));
    check(
      "PRO view contains no provider/internal-model/schema/fingerprint tokens",
      proTokens.length === 0,
      `found ${proTokens}`,
    );
    check(
      "FREE view contains no provider/internal-model/schema/fingerprint tokens",
      freeTokens.length === 0,
      `found ${freeTokens}`,
    );
  }

  // ------------------------------------------------------------------
  // F) Probability display still totals exactly 100.
  // ------------------------------------------------------------------
  {
    const checks = [
      [0.4387, 0.2594, 0.3019],
      [0.4758872135079252, 0.2764942921355626, 0.24761849435651231],
      [44, 30, 30],
    ];
    let ok = true;
    let detail = "";
    for (const [h, d, a] of checks) {
      const p = probabilityPercentages({ home: h, draw: d, away: a });
      if (p.total !== 100 || p.home + p.draw + p.away !== 100) {
        ok = false;
        detail = `${h}/${d}/${a} -> ${JSON.stringify(p)}`;
        break;
      }
    }
    check("probability display still totals 100 on render data", ok, detail);
  }

  // ------------------------------------------------------------------
  // G) DB integration (READ-ONLY): the persisted explanation for
  //    prediction #3 renders; every other prediction renders nothing.
  // ------------------------------------------------------------------
  {
    const repo = createProductionPredictionExplanationRepo();
    const canonical = await getCanonicalPredictionRow(
      TARGET_MATCH_ID,
      DEFAULT_MARKET_ID,
      DEFAULT_MODEL_VERSION_ID,
    );
    check("target match has a canonical prediction", canonical !== null, `id=${canonical?.id}`);
    if (canonical) {
      const payload = await readPersistedExplanation({ repo }, { predictionId: canonical.id });
      check(
        "target prediction persisted explanation renders (validated payload)",
        payload !== null &&
          payload.summary.length > 0 &&
          payload.key_factors.length >= 2 &&
          payload.key_factors.length <= 4 &&
          payload.model_reading.length > 0,
        `payload=${JSON.stringify(payload)}`,
      );
      if (payload) {
        const tokens = scanForbidden(
          JSON.stringify({ summary: payload.summary, factors: payload.key_factors, reading: payload.model_reading }),
        );
        check(
          "persisted explanation #3 has no provider/internal tokens in public copy",
          tokens.length === 0,
          `found ${tokens}`,
        );
      }
    }

    const rows = await listPredictionRows(50);
    let generatedCount = 0;
    let fabricated = 0;
    for (const row of rows) {
      const payload = await readPersistedExplanation({ repo }, { predictionId: row.id });
      if (payload) generatedCount++;
      const isPredictionThree = canonical !== null && row.id === canonical.id;
      if (payload && !isPredictionThree) fabricated++;
    }
    check(
      "exactly one generated explanation exists (prediction #3 only)",
      generatedCount === 1,
      `generated=${generatedCount}`,
    );
    check(
      "no other prediction fabricates an explanation on the render path",
      fabricated === 0,
      `fabricated=${fabricated}`,
    );
  }

  console.log(`\n[SUMMARY] explanation read UI smoke: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[FATAL] smoke-tests-explanation-read-ui failed", err);
  process.exit(1);
});