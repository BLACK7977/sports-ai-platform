import { notFound } from "next/navigation";
import MatchDetailPage from "@/components/sports/matches/match-detail-page";
import { ensureDbReady } from "@/lib/db/client";
import { getHasSport } from "@/components/sports/sport-helpers";
import { getMatchById, getMatchesByLeagueSeason } from "@/lib/db/repositories/matches-repo";
import { getTeamById, getTeamsByIds } from "@/lib/db/repositories/teams-repo";
import { getLeagueById } from "@/lib/db/repositories/leagues-repo";
import { getStatsByMatchId } from "@/lib/db/repositories/player-stats-repo";
import { getPlayersByIds } from "@/lib/db/repositories/players-repo";
import { getTeamStandings, getPlayerSeasonRanking } from "@/lib/services/statistics-service";
import { parseSportId, parseEntityId, safeDecodeEntityId } from "@/lib/config/validation";
import { getEnrichment, type MatchEnrichment } from "@/lib/services/match-enrichment-service";
import { getCanonicalPredictionRow } from "@/lib/db/repositories/predictions-repo";
import { createProductionPredictionExplanationRepo } from "@/lib/db/repositories/prediction-explanation-repo";
import { readPersistedExplanation } from "@/lib/services/prediction-explanation-service";
import { presentExplanation, type PredictionExplanationView } from "@/lib/types/prediction-explanation";
import { resolveExplanationPlanForRender } from "@/lib/presentation/explanation-availability";
import { getProbableLineupForMatch } from "@/lib/db/repositories/probable-lineups-repo";
import { DEFAULT_MARKET_ID, DEFAULT_MODEL_VERSION_ID } from "@/lib/ai/prediction-service";
import { getPersistedMatchContext } from "@/lib/db/repositories/match-context-repo";

export default async function MatchDetailRoute({
  params,
}: {
  params: Promise<{ sport: string; id: string }>;
}) {
  const { sport, id: rawId } = await params;
  const id = safeDecodeEntityId(rawId);
  if (!id || !parseSportId(sport) || !parseEntityId(id)) notFound();
  const has = getHasSport(sport);
  if (!has) notFound();
  await ensureDbReady();

  const match = await getMatchById(id);
  if (!match) notFound();

  const [home, away, league] = await Promise.all([
    getTeamById(match.home_team_id),
    getTeamById(match.away_team_id),
    getLeagueById(match.league_id),
  ]);
  if (!home || !away) notFound();

  const leagueId = match.league_id;
  const seasonId = match.season_id;

  // El análisis y la predicción AI se generan SOLO on-demand desde
  // componentes client (botones), nunca en el SSR de esta página:
  // así no se consumen tokens de OpenAI por cada request/render.
  const [matchStats, standings, allSeasonMatches, squadRanking, enrichment, canonicalPrediction, probableLineup, matchContext] =
    await Promise.all([
      getStatsByMatchId(id),
      getTeamStandings(sport, leagueId, seasonId),
      getMatchesByLeagueSeason(leagueId, seasonId),
      getPlayerSeasonRanking(sport, leagueId, seasonId),
      getEnrichment(id),
      getCanonicalPredictionRow(id, DEFAULT_MARKET_ID, DEFAULT_MODEL_VERSION_ID),
      getProbableLineupForMatch(id),
      getPersistedMatchContext(id),
    ]);

  const allPlayerIds = [...new Set([
    ...matchStats.map((stat) => stat.player_id),
    ...squadRanking.map((player) => player.playerId),
    ...enrichment.events.flatMap((event) => [event.player_id, event.assist_player_id]),
    ...enrichment.lineups.map((lineup) => lineup.player_id),
  ].filter((id): id is string => Boolean(id)))];
  const allSeasonTeamIds = [...new Set(
    allSeasonMatches.flatMap((seasonMatch) => [seasonMatch.home_team_id, seasonMatch.away_team_id]),
  )];
  const [players, seasonTeams] = await Promise.all([
    getPlayersByIds(allPlayerIds),
    getTeamsByIds(allSeasonTeamIds),
  ]);
  const playerMap = new Map(
    players.map((p) => [p.id, p]),
  );

  // READ-ONLY persisted explanation for the render path. NEVER generates:
  // no provider call from SSR, RSC, page load, refresh or navigation. Missing
  // or unreadable explanation → null → the panel renders the neutral state.
  let explainedView: PredictionExplanationView | null = null;
  if (canonicalPrediction) {
    const [plan, payload] = await Promise.all([
      resolveExplanationPlanForRender(),
      readPersistedExplanation(
        { repo: createProductionPredictionExplanationRepo() },
        { predictionId: canonicalPrediction.id },
      ).catch(() => {
        console.warn(`[match-detail] persisted explanation read failed: ${id}.`);
        return null;
      }),
    ]);
    explainedView = payload ? presentExplanation(payload, plan) : null;
  }

  return (
    <MatchDetailPage
      sport={sport}
      match={match}
      home={home}
      away={away}
      league={league ?? undefined}
      matchStats={matchStats}
      standings={standings}
      allSeasonMatches={allSeasonMatches}
      squadRanking={squadRanking}
      playerMap={playerMap}
      seasonTeams={seasonTeams}
      enrichment={enrichment}
      canonicalPrediction={canonicalPrediction}
      probableLineup={probableLineup}
      matchContext={matchContext}
      explanation={explainedView}
    />
  );
}
