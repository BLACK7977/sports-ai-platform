import "server-only";
import { generateMatchAnalysis, predictMatch } from "@/lib/services/ai-service";
import { getMatchById } from "@/lib/db/repositories/matches-repo";
import { parseSportId, parseEntityId } from "@/lib/config/validation";
import type { SportId } from "@/types/core/sport";

const GENERIC_ERROR =
  "No se pudo generar el análisis. Intentá de nuevo en unos segundos.";

// MVP simple: Server Actions con "use server". Si Next 16 rompe algo,
// las páginas llaman directamente a los services en el server render.
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
  const m = await getMatchById(matchId);
  if (!m) {
    return { ok: false as const, error: "Partido no encontrado." };
  }
  try {
    const res = await generateMatchAnalysis(sportId, matchId);
    return { ok: true as const, data: res };
  } catch (err) {
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
  try {
    const data = await predictMatch(
      sportId,
      leagueId,
      seasonId,
      matchId,
    );
    return { ok: true as const, data };
  } catch (err) {
    console.warn(`[action] actionPredictMatch failed (${sportId}/${matchId})`, err);
    return { ok: false as const, error: GENERIC_ERROR };
  }
}
