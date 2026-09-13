import type { DataSource } from "@/types/core/data-source";
import type { SoccerMatchPayload } from "../types";
import { normalizeArgentinaPrimeraFixture, normalizeArgentinaPrimeraSquad, type ArgentinaPrimeraExternalFixture, type ExternalPlayer, type ExternalTeam } from "./argentina-primera-adapter";
import { SportmonksClient, type SportmonksFixture, type SportmonksSquadEntry, type SportmonksTeam } from "./sportmonks-client";
import type { SoccerCompetitionTarget } from "./provider-contract";

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

function status(raw: unknown): SoccerMatchPayload["status"] {
  const value = typeof raw === "object" && raw !== null ? (raw as { short_name?: unknown; name?: unknown }).short_name ?? (raw as { name?: unknown }).name : raw;
  const code = requiredString(value, "fixture.state").toUpperCase();
  if (["NS", "TBD", "SCHEDULED"].includes(code)) return "scheduled";
  if (["FT", "AET", "PEN", "FINISHED"].includes(code)) return "finished";
  if (["1H", "HT", "2H", "ET", "BT", "LIVE", "INPLAY"].includes(code)) return "in_progress";
  if (["PST", "POSTPONED"].includes(code)) return "postponed";
  if (["CANC", "CANCL", "CANCELLED"].includes(code)) return "cancelled";
  throw new Error(`[sportmonks] estado de fixture no soportado: ${code}.`);
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
  const state = raw.state;
  const result: ArgentinaPrimeraExternalFixture = {
    id: requiredNumber(raw.id, "fixture.id"), kickoff: requiredString(raw.starting_at, "fixture.starting_at"),
    status: status(state), home: asTeam("home"), away: asTeam("away"),
    round: typeof raw.round_id === "number" ? raw.round_id : undefined,
  };
  if (result.status === "finished") {
    const scores = raw.scores;
    if (!Array.isArray(scores)) throw new Error("[sportmonks] fixture finalizado sin scores.");
    const current = scores.filter((score) => (score as { description?: unknown }).description === "CURRENT");
    const homeScore = current.find((score) => (score as { score?: { participant?: unknown } }).score?.participant === "home") as { score?: { goals?: unknown } } | undefined;
    const awayScore = current.find((score) => (score as { score?: { participant?: unknown } }).score?.participant === "away") as { score?: { goals?: unknown } } | undefined;
    result.homeScore = requiredNumber(homeScore?.score?.goals, "fixture.homeScore");
    result.awayScore = requiredNumber(awayScore?.score?.goals, "fixture.awayScore");
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
