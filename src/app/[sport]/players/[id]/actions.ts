"use server";

import "server-only";
import { headers } from "next/headers";
import { generatePlayerReport } from "@/lib/services/ai-service";
import { getPlayerById } from "@/lib/db/repositories/players-repo";
import { parseSportId, parseEntityId } from "@/lib/config/validation";
import {
  checkAiRateLimit,
  getClientIp,
  AiRateLimitExceededError,
} from "@/lib/ai/rate-limiter";
import { AiFeatureUnavailableError } from "@/lib/ai/ai-guard";
import type { SportId } from "@/types/core/sport";

const GENERIC_ERROR =
  "No se pudo generar el informe del jugador. Intentá de nuevo en unos segundos.";

const UNAVAILABLE_ERROR =
  "La funcionalidad de IA no está disponible en este momento. Intentá de nuevo más tarde.";

const RATE_LIMIT_ERROR =
  "Demasiadas solicitudes. Esperá unos segundos antes de intentar de nuevo.";

// El informe se genera on-demand desde un componente client (nunca en el
// render SSR de la página), protegido por rate limit por IP.
export async function actionGeneratePlayerReport(
  sportId: SportId,
  leagueId: string,
  seasonId: string,
  playerId: string,
) {
  if (
    !parseSportId(sportId) ||
    !parseEntityId(leagueId) ||
    !parseEntityId(seasonId) ||
    !parseEntityId(playerId)
  ) {
    return {
      ok: false as const,
      error: "sportId, leagueId, seasonId y playerId requeridos.",
    };
  }
  const h = await headers();
  const clientKey = getClientIp(h);
  try {
    checkAiRateLimit("player-report", clientKey);
  } catch (err) {
    if (err instanceof AiRateLimitExceededError) {
      console.warn("[AI] rate-limited action=player-report");
      return { ok: false as const, error: RATE_LIMIT_ERROR };
    }
    throw err;
  }
  const p = await getPlayerById(playerId);
  if (!p) {
    return { ok: false as const, error: "Jugador no encontrado." };
  }
  try {
    const data = await generatePlayerReport(
      sportId,
      leagueId,
      seasonId,
      playerId,
    );
    return { ok: true as const, data };
  } catch (err) {
    if (err instanceof AiFeatureUnavailableError) {
      return { ok: false as const, error: UNAVAILABLE_ERROR };
    }
    console.warn(`[action] actionGeneratePlayerReport failed (${sportId}/${playerId})`, err);
    return { ok: false as const, error: GENERIC_ERROR };
  }
}