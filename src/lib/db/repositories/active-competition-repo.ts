import "@/lib/config/env";
import { cookies } from "next/headers";
import { getLeaguesBySportId } from "./leagues-repo";
import { getSeasonsByLeagueId, getSeasonsByLeagueIds } from "./seasons-repo";
import type { League, Season } from "@/types/db/tables";

export type ActiveCompetition = { league: League; season: Season };
export type CompetitionCandidate = { league: League; seasons: Season[] };
export const competitionSelectionCookie = (sportId: string) =>
  `sports-ai-competition-${sportId}`;

function pickSeason(seasons: Season[]): Season | null {
  return seasons.find((season) => season.is_current) ?? seasons[0] ?? null;
}

function activePriority(season: Season): number {
  const value = season.sport_specific.active_priority;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Pure and deterministic so imports and routes select the same competition. */
export function selectActiveCompetition(
  candidates: CompetitionCandidate[],
): ActiveCompetition | null {
  const current = candidates
    .filter((candidate) => candidate.seasons.some((season) => season.is_current))
    .sort((a, b) => {
      const aSeason = a.seasons.find((season) => season.is_current)!;
      const bSeason = b.seasons.find((season) => season.is_current)!;
      const priority = activePriority(bSeason) - activePriority(aSeason);
      if (priority !== 0) return priority;
      const startDate = bSeason.start_date.localeCompare(aSeason.start_date);
      if (startDate !== 0) return startDate;
      return a.league.id.localeCompare(b.league.id);
    })[0];
  if (current) return { league: current.league, season: pickSeason(current.seasons)! };

  const fallback = candidates
    .filter((candidate) => candidate.seasons.length > 0)
    .sort((a, b) => {
      const startDate = (b.seasons[0]?.start_date ?? "").localeCompare(a.seasons[0]?.start_date ?? "");
      if (startDate !== 0) return startDate;
      return a.league.id.localeCompare(b.league.id);
    })[0];
  return fallback ? { league: fallback.league, season: pickSeason(fallback.seasons)! } : null;
}

/**
 * Resolves a competition from persisted state only. Import jobs make a season
 * current; route code never needs to know a demo, provider, or season id.
 */
export async function getActiveCompetitionForLeague(
  league: League,
): Promise<ActiveCompetition | null> {
  const season = pickSeason(await getSeasonsByLeagueId(league.id));
  return season ? { league, season } : null;
}

export async function getActiveCompetition(sportId: string): Promise<ActiveCompetition | null> {
  return selectActiveCompetition(await getCompetitionCandidates(sportId));
}

export async function getCompetitionCandidates(
  sportId: string,
): Promise<CompetitionCandidate[]> {
  const leagues = await getLeaguesBySportId(sportId);
  const seasons = await getSeasonsByLeagueIds(leagues.map((league) => league.id));
  const seasonsByLeague = new Map<string, Season[]>();
  for (const season of seasons) {
    const current = seasonsByLeague.get(season.league_id) ?? [];
    current.push(season);
    seasonsByLeague.set(season.league_id, current);
  }
  return leagues.map((league) => ({
    league,
    seasons: seasonsByLeague.get(league.id) ?? [],
  }));
}

function readSelection(value: string | undefined): {
  leagueId: string;
  seasonId: string;
} | null {
  if (!value) return null;
  const [leagueId, seasonId, ...rest] = value.split(":");
  return leagueId && seasonId && rest.length === 0 ? { leagueId, seasonId } : null;
}

/**
 * Returns the competition chosen in this browser when valid, otherwise the
 * deterministic persisted active competition. The preference lives in a
 * cookie only; it never updates Supabase's active flags or source data.
 */
export async function getCompetitionSelectionState(sportId: string): Promise<{
  active: ActiveCompetition | null;
  candidates: CompetitionCandidate[];
}> {
  const candidates = await getCompetitionCandidates(sportId);
  const selected = readSelection(
    (await cookies()).get(competitionSelectionCookie(sportId))?.value,
  );
  if (selected) {
    const candidate = candidates.find(
      ({ league }) => league.id === selected.leagueId,
    );
    const season = candidate?.seasons.find(
      (entry) => entry.id === selected.seasonId,
    );
    if (candidate && season) return { active: { league: candidate.league, season }, candidates };
  }
  return { active: selectActiveCompetition(candidates), candidates };
}

export async function isValidCompetitionSelection(
  sportId: string,
  leagueId: string,
  seasonId: string,
): Promise<boolean> {
  const candidates = await getCompetitionCandidates(sportId);
  return candidates.some(
    (candidate) =>
      candidate.league.id === leagueId &&
      candidate.seasons.some((season) => season.id === seasonId),
  );
}
