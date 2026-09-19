import "server-only";
import { getEnv } from "@/lib/config/env";
import { previewSportmonksCompetition, type SportmonksCompetitionPreview } from "@/sports/soccer/data-sources/sportmonks-argentina-source";
import { withProviderMetadata, providerExternalId } from "@/sports/soccer/data-sources/provider-contract";
import { upsertSport } from "@/lib/db/repositories/sports-repo";
import { upsertLeague } from "@/lib/db/repositories/leagues-repo";
import { upsertSeason } from "@/lib/db/repositories/seasons-repo";
import { runIngestionJob, type IngestionResult } from "@/lib/services/ingestion-service";
import { SportmonksClient } from "@/sports/soccer/data-sources/sportmonks-client";

/**
 * Singleton real paths para la competición Sportmonks (liga 271 / temporada
 * 27897 por defecto). No duplica la lógica de mapeo/upsert: todo pasa por
 * previewSportmonksCompetition + runIngestionJob (los mismos caminos que usa
 * scripts/sync-sportmonks.ts).
 */

export interface SportmonksSyncOptions {
  leagueExternalId: number;
  seasonExternalId: number;
  internalLeagueId: string;
  internalSeasonId: string;
  displayName: string;
  country: string;
  from?: string;
  to?: string;
  /** false → solo preview (sin escrituras); true → preview + escrituras. */
  confirm?: boolean;
}

export interface SportmonksSyncDeps {
  getToken: () => string | undefined;
  preview: (input: { target: { leagueId: string; seasonId: string; displayName: string; country: string }; leagueExternalId: number; seasonExternalId: number; from: string; to: string }) => Promise<SportmonksCompetitionPreview>;
  getStandings: (seasonExternalId: number) => Promise<Record<string, unknown>[]>;
  upsertSport: (...args: Parameters<typeof upsertSport>) => Promise<unknown>;
  upsertLeague: (...args: Parameters<typeof upsertLeague>) => Promise<unknown>;
  upsertSeason: (...args: Parameters<typeof upsertSeason>) => Promise<unknown>;
  runIngestion: typeof runIngestionJob;
}

/** Únicas tablas que el sync de Sportmonks puede escribir. Protege la auditoría. */
export const SYNC_WRITE_TABLES = [
  "sports",
  "leagues",
  "seasons",
  "teams",
  "players",
  "matches",
  "player_match_stats",
] as const;

export const PROTECTED_TABLES = [
  "predictions",
  "prediction_evaluations",
  "prediction_explanations",
  "probable_lineup_runs",
  "probable_lineup_players",
  "match_lineups",
  "match_metadata",
  "match_events",
  "match_statistics",
] as const;

const defaultDeps: SportmonksSyncDeps = {
  getToken: () => getEnv().SPORTMONKS_API_TOKEN,
  preview: previewSportmonksCompetition,
  getStandings: (seasonExternalId: number) => new SportmonksClient().getStandingsBySeason(seasonExternalId),
  upsertSport,
  upsertLeague,
  upsertSeason,
  runIngestion: runIngestionJob,
};

function fixtureState(raw: Record<string, unknown>): string {
  const state = raw.state as { short_name?: unknown; name?: unknown } | undefined;
  const value = state?.short_name ?? state?.name;
  return typeof value === "string" ? value.toUpperCase() : "UNKNOWN";
}

export interface SportmonksSyncPreviewSummary {
  mode: "PREVIEW" | "CONFIRM";
  league: { id: unknown; name: unknown; country: unknown };
  season: { id: unknown; name: unknown; startingAt: unknown; endingAt: unknown };
  teams: Array<{ id: unknown; name: unknown; shortCode: unknown }>;
  playerCount: number;
  fixtureWindows: Array<{ from: string; to: string; fixtureCount: number }>;
  fixtureTotal: number;
  finishedFixtures: number;
  futureFixtures: number;
  otherFixtureStates: number;
  standings: { available: boolean; rows: number };
  errors: string[];
}

export interface SportmonksSyncResult {
  fetched: number;
  insertedMatches: number;
  updatedMatches: number;
  insertedTeams: number;
  updatedTeams: number;
  insertedPlayers: number;
  updatedPlayers: number;
  insertedStats: number;
  updatedStats: number;
  errors: number;
}

export interface SportmonksSyncOutcome {
  mode: "PREVIEW" | "CONFIRM";
  summary: SportmonksSyncPreviewSummary;
  result?: SportmonksSyncResult;
}

