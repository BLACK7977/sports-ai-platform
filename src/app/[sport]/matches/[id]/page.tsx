import { notFound } from "next/navigation";
import MatchDetailPage from "@/components/sports/matches/match-detail-page";
import { ensureDbReady } from "@/lib/db/client";
import { getHasSport } from "@/components/sports/sport-helpers";
import { getMatchById, getMatchesByLeagueSeason } from "@/lib/db/repositories/matches-repo";
import { getTeamById } from "@/lib/db/repositories/teams-repo";
import { getStatsByMatchId } from "@/lib/db/repositories/player-stats-repo";
import { getPlayerById } from "@/lib/db/repositories/players-repo";
import { getTeamStandings } from "@/lib/services/statistics-service";
import { generateMatchAnalysis, predictMatch } from "@/lib/services/ai-service";
import { actionAnalyzeMatch, actionPredictMatch } from "./actions";

export default async function MatchDetailRoute({
  params,
}: {
  params: Promise<{ sport: string; id: string }>;
}) {
  const { sport, id } = await params;
  const has = getHasSport(sport);
  if (!has) notFound();
  await ensureDbReady();

  const match = await getMatchById(id);
  if (!match) notFound();

  const [home, away] = await Promise.all([
    getTeamById(match.home_team_id),
    getTeamById(match.away_team_id),
  ]);
  if (!home || !away) notFound();

  const leagueId = match.league_id;
  const seasonId = match.season_id;

  const [matchStats, analysisResult, predictionResult, standings, allSeasonMatches] =
    await Promise.all([
      getStatsByMatchId(id),
      Promise.resolve(actionAnalyzeMatch(sport, id)).then(
        (x) =>
          (x.ok && x.data) || generateMatchAnalysis(sport, id, "mock"),
      ),
      Promise.resolve(actionPredictMatch(sport, leagueId, seasonId, id)).then(
        (x) =>
          (x.ok && x.data) ||
          predictMatch(sport, leagueId, seasonId, id, "mock"),
      ),
      getTeamStandings(sport, leagueId, seasonId),
      getMatchesByLeagueSeason(leagueId, seasonId),
    ]);

  const allPlayerIds = new Set(matchStats.map((s) => s.player_id));
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
      analysis={analysisResult}
      prediction={predictionResult}
      matchStats={matchStats}
      standings={standings}
      allSeasonMatches={allSeasonMatches}
      playerMap={playerMap}
    />
  );
}
