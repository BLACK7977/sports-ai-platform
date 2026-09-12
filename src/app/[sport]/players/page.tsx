import { notFound } from "next/navigation";
import PlayersListPage from "@/components/sports/players/players-list-page";
import { getHasSport, formatLeagueName } from "@/components/sports/sport-helpers";
import { ensureDbReady } from "@/lib/db/client";
import { getLeaguesBySportId } from "@/lib/db/repositories/leagues-repo";
import { getTeamsByLeagueId } from "@/lib/db/repositories/teams-repo";
import { getPlayersByTeamId } from "@/lib/services/statistics-service";

export default async function PlayersListRoute({
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
  const teams = mainLeague ? await getTeamsByLeagueId(mainLeague.id) : [];
  const playersByTeam = new Map<string, Awaited<ReturnType<typeof getPlayersByTeamId>>>();
  await Promise.all(
    teams.map(async (t) => {
      playersByTeam.set(t.id, await getPlayersByTeamId(t.id));
    }),
  );
  return (
    <PlayersListPage
      sport={sport}
      leagueName={formatLeagueName({
        name: mainLeague?.name ?? "Liga",
        country: mainLeague?.country,
      })}
      teams={teams}
      playersByTeam={playersByTeam}
    />
  );
}
