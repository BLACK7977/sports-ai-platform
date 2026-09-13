import { notFound } from "next/navigation";
import PlayerDetailPage from "@/components/sports/players/player-detail-page";
import {
  getHasSport,
  formatSeasonName,
} from "@/components/sports/sport-helpers";
import { ensureDbReady } from "@/lib/db/client";
import { getActiveCompetitionForLeague } from "@/lib/db/repositories/active-competition-repo";
import { getLeagueById } from "@/lib/db/repositories/leagues-repo";
import { getPlayerById } from "@/lib/db/repositories/players-repo";
import { getTeamById } from "@/lib/db/repositories/teams-repo";
import {
  getPlayerCareerStats,
  getPlayerSeasonRanking,
} from "@/lib/services/statistics-service";
import { parseSportId, parseEntityId } from "@/lib/config/validation";

export default async function PlayerDetailRoute({
  params,
}: {
  params: Promise<{ sport: string; id: string }>;
}) {
  const { sport, id } = await params;
  if (!parseSportId(sport) || !parseEntityId(id)) notFound();
  const has = getHasSport(sport);
  if (!has) notFound();
  await ensureDbReady();
  const player = await getPlayerById(id);
  if (!player) notFound();
  const team = await getTeamById(player.team_id);
  const league = team ? await getLeagueById(team.league_id) : null;
  const competition = league ? await getActiveCompetitionForLeague(league) : null;
  const leagueId = competition?.league.id ?? team?.league_id ?? "";
  const seasonId = competition?.season.id ?? "";

  const [seasonRank, careerStats] = await Promise.all([
    getPlayerSeasonRanking(sport, leagueId, seasonId),
    getPlayerCareerStats(sport, id),
  ]);
  const seasonAgg = seasonRank.find((r) => r.playerId === id) ?? null;

  // El informe AI se genera SOLO on-demand desde un componente client,
  // nunca en el SSR de esta página.
  return (
    <PlayerDetailPage
      sport={sport}
      leagueId={leagueId}
      seasonId={seasonId}
      seasonName={competition?.season.name ?? formatSeasonName(seasonId)}
      player={player}
      team={team}
      seasonAgg={seasonAgg}
      careerStats={careerStats}
      allSeasonRank={seasonRank}
    />
  );
}