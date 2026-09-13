import { notFound } from "next/navigation";
import MatchDetailPage from "@/components/sports/matches/match-detail-page";
import { ensureDbReady } from "@/lib/db/client";
import { getHasSport } from "@/components/sports/sport-helpers";
import { getMatchById, getMatchesByLeagueSeason } from "@/lib/db/repositories/matches-repo";
import { getTeamById } from "@/lib/db/repositories/teams-repo";
import { getLeagueById } from "@/lib/db/repositories/leagues-repo";
import { getStatsByMatchId } from "@/lib/db/repositories/player-stats-repo";
import { getPlayerById } from "@/lib/db/repositories/players-repo";
import { getTeamStandings, getPlayerSeasonRanking } from "@/lib/services/statistics-service";
import { generateMatchAnalysis, predictMatch } from "@/lib/services/ai-service";
import { actionAnalyzeMatch, actionPredictMatch } from "./actions";
import { parseSportId, parseEntityId } from "@/lib/config/validation";

export default async function MatchDetailRoute({
  params,
}: {
  params: Promise<{ sport: string; id: string }>;
}) {
  const { sport, id } = await params;
  if (!parseSportId(sport) || !parseEntityId(id)) notFound();
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

  const [matchStats, analysisResult, predictionResult, standings, allSeasonMatches, squadRanking] =
    await Promise.all([
      getStatsByMatchId(id),
      Promise.resolve(actionAnalyzeMatch(sport, id)).then(
        (x) =>
          (x.ok && x.data) || generateMatchAnalysis(sport, id),
      ),
      Promise.resolve(actionPredictMatch(sport, leagueId, seasonId, id)).then(
        (x) =>
          (x.ok && x.data) ||
          predictMatch(sport, leagueId, seasonId, id),
      ),
      getTeamStandings(sport, leagueId, seasonId),
      getMatchesByLeagueSeason(leagueId, seasonId),
      getPlayerSeasonRanking(sport, leagueId, seasonId),
    ]);

  const allPlayerIds = new Set([...matchStats.map((s) => s.player_id), ...squadRanking.map((player) => player.playerId)]);
  const players = await Promise.all(
    [...allPlayerIds].map((pid) => getPlayerById(pid)),
  );
  const playerMap = new Map(
    players
      .filter(
        (p): p is NonNullable<(typeof players)[number]> => p != null,
      )
      .map((p) => [p.id, p]),
  );

  return (
    <MatchDetailPage
      sport={sport}
      match={match}
      home={home}
      away={away}
      league={league ?? undefined}
      analysis={analysisResult}
      prediction={predictionResult}
      matchStats={matchStats}
      standings={standings}
      allSeasonMatches={allSeasonMatches}
      squadRanking={squadRanking}
      playerMap={playerMap}
    />
  );
}
