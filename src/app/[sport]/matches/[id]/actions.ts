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

const GENERIC_ERROR =
  "No se pudo generar el análisis. Intentá de nuevo en unos segundos.";

const UNAVAILABLE_ERROR =
  "La funcionalidad de IA no está disponible en este momento. Intentá de nuevo más tarde.";

const RATE_LIMIT_ERROR =
  "Demasiadas solicitudes. Esperá unos segundos antes de intentar de nuevo.";

// Las páginas ya NO generan AI en el render del servidor: la AI se
// solicita on-demand desde componentes client mediante estas Server
// Actions, protegidas por rate limit por IP.
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