import "server-only";
import { getMatchById, isFutureScheduledMatch } from "@/lib/db/repositories/matches-repo";
import { parseSportId, parseEntityId } from "@/lib/config/validation";
import {
  checkAiRateLimit,
  AiRateLimitExceededError,
} from "@/lib/ai/rate-limiter";
import { createProductionPredictionStore } from "@/lib/db/repositories/prediction-store";
import { createRealModelRunner } from "@/lib/ai/prediction-runner";
import {
  DEFAULT_MARKET_ID,
  DEFAULT_MODEL_VERSION_ID,
  previewPrediction,
  persistPredictionPreview,
  PredictionServiceError,
  PredictionErrorCodes,
  type StoredPrediction,
} from "@/lib/ai/prediction-service";
import type { Match } from "@/types/db/tables";
import type { SportId } from "@/types/core/sport";
import type { ProbableLineupTeamView } from "@/lib/types/probable-lineup";
import { createProductionProbableLineupStore } from "@/lib/db/repositories/probable-lineup-store";
import {
  DEFAULT_PROBABLE_LINEUP_MODEL_VERSION,
  generateProbableLineups,
  ProbableLineupErrorCodes,
  ProbableLineupServiceError,
  storedProbableLineupView,
  type ProbableLineupStore,
} from "@/lib/services/probable-lineup-service";
import {
  generatePredictionExplanation,
  type ExplanationServiceDeps,
} from "@/lib/services/prediction-explanation-service";
import { createProductionPredictionExplanationRepo } from "@/lib/db/repositories/prediction-explanation-repo";
import { createGeminiExplanationProvider } from "@/lib/ai/providers/gemini-provider";
import { getEnv } from "@/lib/config/env";
import { getCanonicalPredictionRow } from "@/lib/db/repositories/predictions-repo";
import { getTeamsByIds } from "@/lib/db/repositories/teams-repo";
import { getLeagueById } from "@/lib/db/repositories/leagues-repo";
import {
  presentExplanation,
  type PredictionExplanationView,
} from "@/lib/types/prediction-explanation";
import { resolveActionAccess, type SessionAuthClient } from "@/lib/auth/session";

/**
 * Testable core of the match generation Server Actions.
 *
 * The exported Server Actions in
 * `src/app/[sport]/matches/[id]/actions.ts` are thin wrappers: they read the
 * request headers, compute the client key and delegate here. Keeping the
 * orchestration in this non-"use server" module means the authorization gate
 * and its strict ordering can be exercised offline with injected mocks, while
 * the public action signature stays exactly as before (a client cannot inject
 * any dependency).
 *
 * SECURITY INVARIANT — effective order is ALWAYS:
 *   request → server-side auth/entitlement → rate limit → eligibility
 *   → generation/service → persistence → server-side presentation
 * Unauthorized requests terminate before any expensive work, provider call or
 * DB write.
 */

export const GENERIC_ERROR =
  "No se pudo generar el análisis. Intentá de nuevo en unos segundos.";

export const RATE_LIMIT_ERROR =
  "Demasiadas solicitudes. Esperá unos segundos antes de intentar de nuevo.";

export const AUTH_REQUIRED_ERROR = "Iniciá sesión para continuar.";

export const PRO_REQUIRED_ERROR =
  "Esta función está disponible con el plan Pro de SPORTS AI.";

// --------------------------------------------------------------------------
// Result types (re-exported by the action module to preserve imports)
// --------------------------------------------------------------------------

export type GeneratedUpcomingPrediction = {
  probabilities: { home: number; draw: number; away: number };
  expectedGoals: { home: number; away: number } | null;
  predictedAt: string;
};

export type UpcomingPredictionActionResult =
  | { ok: true; prediction: GeneratedUpcomingPrediction; generated: boolean }
  | {
      ok: false;
      code: "UNAUTHORIZED" | "UNAVAILABLE" | "RATE_LIMIT" | "GENERIC";
      error: string;
    };

export type ProbableLineupActionResult =
  | { ok: true; teams: ProbableLineupTeamView[]; generated: boolean }
  | {
      ok: false;
      code: "UNAUTHORIZED" | "UNAVAILABLE" | "RATE_LIMIT" | "GENERIC";
      error: string;
    };

