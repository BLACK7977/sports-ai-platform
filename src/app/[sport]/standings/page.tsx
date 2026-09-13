import { notFound } from "next/navigation";
import StandingsPage from "@/components/sports/standings/standings-page";
import { getHasSport, formatLeagueName, formatSeasonName } from "@/components/sports/sport-helpers";
import { ensureDbReady } from "@/lib/db/client";
import { getCompetitionSelectionState } from "@/lib/db/repositories/active-competition-repo";
import { getTeamStandings } from "@/lib/services/statistics-service";
import { parseSportId } from "@/lib/config/validation";

export default async function StandingsRoute({
  params,
}: {
  params: Promise<{ sport: string }>;
}) {
  const { sport } = await params;
  if (!parseSportId(sport)) notFound();
  const has = getHasSport(sport);
  if (!has) notFound();
  await ensureDbReady();
  const { active } = await getCompetitionSelectionState(sport);
  const mainLeague = active?.league;
  const mainSeason = active?.season.id ?? "";
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
      seasonName={active?.season.name ?? formatSeasonName(mainSeason)}
      standings={standings}
    />
  );
}
