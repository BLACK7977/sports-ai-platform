import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), true);

const confirmed = process.argv.includes("--confirm");

async function main() {
  const [{ getEnv }, { SportmonksClient }, target, { withProviderMetadata, providerExternalId }, { upsertSport }, { upsertLeague }, { upsertSeason }, { runIngestionJob }] = await Promise.all([
    import("../src/lib/config/env"),
    import("../src/sports/soccer/data-sources/sportmonks-client"),
    import("../src/sports/soccer/data-sources/argentina-primera-target"),
    import("../src/sports/soccer/data-sources/provider-contract"),
    import("../src/lib/db/repositories/sports-repo"),
    import("../src/lib/db/repositories/leagues-repo"),
    import("../src/lib/db/repositories/seasons-repo"),
    import("../src/lib/services/ingestion-service"),
  ]);
  const env = getEnv();
  if (!env.SPORTMONKS_API_TOKEN) {
    throw new Error("SPORTMONKS_API_TOKEN no está configurado. No se realizó ninguna escritura.");
  }

  const client = new SportmonksClient();
  const [league, season] = await (async () => {
    const resolvedLeague = await client.resolveArgentinaPrimera();
    return [resolvedLeague, await client.resolveCurrentSeason(resolvedLeague.id)] as const;
  })();
  console.log(`SPORTMONKS_DISCOVERY: league=${league.id} season=${season.id} name=${league.name} seasonName=${season.name}`);
  if (!confirmed) {
    console.log("SPORTMONKS_SYNC: DRY_RUN. Repetí con --confirm para escribir datos en Supabase.");
    return;
  }
  if (!season.starting_at || !season.ending_at) {
    throw new Error("Sportmonks no devolvió fechas completas de la temporada; no se realizó ninguna escritura.");
  }

  const syncedAt = new Date().toISOString();
  await upsertSport({ id: "soccer", name: "soccer", display_name: "Fútbol", emoji: "⚽", sport_specific: {} });
  await upsertLeague({
    id: target.ARGENTINA_PRIMERA_PROFESSIONAL.leagueId, sport_id: "soccer", name: league.name,
    country: "Argentina", external_id: providerExternalId("sportmonks", "competition", league.id),
    provider: "sportmonks", last_synced_at: syncedAt,
    sport_specific: withProviderMetadata({ logo_url: league.image_path ?? undefined }, { provider: "sportmonks", external_id: league.id, last_synced_at: syncedAt }),
  });
  await upsertSeason({
    id: target.ARGENTINA_PRIMERA_PROFESSIONAL.seasonId, league_id: target.ARGENTINA_PRIMERA_PROFESSIONAL.leagueId,
    name: season.name, start_date: season.starting_at.slice(0, 10), end_date: season.ending_at.slice(0, 10), is_current: true,
    external_id: providerExternalId("sportmonks", "season", season.id), provider: "sportmonks", last_synced_at: syncedAt,
    sport_specific: withProviderMetadata({ active_priority: 100 }, { provider: "sportmonks", external_id: season.id, last_synced_at: syncedAt }),
  });
  const result = await runIngestionJob("soccer", "sportmonks", {
    leagueExternalId: league.id, seasonExternalId: season.id,
    from: season.starting_at.slice(0, 10), to: season.ending_at.slice(0, 10),
  });
  console.log(`SPORTMONKS_SYNC: COMPLETE ${JSON.stringify(result)}`);
  if (result.errors.length) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
