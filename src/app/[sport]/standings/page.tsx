import { notFound } from "next/navigation";
import StandingsPage from "@/components/sports/standings/standings-page";
import { getHasSport, formatLeagueName, formatSeasonName } from "@/components/sports/sport-helpers";
import { ensureDbReady } from "@/lib/db/client";
import { getLeaguesBySportId } from "@/lib/db/repositories/leagues-repo";
import { getTeamStandings } from "@/lib/services/statistics-service";

export default async function StandingsRoute({
  params,
}: {
  params: Promise<{ sport: string }>;
}) {
  const { sport } = await params;
  const has = getHasSport(sport);
  if (!has) notFound();
  await ensureDbReady();
  const leagues = await getLeaguesBySportId(sport);
  const mainLeague = leagues.find((l) => l.id === "demo-liga-1") ?? leagues[0];
  const mainSeason =
    mainLeague?.id === "demo-liga-1"
      ? "season-2026-1"
      : mainLeague
        ? `season-${mainLeague.id}`
        : "";
  const standings =
    mainLeague && mainSeason
      ? await getTeamStandings(sport, mainLeague.id, mainSeason)
      : [];

  return (
    <StandingsPage
      sport={sport}
      leagueName={formatLeagueName({
        name: mainLeague?.name ?? "Liga",
        country: mainLeague?.country,
      })}
      seasonName={formatSeasonName(mainSeason)}
      standings={standings}
    />
  );
}