export async function runSportmonksCompetitionSync(
  input: SportmonksSyncOptions,
  depsOverride: Partial<SportmonksSyncDeps> = {},
): Promise<SportmonksSyncOutcome> {
  const deps: SportmonksSyncDeps = { ...defaultDeps, ...depsOverride };
  if (!deps.getToken()) {
    throw new Error("SPORTMONKS_API_TOKEN no está configurado. No se realizó ninguna escritura.");
  }

  const confirmed = input.confirm === true;
  const from = input.from ?? "2026-07-24";
  const to = input.to ?? "2027-03-21";
  const target = {
    leagueId: input.internalLeagueId,
    seasonId: input.internalSeasonId,
    displayName: input.displayName,
    country: input.country,
  };

  const preview = await deps.preview({
    target,
    leagueExternalId: input.leagueExternalId,
    seasonExternalId: input.seasonExternalId,
    from,
    to,
  });
  const playerCount = new Set([...preview.squads.values()].flatMap((players) => players.map((player) => player.id))).size;
  const states = preview.fixtures.map(fixtureState);
  const finished = states.filter((state) => ["FT", "AET", "PEN", "FINISHED"].includes(state)).length;
  const future = states.filter((state) => ["NS", "TBD", "SCHEDULED"].includes(state)).length;
  const standings = await deps.getStandings(input.seasonExternalId);
  const summary: SportmonksSyncPreviewSummary = {
    mode: confirmed ? "CONFIRM" : "PREVIEW",
    league: { id: preview.league.id, name: preview.league.name, country: preview.league.country?.name ?? null },
    season: { id: preview.season.id, name: preview.season.name, startingAt: preview.season.starting_at ?? null, endingAt: preview.season.ending_at ?? null },
    teams: preview.teams.map((team) => ({ id: team.id, name: team.name, shortCode: team.short_code ?? null })),
    playerCount,
    fixtureWindows: preview.monthlyWindows,
    fixtureTotal: preview.fixtures.length,
    finishedFixtures: finished,
    futureFixtures: future,
    otherFixtureStates: preview.fixtures.length - finished - future,
    standings: { available: standings.length > 0, rows: standings.length },
    errors: preview.errors,
  };
  if (!confirmed) {
    return { mode: "PREVIEW", summary };
  }
  if (!preview.season.starting_at || !preview.season.ending_at) {
    throw new Error("Sportmonks no devolvió fechas completas de la temporada; no se realizó ninguna escritura.");
  }

  const syncedAt = new Date().toISOString();
  await deps.upsertSport({ id: "soccer", name: "soccer", display_name: "Fútbol", emoji: "⚽", sport_specific: {} });
  await deps.upsertLeague({
    id: target.leagueId,
    sport_id: "soccer",
    name: preview.league.name,
    country: preview.league.country?.name ?? target.country,
    external_id: providerExternalId("sportmonks", "competition", preview.league.id),
    provider: "sportmonks",
    last_synced_at: syncedAt,
    sport_specific: withProviderMetadata({ logo_url: preview.league.image_path ?? undefined }, { provider: "sportmonks", external_id: preview.league.id, last_synced_at: syncedAt }),
  });
  await deps.upsertSeason({
    id: target.seasonId,
    league_id: target.leagueId,
    name: preview.season.name,
    start_date: preview.season.starting_at.slice(0, 10),
    end_date: preview.season.ending_at.slice(0, 10),
    is_current: true,
    external_id: providerExternalId("sportmonks", "season", preview.season.id),
    provider: "sportmonks",
    last_synced_at: syncedAt,
    sport_specific: withProviderMetadata({ active_priority: 100 }, { provider: "sportmonks", external_id: preview.season.id, last_synced_at: syncedAt }),
  });
  const raw = await deps.runIngestion("soccer", "sportmonks", {
    target,
    leagueExternalId: input.leagueExternalId,
    seasonExternalId: input.seasonExternalId,
    from: preview.season.starting_at.slice(0, 10),
    to: preview.season.ending_at.slice(0, 10),
  });
  return {
    mode: "CONFIRM",
    summary,
    result: {
      fetched: raw.fetched,
      insertedMatches: raw.insertedMatches,
      updatedMatches: raw.updatedMatches,
      insertedTeams: raw.insertedTeams,
      updatedTeams: raw.updatedTeams,
      insertedPlayers: raw.insertedPlayers,
      updatedPlayers: raw.updatedPlayers,
      insertedStats: raw.insertedStats,
      updatedStats: raw.updatedStats,
      errors: raw.errors.length,
    },
  };
}

/** Vista compacta para respuestas HTTP: sin secrets ni payloads del proveedor. */
export function compactSyncOutcome(outcome: SportmonksSyncOutcome): {
  ok: boolean;
  fetched: number;
  insertedMatches: number;
  updatedMatches: number;
  insertedPlayers: number;
  updatedPlayers: number;
  errors: number;
} {
  if (!outcome.result) {
    return { ok: false, fetched: 0, insertedMatches: 0, updatedMatches: 0, insertedPlayers: 0, updatedPlayers: 0, errors: 1 };
  }
  return {
    ok: outcome.result.errors === 0,
    fetched: outcome.result.fetched,
    insertedMatches: outcome.result.insertedMatches,
    updatedMatches: outcome.result.updatedMatches,
    insertedPlayers: outcome.result.insertedPlayers,
    updatedPlayers: outcome.result.updatedPlayers,
    errors: outcome.result.errors,
  };
}

/** Valores por defecto aprobados: liga 271 / temporada 27897 (Denmark Superliga). */
export function defaultSportmonksSyncInput(): SportmonksSyncOptions {
  return {
    leagueExternalId: 271,
    seasonExternalId: 27897,
    internalLeagueId: "sportmonks-denmark-superliga",
    internalSeasonId: "sportmonks-denmark-superliga-2026-2027",
    displayName: "Superliga",
    country: "Denmark",
    from: "2026-07-24",
    to: "2027-03-21",
    confirm: true,
  };
}

export type { IngestionResult };