export type PredictionExplanationActionResult =
  | {
      ok: true;
      explanation: PredictionExplanationView;
      generated: boolean;
      reused: boolean;
    }
  | {
      ok: false;
      code:
        | "UNAUTHORIZED"
        | "PRO_REQUIRED"
        | "UNAVAILABLE"
        | "RATE_LIMIT"
        | "GENERIC"
        | "NO_PREDICTION";
      error: string;
    };

// --------------------------------------------------------------------------
// Injected dependencies (production defaults when omitted)
// --------------------------------------------------------------------------

export interface ExplanationActionDeps {
  authClient?: SessionAuthClient;
  clientKey: string;
  getMatch?: (matchId: string) => Promise<Match | null>;
  getCanonicalPrediction?: typeof getCanonicalPredictionRow;
  getTeams?: typeof getTeamsByIds;
  getLeague?: typeof getLeagueById;
  serviceDeps?: ExplanationServiceDeps;
}

export interface UpcomingPredictionActionDeps {
  authClient?: SessionAuthClient;
  clientKey: string;
  getMatch?: (matchId: string) => Promise<Match | null>;
  nowMs?: () => number;
  preview?: typeof previewPrediction;
  persist?: typeof persistPredictionPreview;
}

export interface ProbableLineupActionDeps {
  authClient?: SessionAuthClient;
  clientKey: string;
  getMatch?: (matchId: string) => Promise<Match | null>;
  nowMs?: () => number;
  store?: ProbableLineupStore;
  generate?: typeof generateProbableLineups;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function serializePrediction(p: StoredPrediction): GeneratedUpcomingPrediction | null {
  const probs = p.model_probabilities as unknown as Record<string, unknown> | null;
  const home = typeof probs?.home === "number" ? probs.home : Number.NaN;
  const draw = typeof probs?.draw === "number" ? probs.draw : Number.NaN;
  const away = typeof probs?.away === "number" ? probs.away : Number.NaN;
  if (![home, draw, away].every((value) => Number.isFinite(value))) return null;
  const snapshot = (p.data_snapshot ?? {}) as Record<string, unknown>;
  const xg = snapshot.expectedGoals as Record<string, unknown> | null;
  const homeXg = typeof xg?.home === "number" ? xg.home : null;
  const awayXg = typeof xg?.away === "number" ? xg.away : null;
  return {
    probabilities: { home, draw, away },
    expectedGoals: homeXg !== null && awayXg !== null ? { home: homeXg, away: awayXg } : null,
    predictedAt: p.predicted_at,
  };
}

function numericOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// --------------------------------------------------------------------------
// Explanations (PRO-only generation)
// --------------------------------------------------------------------------

/**
 * Authorized, rate-limited on-demand generation of a persisted explanation
 * for an existing canonical prediction.
 *
 * Authorization is enforced BEFORE the rate limit and before any eligibility
 * read, provider call or DB write:
 *   - anonymous       → UNAUTHORIZED (0 provider calls, 0 writes)
 *   - authenticated free → PRO_REQUIRED (0 provider calls, 0 writes)
 *   - authenticated PRO  → allowed subject to the existing rate limit
 */
export async function runGeneratePredictionExplanation(
  sportId: SportId,
  matchId: string,
  deps: ExplanationActionDeps,
): Promise<PredictionExplanationActionResult> {
  if (!parseSportId(sportId) || !parseEntityId(matchId)) {
    return { ok: false as const, code: "GENERIC" as const, error: "Parámetros inválidos." };
  }

  const access = await resolveActionAccess(deps.authClient);
  if (access.status === "anonymous") {
    return { ok: false as const, code: "UNAUTHORIZED" as const, error: AUTH_REQUIRED_ERROR };
  }
  if (access.role !== "premium") {
    return { ok: false as const, code: "PRO_REQUIRED" as const, error: PRO_REQUIRED_ERROR };
  }

  try {
    checkAiRateLimit("explanation", deps.clientKey);
  } catch (err) {
    if (err instanceof AiRateLimitExceededError) {
      console.warn("[AI] rate-limited action=generate-prediction-explanation");
      return { ok: false as const, code: "RATE_LIMIT" as const, error: RATE_LIMIT_ERROR };
    }
    throw err;
  }

  const getMatch = deps.getMatch ?? getMatchById;
  const getCanonicalPrediction = deps.getCanonicalPrediction ?? getCanonicalPredictionRow;
  const getTeams = deps.getTeams ?? getTeamsByIds;
  const getLeague = deps.getLeague ?? getLeagueById;

  const m = await getMatch(matchId);
  if (!m) {
    return { ok: false as const, code: "UNAVAILABLE" as const, error: "Partido no encontrado." };
  }
  try {
    const canonical = await getCanonicalPrediction(
      matchId,
      DEFAULT_MARKET_ID,
      DEFAULT_MODEL_VERSION_ID,
    );
    if (!canonical) {
      return {
        ok: false as const,
        code: "NO_PREDICTION" as const,
        error: "Aún no hay una predicción persistida para este partido; primero generá el análisis SPORTS AI.",
      };
    }
    const probs = canonical.model_probabilities;
    const home = numericOrNull((probs as Record<string, unknown> | null)?.home);
    const draw = numericOrNull((probs as Record<string, unknown> | null)?.draw);
    const away = numericOrNull((probs as Record<string, unknown> | null)?.away);
    if (home === null || draw === null || away === null) {
      return { ok: false as const, code: "UNAVAILABLE" as const, error: "La predicción persistida no es válida para explicarse." };
    }
    const snapshot = (canonical.data_snapshot ?? {}) as Record<string, unknown>;
    const xg = snapshot.expectedGoals as Record<string, unknown> | null;
    const expectedGoals =
      numericOrNull(xg?.home) !== null && numericOrNull(xg?.away) !== null
        ? { home: numericOrNull(xg?.home) as number, away: numericOrNull(xg?.away) as number }
        : null;
    const dq = snapshot.dataQuality as Record<string, unknown> | null;
    const dataQuality =
      numericOrNull(dq?.homeMatchesUsed) !== null &&
      numericOrNull(dq?.awayMatchesUsed) !== null &&
      numericOrNull(dq?.leagueMatchesUsed) !== null
        ? {
            homeMatchesUsed: numericOrNull(dq?.homeMatchesUsed) as number,
            awayMatchesUsed: numericOrNull(dq?.awayMatchesUsed) as number,
            leagueMatchesUsed: numericOrNull(dq?.leagueMatchesUsed) as number,
          }
        : null;

    const [teams, league] = await Promise.all([
      getTeams([m.home_team_id, m.away_team_id]),
      m.league_id ? getLeague(m.league_id) : Promise.resolve(null),
    ]);
    const teamNames = new Map(teams.map((t) => [t.id, t.name]));

    const serviceDeps: ExplanationServiceDeps = deps.serviceDeps ?? (() => {
      const env = getEnv();
      return {
        repo: createProductionPredictionExplanationRepo(),
        provider: createGeminiExplanationProvider(),
        modelName: env.GEMINI_MODEL,
        apiKey: env.GEMINI_API_KEY,
      };
    })();

    const result = await generatePredictionExplanation(serviceDeps, {
      predictionId: canonical.id,
      matchId,
      homeTeamId: m.home_team_id,
      awayTeamId: m.away_team_id,
      homeTeamName: teamNames.get(m.home_team_id) ?? m.home_team_id,
      awayTeamName: teamNames.get(m.away_team_id) ?? m.away_team_id,
      competition: league?.name ?? m.league_id ?? sportId,
      kickoffAt: canonical.kickoff_at,
      marketId: canonical.market_id,
      modelVersionId: canonical.model_version_id,
      probabilities: { home, draw, away },
      expectedGoals,
      dataQuality,
    });
    if (!result.ok) {
      return {
        ok: false as const,
        code: "UNAVAILABLE" as const,
        error: "La explicación no está disponible en este momento. Intentá de nuevo más tarde.",
      };
    }
    const view = presentExplanation(result.explanation, "pro");
    return {
      ok: true as const,
      explanation: view,
      generated: result.generated,
      reused: !result.generated,
    };
  } catch (err) {
    console.warn(`[action] actionGeneratePredictionExplanation failed (${sportId}/${matchId})`, err);
    return { ok: false as const, code: "GENERIC" as const, error: GENERIC_ERROR };
  }
}

// --------------------------------------------------------------------------
// Upcoming prediction (any authenticated user)
// --------------------------------------------------------------------------

/**
 * On-demand + persistence prediction for an upcoming scheduled match.
 *
 * Authorization: anonymous → UNAUTHORIZED before the rate limit, eligibility
 * read, model run or write. Authenticated users (free or premium) keep the
 * current product behavior, subject to the existing rate limit.
 *
 * Server-side only (service role never leaves the server). Revalidates
 * eligibility on every request, runs ONLY the production mathematical model
 * (never Sportmonks, never LLM, no synthetic odds) and persists a single
 * canonical prediction. Concurrent duplicates are rejected by the DB
 * UNIQUE(match_id, market_id, model_version_id) and the race-safe
 * PredictionStore re-read. No UPDATE / DELETE. Insufficient model inputs
 * return a neutral unavailable state without writing.
 */
export async function runGenerateUpcomingPrediction(
  sportId: SportId,
  matchId: string,
  deps: UpcomingPredictionActionDeps,
): Promise<UpcomingPredictionActionResult> {
  if (!parseSportId(sportId) || !parseEntityId(matchId)) {
    return { ok: false as const, code: "GENERIC" as const, error: "Parámetros inválidos." };
  }

  const access = await resolveActionAccess(deps.authClient);
  if (access.status === "anonymous") {
    return { ok: false as const, code: "UNAUTHORIZED" as const, error: AUTH_REQUIRED_ERROR };
  }

  try {
    checkAiRateLimit("match-prediction", deps.clientKey);
  } catch (err) {
    if (err instanceof AiRateLimitExceededError) {
      console.warn("[AI] rate-limited action=generate-upcoming-prediction");
      return { ok: false as const, code: "RATE_LIMIT" as const, error: RATE_LIMIT_ERROR };
    }
    throw err;
  }

  const getMatch = deps.getMatch ?? getMatchById;
  const nowMs = deps.nowMs ?? (() => Date.now());

  const m = await getMatch(matchId);
  if (!m) {
    return { ok: false as const, code: "UNAVAILABLE" as const, error: "Partido no encontrado." };
  }
  if (!isFutureScheduledMatch(m, nowMs())) {
    return { ok: false as const, code: "UNAVAILABLE" as const, error: "Este partido ya no puede analizarse." };
  }
  try {
    const serviceDeps = {
      store: createProductionPredictionStore(),
      runModel: createRealModelRunner(),
      nowMs,
    };
    const preview = await (deps.preview ?? previewPrediction)(serviceDeps, {
      matchId,
      marketId: DEFAULT_MARKET_ID,
      modelVersionId: DEFAULT_MODEL_VERSION_ID,
    });
    if (!preview.created) {
      const existing = serializePrediction(preview.prediction);
      if (!existing) {
        return { ok: false as const, code: "UNAVAILABLE" as const, error: "La predicción guardada no es válida para mostrarse." };
      }
      return { ok: true as const, prediction: existing, generated: false };
    }
    if (preview.run.usedFallback) {
      return { ok: false as const, code: "UNAVAILABLE" as const, error: "Aún no hay suficientes datos del modelo para este partido." };
    }
    const persisted = await (deps.persist ?? persistPredictionPreview)(serviceDeps, preview);
    const serialized = serializePrediction(persisted.prediction);
    if (!serialized) {
      return { ok: false as const, code: "UNAVAILABLE" as const, error: "La predicción generada no pudo verificarse." };
    }
    return { ok: true as const, prediction: serialized, generated: persisted.created };
  } catch (err) {
    if (err instanceof PredictionServiceError) {
      const unavailableCodes = [
        PredictionErrorCodes.MATCH_NOT_FOUND,
        PredictionErrorCodes.INVALID_KICKOFF,
        PredictionErrorCodes.KICKOFF_PASSED,
        PredictionErrorCodes.MODEL_NOT_FOUND,
        PredictionErrorCodes.MODEL_INACTIVE,
        PredictionErrorCodes.MODEL_PARAM_MISMATCH,
        PredictionErrorCodes.MARKET_NOT_FOUND,
        PredictionErrorCodes.INVALID_PROBABILITIES,
      ];
      if (unavailableCodes.includes(err.code as (typeof unavailableCodes)[number])) {
        return { ok: false as const, code: "UNAVAILABLE" as const, error: "El análisis no está disponible para este partido." };
      }
    }
    console.warn(`[action] actionGenerateUpcomingPrediction failed (${sportId}/${matchId})`, err);
    return { ok: false as const, code: "GENERIC" as const, error: GENERIC_ERROR };
  }
}

// --------------------------------------------------------------------------
// Probable lineup (any authenticated user)
// --------------------------------------------------------------------------

/**
 * On-demand probable lineup for an upcoming scheduled match without an
 * official lineup yet.
 *
 * Authorization: anonymous → UNAUTHORIZED before the rate limit, model run or
 * write. Authenticated users (free or premium) keep the current product
 * behavior, subject to the existing rate limit.
 *
 * Server-side only (service role never leaves the server). Revalidates every
 * request: match scheduled, kickoff future, official lineup still absent,
 * canonical probable lineup not already persisted, sufficient evidence.
 * Generates probable XIs for BOTH teams from persisted official historical
 * data and persists canonical immutable runs. Races reuse the canonical
 * result; nothing is ever regenerated or overwritten. Probable lineups are
 * NEVER written to match_lineups.
 */
export async function runGenerateProbableLineup(
  sportId: SportId,
  matchId: string,
  deps: ProbableLineupActionDeps,
): Promise<ProbableLineupActionResult> {
  if (!parseSportId(sportId) || !parseEntityId(matchId)) {
    return { ok: false as const, code: "GENERIC" as const, error: "Parámetros inválidos." };
  }

  const access = await resolveActionAccess(deps.authClient);
  if (access.status === "anonymous") {
    return { ok: false as const, code: "UNAUTHORIZED" as const, error: AUTH_REQUIRED_ERROR };
  }

  try {
    checkAiRateLimit("probable-lineup", deps.clientKey);
  } catch (err) {
    if (err instanceof AiRateLimitExceededError) {
      console.warn("[AI] rate-limited action=generate-probable-lineup");
      return { ok: false as const, code: "RATE_LIMIT" as const, error: RATE_LIMIT_ERROR };
    }
    throw err;
  }

  const getMatch = deps.getMatch ?? getMatchById;
  const nowMs = deps.nowMs ?? (() => Date.now());

  const m = await getMatch(matchId);
  if (!m) {
    return { ok: false as const, code: "UNAVAILABLE" as const, error: "Partido no encontrado." };
  }
  if (!isFutureScheduledMatch(m, nowMs())) {
    return { ok: false as const, code: "UNAVAILABLE" as const, error: "El partido ya no admite predicción de alineación." };
  }
  try {
    const store = deps.store ?? createProductionProbableLineupStore();
    const generate = deps.generate ?? generateProbableLineups;
    const result = await generate(
      { store },
      {
        matchId,
        modelVersion: DEFAULT_PROBABLE_LINEUP_MODEL_VERSION,
        nowMs: nowMs(),
      },
    );
    return {
      ok: true as const,
      teams: result.teams.map((run) => storedProbableLineupView(run)),
      generated: result.created,
    };
  } catch (err) {
    if (err instanceof ProbableLineupServiceError) {
      const unavailableCodes = [
        ProbableLineupErrorCodes.MATCH_NOT_FOUND,
        ProbableLineupErrorCodes.MATCH_INVALID,
        ProbableLineupErrorCodes.MATCH_NOT_SCHEDULED,
        ProbableLineupErrorCodes.KICKOFF_PASSED,
        ProbableLineupErrorCodes.INSUFFICIENT_EVIDENCE,
      ];
      if (unavailableCodes.includes(err.code as (typeof unavailableCodes)[number])) {
        return {
          ok: false as const,
          code: "UNAVAILABLE" as const,
          error: err.code === ProbableLineupErrorCodes.INSUFFICIENT_EVIDENCE
            ? "Aún no hay suficientes datos de alineaciones oficiales recientes para este partido."
            : "La predicción de alineación no está disponible para este partido.",
        };
      }
      if (err.code === ProbableLineupErrorCodes.OFFICIAL_PRESENT) {
        return {
          ok: false as const,
          code: "UNAVAILABLE" as const,
          error: "Ya se publicó la alineación oficial; no se genera una alineación probable.",
        };
      }
    }
    console.warn(`[action] actionGenerateProbableLineup failed (${sportId}/${matchId})`, err);
    return { ok: false as const, code: "GENERIC" as const, error: GENERIC_ERROR };
  }
}
