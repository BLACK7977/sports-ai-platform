import { notFound } from "next/navigation";
import LeaderboardPage from "@/components/sports/leaderboard/leaderboard-page";
import {
  getHasSport,
  formatLeagueName,
  formatSeasonName,
} from "@/components/sports/sport-helpers";
import { ensureDbReady } from "@/lib/db/client";
import { getCompetitionSelectionState } from "@/lib/db/repositories/active-competition-repo";
import { getMatchesByLeagueSeason } from "@/lib/db/repositories/matches-repo";
import { getTeamSquadRanking } from "@/lib/services/statistics-service";
import { parseSportId, chartSchema } from "@/lib/config/validation";

export type CompetitionAggregate = {
  played: number;
  finished: number;
  totalGoals: number;
  averageGoals: number | null;
};

export default async function LeaderboardRoute({
  params,
  searchParams,
}: {
  params: Promise<{ sport: string }>;
  searchParams: Promise<{ chart?: string }>;
}) {
  const { sport } = await params;
  if (!parseSportId(sport)) notFound();
  const { chart: chartParam } = await searchParams;
  const parsedChart = chartSchema.safeParse(chartParam);
  const chart = parsedChart.success ? parsedChart.data : "goals";
  const has = getHasSport(sport);
  if (!has) notFound();
  await ensureDbReady();
  const { active } = await getCompetitionSelectionState(sport);
  const mainLeague = active?.league;
  const seasonId = active?.season.id ?? "";
  const ranking =
    mainLeague && seasonId
      ? await getTeamSquadRanking(sport, mainLeague.id, seasonId)
      : [];
  const seasonMatches = mainLeague && seasonId ? await getMatchesByLeagueSeason(mainLeague.id, seasonId) : [];
  const finishedMatches = seasonMatches.filter((match) => match.status === "finished");
  const totalGoals = finishedMatches.reduce(
    (sum, match) => sum + (match.home_score ?? 0) + (match.away_score ?? 0),
    0,
  );
  const aggregate: CompetitionAggregate = {
    played: seasonMatches.length,
    finished: finishedMatches.length,
    totalGoals,
    averageGoals: finishedMatches.length > 0 ? Math.round((totalGoals / finishedMatches.length) * 100) / 100 : null,
  };
  return (
    <LeaderboardPage
      sport={sport}
      leagueName={formatLeagueName({
        name: mainLeague?.name ?? "Liga",
        country: mainLeague?.country,
      })}
      seasonName={active?.season.name ?? formatSeasonName(seasonId)}
      squadRanking={ranking}
      chart={chart}
      aggregate={aggregate}
    />
  );
}
