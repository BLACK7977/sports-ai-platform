import assert from "node:assert/strict";

process.env.ENABLE_OFFLINE_MODE = "true";

async function main() {
  const [{ selectActiveCompetition }, { InMemoryStore }, { upsertSport }, { upsertLeague, getLeagueById }, { upsertSeason }, { countTeams }, { countPlayers }, { countMatches }, { countPlayerStats }, { runIngestionJob }, { getSportOrThrow }] = await Promise.all([
    import("../src/lib/db/repositories/active-competition-repo"),
    import("../src/lib/db/in-memory-store"),
    import("../src/lib/db/repositories/sports-repo"),
    import("../src/lib/db/repositories/leagues-repo"),
    import("../src/lib/db/repositories/seasons-repo"),
    import("../src/lib/db/repositories/teams-repo"),
    import("../src/lib/db/repositories/players-repo"),
    import("../src/lib/db/repositories/matches-repo"),
    import("../src/lib/db/repositories/player-stats-repo"),
    import("../src/lib/services/ingestion-service"),
    import("../src/lib/config/sports-registry"),
  ]);
  const now = "2026-01-01T00:00:00.000Z";
  const league = (id: string) => ({ id, sport_id: "soccer", name: id, country: "AR", created_at: now, updated_at: now, sport_specific: {} });
  const season = (id: string, leagueId: string, current: boolean, start: string, priority?: number) => ({ id, league_id: leagueId, name: id, start_date: start, end_date: "2026-12-31", is_current: current, created_at: now, updated_at: now, sport_specific: priority === undefined ? {} : { active_priority: priority } });
  assert.equal(selectActiveCompetition([{ league: league("demo"), seasons: [season("demo-2026", "demo", true, "2026-06-01")] }, { league: league("arg"), seasons: [season("arg-2026", "arg", true, "2026-01-01", 100)] }])?.league.id, "arg");
  assert.equal(selectActiveCompetition([{ league: league("z"), seasons: [season("z-2026", "z", true, "2026-01-01")] }, { league: league("a"), seasons: [season("a-2026", "a", true, "2026-01-01")] }])?.league.id, "a");
  assert.equal(selectActiveCompetition([{ league: league("late"), seasons: [season("late-2026", "late", false, "2026-06-01")] }, { league: league("early"), seasons: [season("early-2026", "early", false, "2026-01-01")] }])?.league.id, "late");

  InMemoryStore.reset();
  await InMemoryStore.init();
  await upsertSport({ id: "soccer", name: "soccer", display_name: "Fútbol", emoji: "⚽", sport_specific: {} });
  await upsertLeague({ id: "fixture-arg", sport_id: "soccer", name: "Fixture Argentina", country: "Argentina", external_id: "fixture-provider:competition:1", sport_specific: {} });
  await upsertSeason({ id: "fixture-arg-2026", league_id: "fixture-arg", name: "2026", start_date: "2026-01-01", end_date: "2026-12-31", is_current: true, sport_specific: { active_priority: 100 } });
  const payload = { external_id: "fixture-provider:match:1", league_id: "fixture-arg", season_id: "fixture-arg-2026", home_team_id: "fixture-provider-team-1", away_team_id: "fixture-provider-team-2", match_date: now, status: "finished" as const, home_score: 1, away_score: 0, teams: [{ id: "fixture-provider-team-1", sport_id: "soccer", league_id: "fixture-arg", name: "Local", short_name: "LOC", external_id: "fixture-provider:team:1", sport_specific: {} }, { id: "fixture-provider-team-2", sport_id: "soccer", league_id: "fixture-arg", name: "Visita", short_name: "VIS", external_id: "fixture-provider:team:2", sport_specific: {} }], players: [{ id: "fixture-provider-player-1", sport_id: "soccer", team_id: "fixture-provider-team-1", full_name: "Uno", position: "Forward", external_id: "fixture-provider:player:1", sport_specific: {} }, { id: "fixture-provider-player-2", sport_id: "soccer", team_id: "fixture-provider-team-2", full_name: "Dos", position: "Forward", external_id: "fixture-provider:player:2", sport_specific: {} }], playerStats: [{ player_id: "fixture-provider-player-1", team_id: "fixture-provider-team-1", minutes_played: 90, specific: { side: "home" as const, goals: 1, assists: 0, yellow_cards: 0, red_cards: 0, shots: 2, passes: 10, pass_accuracy_pct: 80 } }] };
  const sport = getSportOrThrow("soccer") as unknown as { dataSources: Record<string, { id: string; name: string; fetch: (input: unknown) => Promise<unknown[]> }> };
  sport.dataSources["fixture-provider"] = { id: "fixture-provider", name: "Fixture provider", fetch: async () => [payload] };
  const before = await Promise.all([countTeams(), countPlayers(), countMatches(), countPlayerStats()]);
  assert.ok(await getLeagueById("demo-liga-1"), "el seed demo debe convivir con el provider de fixtures");
  await runIngestionJob("soccer", "fixture-provider");
  const afterFirst = await Promise.all([countTeams(), countPlayers(), countMatches(), countPlayerStats()]);
  await runIngestionJob("soccer", "fixture-provider");
  const afterSecond = await Promise.all([countTeams(), countPlayers(), countMatches(), countPlayerStats()]);
  assert.deepEqual(afterFirst, afterSecond, "la segunda importación no debe duplicar registros");
  assert.deepEqual(afterFirst.map((value, index) => value - before[index]), [2, 2, 1, 1]);
  assert.ok(await getLeagueById("demo-liga-1"), "la importación no debe eliminar el seed demo");
  sport.dataSources["fixture-provider"] = { id: "fixture-provider", name: "Broken fixture provider", fetch: async () => [{ ...payload, external_id: "" }] };
  const rejected = await runIngestionJob("soccer", "fixture-provider");
  assert.equal(rejected.errors.length, 1, "una entidad sin external_id debe quedar rechazada");
  assert.match(rejected.errors[0]?.error ?? "", /external_id estable/);
  sport.dataSources["fixture-provider"] = { id: "fixture-provider", name: "Broken team fixture provider", fetch: async () => [{ ...payload, teams: [{ ...payload.teams[0], external_id: "" }, payload.teams[1]] }] };
  const rejectedTeam = await runIngestionJob("soccer", "fixture-provider");
  assert.match(rejectedTeam.errors[0]?.error ?? "", /equipo requiere id y external_id/);
  sport.dataSources["fixture-provider"] = { id: "fixture-provider", name: "Broken player fixture provider", fetch: async () => [{ ...payload, players: [{ ...payload.players[0], external_id: "" }, payload.players[1]] }] };
  const rejectedPlayer = await runIngestionJob("soccer", "fixture-provider");
  assert.match(rejectedPlayer.errors[0]?.error ?? "", /jugador requiere id y external_id/);
  console.log("REAL_DATA_READINESS: PASS");
}

void main();
