import { notFound } from "next/navigation";
import PredictionsHistoryPage from "@/components/sports/predictions/predictions-history-page";
import { ensureDbReady } from "@/lib/db/client";
import { getHasSport } from "@/components/sports/sport-helpers";
import { getCompetitionSelectionState } from "@/lib/db/repositories/active-competition-repo";
import { getMatchesByLeagueSeason } from "@/lib/db/repositories/matches-repo";
import { getTeamsByIds } from "@/lib/db/repositories/teams-repo";
import {
  getPredictionsHistoryBatch,
  PredictionReadError,
  type PredictionsHistory,
} from "@/lib/db/repositories/predictions-repo";
import { summarizeEvaluations } from "@/lib/ai/evaluation-service";
import { parseSportId } from "@/lib/config/validation";

// Página de SOLO LECTURA: muestra predicciones persistidas pre-kickoff y su
// evaluación cuando el partido terminó. Nunca genera predicciones ni ejecuta
// el modelo (eso ocurre solo vía servicio explícito server-side).
// Scope: solo la competición/temporada activa (igual que resto de páginas).
export default async function PredictionsRoute({
  params,
}: {
  params: Promise<{ sport: string }>;
}) {
  const { sport } = await params;
  if (!parseSportId(sport)) notFound();
  const has = getHasSport(sport);
  if (!has) notFound();
  await ensureDbReady();

  // Sin JSX dentro del try: solo lectura de datos (el lint react-hooks lo
  // exige porque los errores de render no se capturan con try/catch).
  let history: PredictionsHistory | null = null;
  let loadError: string | null = null;
  try {
    const { active } = await getCompetitionSelectionState(sport);
    const leagueId = active?.league.id;
    const seasonId = active?.season.id;
    const scopeMatchIds =
      leagueId && seasonId
        ? (await getMatchesByLeagueSeason(leagueId, seasonId)).map((m) => m.id)
        : [];
    history = await getPredictionsHistoryBatch(
      50,
      async (ids) => getTeamsByIds(ids),
      { matchIds: scopeMatchIds },
    );
  } catch (err) {
    // Estado de error seguro: mensaje genérico, sin SQL ni secretos.
    // El detalle real queda en el log server-side (predictions-repo).
    if (err instanceof PredictionReadError) {
      loadError =
        "No se pudo cargar el historial de predicciones. Intentá de nuevo más tarde.";
    } else {
      throw err;
    }
  }

  return (
    <PredictionsHistoryPage
      sport={sport}
      rows={history?.rows ?? []}
      summary={history?.summary ?? summarizeEvaluations([])}
      error={loadError}
    />
  );
}
