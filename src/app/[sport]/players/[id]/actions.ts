import "server-only";
import { generatePlayerReport } from "@/lib/services/ai-service";
import { getPlayerById } from "@/lib/db/repositories/players-repo";
import { parseSportId, parseEntityId } from "@/lib/config/validation";
import type { SportId } from "@/types/core/sport";

const GENERIC_ERROR =
  "No se pudo generar el informe del jugador. Intentá de nuevo en unos segundos.";

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
    console.warn(`[action] actionGeneratePlayerReport failed (${sportId}/${playerId})`, err);
    return { ok: false as const, error: GENERIC_ERROR };
  }
}
