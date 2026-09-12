// Server-only enforcement
import "@/lib/config/env";
import { generatePlayerReport } from "@/lib/services/ai-service";
import { getPlayerById } from "@/lib/db/repositories/players-repo";
import type { SportId } from "@/types/core/sport";

export async function actionGeneratePlayerReport(
  sportId: SportId,
  leagueId: string,
  seasonId: string,
  playerId: string,
) {
  if (!sportId || !leagueId || !seasonId || !playerId) {
    return {
      ok: false as const,
      error: "sportId, leagueId, seasonId y playerId requeridos.",
    };
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
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
