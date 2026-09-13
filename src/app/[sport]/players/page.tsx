import { notFound } from "next/navigation";
import PlayersListPage from "@/components/sports/players/players-list-page";
import { getHasSport, formatLeagueName } from "@/components/sports/sport-helpers";
import { ensureDbReady } from "@/lib/db/client";
import { getCompetitionSelectionState } from "@/lib/db/repositories/active-competition-repo";
import { getTeamsByLeagueId } from "@/lib/db/repositories/teams-repo";
import { getPlayersByTeamId } from "@/lib/db/repositories/players-repo";
import { parseSportId, parseEntityId } from "@/lib/config/validation";

export default async function PlayersListRoute({
  params,
  searchParams,
}: {
  params: Promise<{ sport: string }>;
  searchParams: Promise<{ team?: string }>;
}) {
  const { sport } = await params;
  if (!parseSportId(sport)) notFound();
  const { team: rawTeamId } = await searchParams;
  const requestedTeamId = rawTeamId ? parseEntityId(rawTeamId) ?? undefined : undefined;
  const has = getHasSport(sport);
  if (!has) notFound();
  await ensureDbReady();
  const { active } = await getCompetitionSelectionState(sport);
  const mainLeague = active?.league;
  const teams = mainLeague ? await getTeamsByLeagueId(mainLeague.id) : [];
  const selectedTeam =
    teams.find((team) => team.id === requestedTeamId) ?? teams[0] ?? null;
  const players = selectedTeam ? await getPlayersByTeamId(selectedTeam.id) : [];
  return (
    <PlayersListPage
      sport={sport}
      leagueName={formatLeagueName({
        name: mainLeague?.name ?? "Liga",
        country: mainLeague?.country,
      })}
      teams={teams}
      selectedTeam={selectedTeam}
      players={players}
    />
  );
}
