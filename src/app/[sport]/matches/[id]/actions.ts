"use server";

import "server-only";
import { headers } from "next/headers";
import { generateMatchAnalysis, predictMatch } from "@/lib/services/ai-service";
import { getMatchById } from "@/lib/db/repositories/matches-repo";
import { parseSportId, parseEntityId } from "@/lib/config/validation";
import {
  checkAiRateLimit,
  getClientIp,
  AiRateLimitExceededError,
} from "@/lib/ai/rate-limiter";
import { AiFeatureUnavailableError } from "@/lib/ai/ai-guard";
import type { SportId } from "@/types/core/sport";
import {
  runGenerateUpcomingPrediction,
  runGenerateProbableLineup,
  runGeneratePredictionExplanation,
  GENERIC_ERROR,
  RATE_LIMIT_ERROR,
  AUTH_REQUIRED_ERROR,
  PRO_REQUIRED_ERROR,
} from "@/lib/services/match-generation-actions";
import { resolveActionAccess } from "@/lib/auth/session";

export type {
  GeneratedUpcomingPrediction,
  UpcomingPredictionActionResult,
  ProbableLineupActionResult,
  PredictionExplanationActionResult,
} from "@/lib/services/match-generation-actions";

const UNAVAILABLE_ERROR =
  "La funcionalidad de IA no está disponible en este momento. Intentá de nuevo más tarde.";

// Las páginas ya NO generan AI en el render del servidor: la AI se
// solicita on-demand desde componentes client mediante estas Server
// Actions, protegidas por rate limit por IP.
//
// Radiografía ("match-analysis") es PRO-only: el rol se resuelve server-side
// desde profiles y el rechazo ocurre ANTES del rate limit y de cualquier
// llamada al proveedor.
export async function actionAnalyzeMatch(
  sportId: SportId,
  matchId: string,
) {
  if (!parseSportId(sportId) || !parseEntityId(matchId)) {
    return {
      ok: false as const,
      error: "sportId y matchId son requeridos.",
    };
  }
  const access = await resolveActionAccess();
  if (access.status === "anonymous") {
    return { ok: false as const, error: AUTH_REQUIRED_ERROR };
  }
  if (access.role !== "premium") {
    return { ok: false as const, error: PRO_REQUIRED_ERROR };
  }
  const h = await headers();
  const clientKey = getClientIp(h);
  try {
    checkAiRateLimit("match-analysis", clientKey);
  } catch (err) {
    if (err instanceof AiRateLimitExceededError) {
      console.warn("[AI] rate-limited action=match-analysis");
      return { ok: false as const, error: RATE_LIMIT_ERROR };
    }
    throw err;
  }
  const m = await getMatchById(matchId);
  if (!m) {
    return { ok: false as const, error: "Partido no encontrado." };
  }
  try {
    const res = await generateMatchAnalysis(sportId, matchId);
    return { ok: true as const, data: res };
  } catch (err) {
    if (err instanceof AiFeatureUnavailableError) {
      return { ok: false as const, error: UNAVAILABLE_ERROR };
    }
    console.warn(`[action] actionAnalyzeMatch failed (${sportId}/${matchId})`, err);
    return { ok: false as const, error: GENERIC_ERROR };
  }
}

export async function actionPredictMatch(
  sportId: SportId,
  leagueId: string,
  seasonId: string,
  matchId: string,
) {
  if (
    !parseSportId(sportId) ||
    !parseEntityId(leagueId) ||
    !parseEntityId(seasonId) ||
    !parseEntityId(matchId)
  ) {
    return { ok: false as const, error: "Parámetros incompletos." };
  }
  const access = await resolveActionAccess();
  if (access.status === "anonymous") {
    return { ok: false as const, error: AUTH_REQUIRED_ERROR };
  }
  const h = await headers();
  const clientKey = getClientIp(h);
  try {
    checkAiRateLimit("match-prediction", clientKey);
  } catch (err) {
    if (err instanceof AiRateLimitExceededError) {
      console.warn("[AI] rate-limited action=match-prediction");
      return { ok: false as const, error: RATE_LIMIT_ERROR };
    }
    throw err;
  }
  try {
    const data = await predictMatch(
      sportId,
      leagueId,
      seasonId,
      matchId,
    );
    return { ok: true as const, data };
  } catch (err) {
    if (err instanceof AiFeatureUnavailableError) {
      return { ok: false as const, error: UNAVAILABLE_ERROR };
    }
    console.warn(`[action] actionPredictMatch failed (${sportId}/${matchId})`, err);
    return { ok: false as const, error: GENERIC_ERROR };
  }
}

/**
 * Thin Server Action wrapper. Authorization (authenticated user required),
 * rate limit, eligibility, generation and persistence all live in the
 * testable core, which enforces the strict order:
 * auth → rate limit → eligibility → generation → persistence.
 * The public signature stays unchanged so a caller cannot inject deps.
 */
export async function actionGenerateUpcomingPrediction(
  sportId: SportId,
  matchId: string,
) {
  const h = await headers();
  return runGenerateUpcomingPrediction(sportId, matchId, { clientKey: getClientIp(h) });
}

/**
 * Thin Server Action wrapper. Authorization (authenticated user required),
 * rate limit, official/future/evidence eligibility, deterministic generation
 * and immutable persistence live in the testable core.
 */
export async function actionGenerateProbableLineup(
  sportId: SportId,
  matchId: string,
) {
  const h = await headers();
  return runGenerateProbableLineup(sportId, matchId, { clientKey: getClientIp(h) });
}

/**
 * Thin Server Action wrapper. PRO-only authorization, rate limit, eligibility,
 * reuse-before-generate and persistence live in the testable core. The PRO
 * presentation is only produced after the server-side entitlement check.
 */
export async function actionGeneratePredictionExplanation(
  sportId: SportId,
  matchId: string,
) {
  const h = await headers();
  return runGeneratePredictionExplanation(sportId, matchId, { clientKey: getClientIp(h) });
}
