import { notFound } from "next/navigation";
import MatchDetailPage from "@/components/sports/matches/match-detail-page";
import { ensureDbReady } from "@/lib/db/client";
import { getHasSport } from "@/components/sports/sport-helpers";
import { getMatchById, getMatchesByLeagueSeason } from "@/lib/db/repositories/matches-repo";
import { getTeamById } from "@/lib/db/repositories/teams-repo";
import { getLeagueById } from "@/lib/db/repositories/leagues-repo";
import { getStatsByMatchId } from "@/lib/db/repositories/player-stats-repo";
import { getPlayersByIds } from "@/lib/db/repositories/players-repo";
import { getTeamStandings, getPlayerSeasonRanking } from "@/lib/services/statistics-service";
import { parseSportId, parseEntityId, safeDecodeEntityId } from "@/lib/config/validation";
import { getEnrichment, type MatchEnrichment } from "@/lib/services/match-enrichment-service";

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
  const [matchStats, standings, allSeasonMatches, squadRanking, enrichment] =
    await Promise.all([
      getStatsByMatchId(id),
      getTeamStandings(sport, leagueId, seasonId),
      getMatchesByLeagueSeason(leagueId, seasonId),
      getPlayerSeasonRanking(sport, leagueId, seasonId),
      getEnrichment(id),
    ]);

  const allPlayerIds = [...new Set([...matchStats.map((s) => s.player_id), ...squadRanking.map((player) => player.playerId)])];
  const players = await getPlayersByIds(allPlayerIds);
  const playerMap = new Map(
    players.map((p) => [p.id, p]),
  );

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
      enrichment={enrichment}
    />
  );
}