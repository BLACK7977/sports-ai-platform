// Server-only enforcement
import "@/lib/config/env";
import { generateMatchAnalysis, predictMatch } from "@/lib/services/ai-service";
import { getMatchById } from "@/lib/db/repositories/matches-repo";
import type { SportId } from "@/types/core/sport";

// MVP simple: Server Actions con "use server". Si Next 16 rompe algo,
// las páginas llaman directamente a los services en el server render.
export async function actionAnalyzeMatch(
  sportId: SportId,
  matchId: string,
) {
  if (!sportId || !matchId) {
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
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function actionPredictMatch(
  sportId: SportId,
  leagueId: string,
  seasonId: string,
  matchId: string,
) {
  if (!sportId || !leagueId || !seasonId || !matchId) {
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
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
