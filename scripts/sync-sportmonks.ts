import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), true);

// SPORTMONKS_SYNC_CONFIRM is only a runner fallback when a shell consumes --confirm.
const confirmed = process.argv.includes("--confirm") || process.env.SPORTMONKS_SYNC_CONFIRM === "true";

function option(name: string): string | undefined {
  return process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1);
}

function requiredNumber(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} debe ser un entero positivo.`);
  return parsed;
}

function fixtureState(raw: Record<string, unknown>): string {
  const state = raw.state as { short_name?: unknown; name?: unknown } | undefined;
  const value = state?.short_name ?? state?.name;
  return typeof value === "string" ? value.toUpperCase() : "UNKNOWN";
}

async function main() {
  const [{ getEnv }, { previewSportmonksCompetition }, { withProviderMetadata, providerExternalId }, { upsertSport }, { upsertLeague }, { upsertSeason }, { runIngestionJob }] = await Promise.all([
    import("../src/lib/config/env"),
    import("../src/sports/soccer/data-sources/sportmonks-argentina-source"),
    import("../src/sports/soccer/data-sources/provider-contract"),
    import("../src/lib/db/repositories/sports-repo"),
    import("../src/lib/db/repositories/leagues-repo"),
    import("../src/lib/db/repositories/seasons-repo"),
    import("../src/lib/services/ingestion-service"),
  ]);
  if (!getEnv().SPORTMONKS_API_TOKEN) throw new Error("SPORTMONKS_API_TOKEN no está configurado. No se realizó ninguna escritura.");

  // Defaults are the approved free initial target. Every value can be overridden without code changes.
  const leagueExternalId = requiredNumber(option("--league-id") ?? "271", "--league-id");
  const seasonExternalId = requiredNumber(option("--season-id") ?? "27897", "--season-id");
  const target = {
    leagueId: option("--internal-league-id") ?? "sportmonks-denmark-superliga",
    seasonId: option("--internal-season-id") ?? "sportmonks-denmark-superliga-2026-2027",
    displayName: option("--name") ?? "Superliga",
    country: option("--country") ?? "Denmark",
  };

  const preview = await previewSportmonksCompetition({
    target,
    leagueExternalId,
    seasonExternalId,
    from: option("--from") ?? "2026-07-24",
    to: option("--to") ?? "2027-03-21",
  });
  const playerCount = new Set([...preview.squads.values()].flatMap((players) => players.map((player) => player.id))).size;
  const states = preview.fixtures.map(fixtureState);
  const finished = states.filter((state) => ["FT", "AET", "PEN", "FINISHED"].includes(state)).length;
  const future = states.filter((state) => ["NS", "TBD", "SCHEDULED"].includes(state)).length;
  const standings = await new (await import("../src/sports/soccer/data-sources/sportmonks-client")).SportmonksClient().getStandingsBySeason(seasonExternalId);
  const summary = {
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
  console.log(`SPORTMONKS_PREVIEW: ${JSON.stringify(summary)}`);
  if (!confirmed) {
    console.log("SPORTMONKS_SYNC: PREVIEW_ONLY. Agregá --confirm únicamente después de aprobar estos datos.");
    return;
  }
  if (!preview.season.starting_at || !preview.season.ending_at) throw new Error("Sportmonks no devolvió fechas completas de la temporada; no se realizó ninguna escritura.");
  const syncedAt = new Date().toISOString();
  await upsertSport({ id: "soccer", name: "soccer", display_name: "Fútbol", emoji: "⚽", sport_specific: {} });
  await upsertLeague({
    id: target.leagueId, sport_id: "soccer", name: preview.league.name,
    country: preview.league.country?.name ?? target.country,
    external_id: providerExternalId("sportmonks", "competition", preview.league.id), provider: "sportmonks", last_synced_at: syncedAt,
    sport_specific: withProviderMetadata({ logo_url: preview.league.image_path ?? undefined }, { provider: "sportmonks", external_id: preview.league.id, last_synced_at: syncedAt }),
  });
  await upsertSeason({
    id: target.seasonId, league_id: target.leagueId, name: preview.season.name,
    start_date: preview.season.starting_at.slice(0, 10), end_date: preview.season.ending_at.slice(0, 10), is_current: true,
    external_id: providerExternalId("sportmonks", "season", preview.season.id), provider: "sportmonks", last_synced_at: syncedAt,
    sport_specific: withProviderMetadata({ active_priority: 100 }, { provider: "sportmonks", external_id: preview.season.id, last_synced_at: syncedAt }),
  });
  const result = await runIngestionJob("soccer", "sportmonks", {
    target, leagueExternalId, seasonExternalId,
    from: preview.season.starting_at.slice(0, 10), to: preview.season.ending_at.slice(0, 10),
  });
  console.log(`SPORTMONKS_SYNC: COMPLETE ${JSON.stringify(result)}`);
  if (result.errors.length) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
