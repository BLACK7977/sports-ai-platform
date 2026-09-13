import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true);

async function main() {
  // Los repositorios validan el entorno al cargarse; importarlos después de
  // loadEnvConfig evita que una ejecución standalone caiga en modo offline.
  const [{ upsertSport }, { upsertLeague }, { upsertSeason }, { runIngestionJob }, source] = await Promise.all([
    import("../src/lib/db/repositories/sports-repo"),
    import("../src/lib/db/repositories/leagues-repo"),
    import("../src/lib/db/repositories/seasons-repo"),
    import("../src/lib/services/ingestion-service"),
    import("../src/sports/soccer/data-sources/statsbomb-open-data-source"),
  ]);
  const { STATS_BOMB_WORLD_CUP_2022 } = source;
  await upsertSport({ id: "soccer", name: "soccer", display_name: "Fútbol", emoji: "⚽", sport_specific: { ball: "round", duration_minutes: 90 } });
  await upsertLeague({
    id: STATS_BOMB_WORLD_CUP_2022.leagueId, sport_id: "soccer", name: "FIFA World Cup", country: "International",
    external_id: "statsbomb:competition:43", sport_specific: { data_source: "StatsBomb Open Data", attribution: "StatsBomb" },
  });
  await upsertSeason({
    id: STATS_BOMB_WORLD_CUP_2022.appSeasonId, league_id: STATS_BOMB_WORLD_CUP_2022.leagueId, name: "2022",
    start_date: "2022-11-20", end_date: "2022-12-18", is_current: false,
    sport_specific: { data_source: "StatsBomb Open Data", external_id: 106 },
  });
  const result = await runIngestionJob("soccer", "statsbomb", {
    leagueId: STATS_BOMB_WORLD_CUP_2022.leagueId, seasonId: STATS_BOMB_WORLD_CUP_2022.appSeasonId,
    competitionId: STATS_BOMB_WORLD_CUP_2022.competitionId, competitionSeasonId: STATS_BOMB_WORLD_CUP_2022.seasonId,
    limit: process.env.STATSBOMB_MATCH_LIMIT ? Number(process.env.STATSBOMB_MATCH_LIMIT) : undefined,
  });
  if (result.errors.length) throw new Error(JSON.stringify(result.errors));
  console.log(`STATS_BOMB_INGEST: COMPLETE ${JSON.stringify(result)}`);
}
const keepAlive = setInterval(() => undefined, 1000);
void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => clearInterval(keepAlive));
