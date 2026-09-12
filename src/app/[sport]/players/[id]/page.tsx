import { notFound } from "next/navigation";
import PlayerDetailPage from "@/components/sports/players/player-detail-page";
import {
  getHasSport,
  formatSeasonName,
} from "@/components/sports/sport-helpers";
import { ensureDbReady } from "@/lib/db/client";
import { getLeaguesBySportId } from "@/lib/db/repositories/leagues-repo";
import { getPlayerById } from "@/lib/db/repositories/players-repo";
import { getTeamById } from "@/lib/db/repositories/teams-repo";
import {
  getPlayerCareerStats,
  getPlayerSeasonRanking,
} from "@/lib/services/statistics-service";
import { generatePlayerReport } from "@/lib/services/ai-service";
import { actionGeneratePlayerReport } from "./actions";

export default async function PlayerDetailRoute({
  params,
}: {
  params: Promise<{ sport: string; id: string }>;
}) {
  const { sport, id } = await params;
  const has = getHasSport(sport);
  if (!has) notFound();
  await ensureDbReady();
  const player = await getPlayerById(id);
  if (!player) notFound();
  const team = await getTeamById(player.team_id);
  const leagues = await getLeaguesBySportId(sport);
  const mainLeague =
    leagues.find((l) => l.id === "demo-liga-1") ??
    leagues.find((l) => l.id === team?.league_id) ??
    leagues[0];
  const leagueId = mainLeague?.id ?? "demo-liga-1";
  const seasonId =
    mainLeague?.id === "demo-liga-1"
      ? "season-2026-1"
      : mainLeague
        ? `season-${mainLeague.id}`
        : "season-2026-1";

  const [seasonRank, careerStats] = await Promise.all([
    getPlayerSeasonRanking(sport, leagueId, seasonId),
    getPlayerCareerStats(sport, id),
  ]);
  const seasonAgg = seasonRank.find((r) => r.playerId === id) ?? null;

  const report = await Promise.resolve(
    actionGeneratePlayerReport(sport, leagueId, seasonId, id),
  ).then(
    (x) =>
      (x.ok && x.data) ||
      generatePlayerReport(sport, leagueId, seasonId, id, "mock"),
  );

  return (
    <PlayerDetailPage
      sport={sport}
      leagueId={leagueId}
      seasonId={seasonId}
      seasonName={formatSeasonName(seasonId)}
      player={player}
      team={team}
      seasonAgg={seasonAgg}
      careerStats={careerStats}
      report={report}
      allSeasonRank={seasonRank}
    />
  );
}
