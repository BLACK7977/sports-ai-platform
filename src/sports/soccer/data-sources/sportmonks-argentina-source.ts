import type { DataSource } from "@/types/core/data-source";
import type { SoccerMatchPayload } from "../types";
import { normalizeArgentinaPrimeraFixture, normalizeArgentinaPrimeraSquad, type ArgentinaPrimeraExternalFixture, type ExternalPlayer, type ExternalTeam } from "./argentina-primera-adapter";
import { SportmonksClient, type SportmonksFixture, type SportmonksSquadEntry, type SportmonksTeam } from "./sportmonks-client";
import type { SoccerCompetitionTarget } from "./provider-contract";
import { mapSportmonksState, extractCurrentScores } from "./sportmonks-normalize";

const PROVIDER = "sportmonks";

export type SportmonksCompetitionInput = {
  target: SoccerCompetitionTarget;
  leagueExternalId: number;
  seasonExternalId: number;
  from: string;
  to: string;
};

export type SportmonksCompetitionPreview = {
  league: Awaited<ReturnType<SportmonksClient["getLeagueById"]>>;
  season: Awaited<ReturnType<SportmonksClient["getSeasonById"]>>;
  teams: SportmonksTeam[];
  squads: Map<number, ExternalPlayer[]>;
  monthlyWindows: Array<{ from: string; to: string; fixtureCount: number }>;
  fixtures: SportmonksFixture[];
  errors: string[];
};

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`[sportmonks] falta ${label}.`);
  return value;
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`[sportmonks] falta ${label}.`);
  return value;
}

function team(raw: SportmonksTeam): ExternalTeam {
  return { id: requiredNumber(raw.id, "team.id"), name: requiredString(raw.name, "team.name"), shortName: raw.short_code ?? raw.name, logoUrl: raw.image_path ?? undefined };
}

function player(raw: SportmonksSquadEntry): ExternalPlayer {
  const identity = raw.player?.id ?? raw.player_id;
  return {
    id: requiredNumber(identity, "squad.player_id"), name: requiredString(raw.player?.name ?? raw.player?.display_name, "squad.player.name"),
    position: requiredString(raw.position?.name, "squad.position.name"), jerseyNumber: raw.jersey_number ?? undefined,
    nationality: raw.player?.nationality?.name ?? undefined, dateOfBirth: raw.player?.date_of_birth ?? undefined,
  };
}

function fixture(raw: SportmonksFixture): ArgentinaPrimeraExternalFixture {
  const participants = raw.participants;
  if (!Array.isArray(participants)) throw new Error("[sportmonks] fixture sin participants.");
  const asTeam = (location: "home" | "away") => {
    const item = participants.find((participant) => {
      const meta = (participant as { meta?: { location?: unknown } }).meta;
      return meta?.location === location;
    }) as SportmonksTeam | undefined;
    if (!item) throw new Error(`[sportmonks] fixture sin participante ${location}.`);
    return team(item);
  };
  const result: ArgentinaPrimeraExternalFixture = {
    id: requiredNumber(raw.id, "fixture.id"), kickoff: requiredString(raw.starting_at, "fixture.starting_at"),
    status: mapSportmonksState(raw.state), home: asTeam("home"), away: asTeam("away"),
    round: typeof raw.round_id === "number" ? raw.round_id : undefined,
  };
  if (result.status === "finished") {
    const { homeScore, awayScore } = extractCurrentScores(raw.scores);
    result.homeScore = requiredNumber(homeScore, "fixture.homeScore");
    result.awayScore = requiredNumber(awayScore, "fixture.awayScore");
  }
  return result;
}

export async function previewSportmonksCompetition(input: SportmonksCompetitionInput): Promise<SportmonksCompetitionPreview> {
  const client = new SportmonksClient();
  const [league, season, teams, monthlyFixtures] = await Promise.all([
    client.getLeagueById(input.leagueExternalId),
    client.getSeasonById(input.seasonExternalId),
    client.getTeamsBySeason(input.seasonExternalId),
    client.getFixturesByMonthlyWindows(input.leagueExternalId, input.from, input.to),
  ]);
  if (league.id !== input.leagueExternalId || season.id !== input.seasonExternalId || season.league_id !== input.leagueExternalId) {
    throw new Error("[sportmonks] la liga y temporada configuradas no coinciden con la respuesta del proveedor.");
  }

  const squads = new Map<number, ExternalPlayer[]>();
  const errors: string[] = [];
  const squadResponses = await Promise.allSettled(teams.map(async (rawTeam) => ({
    teamId: rawTeam.id,
    entries: await client.getSquadBySeasonTeam(input.seasonExternalId, rawTeam.id),
  })));
  for (const response of squadResponses) {
    if (response.status === "rejected") {
      errors.push(response.reason instanceof Error ? response.reason.message : String(response.reason));
      continue;
    }
    try {
      const validPlayers: ExternalPlayer[] = [];
      for (const entry of response.value.entries) {
        try {
          validPlayers.push(player(entry));
        } catch (error) {
          const playerId = entry.player?.id ?? entry.player_id ?? "unknown";
          errors.push(`[sportmonks] jugador ${playerId} del equipo ${response.value.teamId} rechazado: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      squads.set(response.value.teamId, validPlayers);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    league,
    season,
    teams,
    squads,
    monthlyWindows: monthlyFixtures.map((window) => ({ from: window.from, to: window.to, fixtureCount: window.fixtures.length })),
    fixtures: monthlyFixtures.flatMap((window) => window.fixtures),
    errors,
  };
}

export const soccerSportmonksSource: DataSource<SportmonksCompetitionInput, SoccerMatchPayload[]> = {
  id: PROVIDER,
  name: "Sportmonks · Competición configurable",
  async fetch(input) {
    const syncedAt = new Date().toISOString();
    const preview = await previewSportmonksCompetition(input);
    return preview.fixtures.map((rawFixture) => {
      const source = fixture(rawFixture);
      const homePlayers = preview.squads.get(Number(source.home.id)) ?? [];
      const awayPlayers = preview.squads.get(Number(source.away.id)) ?? [];
      const homeSquad = normalizeArgentinaPrimeraSquad(PROVIDER, input.target, source.home, homePlayers, syncedAt);
      const awaySquad = normalizeArgentinaPrimeraSquad(PROVIDER, input.target, source.away, awayPlayers, syncedAt);
      const payload = normalizeArgentinaPrimeraFixture(PROVIDER, input.target, {
        ...source,
        homePlayers: undefined,
        awayPlayers: undefined,
      }, syncedAt);
      return {
        ...payload,
        teams: [homeSquad.team, awaySquad.team],
        players: [...homeSquad.players, ...awaySquad.players],
        playerStats: [],
      };
    });
  },
};

/** Compatibility export for callers created during the Argentina preparation phase. */
export const soccerSportmonksArgentinaSource = soccerSportmonksSource;
