import { notFound } from "next/navigation";
import LeaderboardPage from "@/components/sports/leaderboard/leaderboard-page";
import {
  getHasSport,
  formatLeagueName,
  formatSeasonName,
} from "@/components/sports/sport-helpers";
import { ensureDbReady } from "@/lib/db/client";
import { getLeaguesBySportId } from "@/lib/db/repositories/leagues-repo";
import { getTeamSquadRanking } from "@/lib/services/statistics-service";

export default async function LeaderboardRoute({
  params,
  searchParams,
}: {
  params: Promise<{ sport: string }>;
  searchParams: Promise<{ chart?: string }>;
}) {
  const { sport } = await params;
  const { chart: chartParam } = await searchParams;
  const chart = chartParam === "assists" || chartParam === "ga" ? chartParam : "goals";
  const has = getHasSport(sport);
  if (!has) notFound();
  await ensureDbReady();
  const leagues = await getLeaguesBySportId(sport);
  const mainLeague = leagues.find((l) => l.id === "demo-liga-1") ?? leagues[0];
  const seasonId =
    mainLeague?.id === "demo-liga-1"
      ? "season-2026-1"
      : mainLeague
        ? `season-${mainLeague.id}`
        : "";
  const ranking =
    mainLeague && seasonId
      ? await getTeamSquadRanking(sport, mainLeague.id, seasonId)
      : [];
  return (
    <LeaderboardPage
      sport={sport}
      leagueName={formatLeagueName({
        name: mainLeague?.name ?? "Liga",
        country: mainLeague?.country,
      })}
      seasonName={formatSeasonName(seasonId)}
      squadRanking={ranking}
      chart={chart}
    />
  );
}
