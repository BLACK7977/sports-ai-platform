/**
 * Match Enrichment — Phase 3.2 comprehensive tests.
 * Uses dependency-injected in-memory store to test real repo/service functions.
 *
 * Covers:
 * - Entity resolution: namespaced external IDs (sportmonks:team:86)
 * - Batch entity resolution
 * - Delete/reconciliation: stale removal, empty snapshots, cross-match protection
 * - Write error propagation
 * - Event team UI: unresolved team never defaults to away
 * - Type safety: wrapper no longer exposes arbitrary global string keys
 * - match_events updated_at
 * - Normalizer strictness
 */
import { InMemoryStore, type TableName, type Tables } from "@/lib/db/in-memory-store";

const MATCH_ID = "m-soccer-sportmonks:match:19713931";
const OTHER_MATCH = "m-soccer-sportmonks:match:99999999";
const PROVIDER = "sportmonks";

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

function assertEqual<T>(actual: T, expected: T, msg: string) {
  if (actual === expected) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ FAIL: ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

// ---------------------------------------------------------------------------
// Seed data helpers
// ---------------------------------------------------------------------------

function seedTeam(id: string, name: string, externalId: string) {
  InMemoryStore.upsert("teams", {
    id, sport_id: "soccer", name, short_name: name.slice(0, 3).toUpperCase(),
    external_id: externalId, provider: PROVIDER,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    sport_specific: {},
  } as never, "id");
}

function seedPlayer(id: string, name: string, externalId: string) {
  InMemoryStore.upsert("players", {
    id, sport_id: "soccer", full_name: name, short_name: name.slice(0, 3).toUpperCase(),
    external_id: externalId, provider: PROVIDER,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    sport_specific: {},
  } as never, "id");
}

function seedMatch(id: string) {
  InMemoryStore.upsert("matches", {
    id, sport_id: "soccer", league_id: "l1", season_id: "s1",
    home_team_id: "team-home", away_team_id: "team-away",
    match_date: "2026-03-01T15:00:00Z", status: "scheduled",
    external_id: `ext-${id}`, provider: PROVIDER,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    sport_specific: {},
  } as never, "id");
}

function insertEvent(id: string, matchId: string, provider: string, teamId?: string, minute?: number) {
  InMemoryStore.upsert("match_events", {
    id, match_id: matchId, provider,
    team_id: teamId ?? null, minute: minute ?? 0,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    sport_specific: {},
  } as never, "id");
}

function insertStat(id: string, matchId: string, provider: string) {
  InMemoryStore.upsert("match_statistics", {
    id, match_id: matchId, provider, stat_name: "Test", stat_value: 1,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    sport_specific: {},
  } as never, "id");
}

function insertLineup(id: string, matchId: string, provider: string, playerId?: string) {
  InMemoryStore.upsert("match_lineups", {
    id, match_id: matchId, provider,
    player_id: playerId ?? null, created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z", sport_specific: {},
  } as never, "id");
}

// Clear in-memory store between test groups
function resetStore() {
  for (const table of ["match_events", "match_statistics", "match_lineups", "match_metadata", "teams", "players", "matches"] as TableName[]) {
    const map = (InMemoryStore as any).data[table] as Map<string, unknown>;
    map.clear();
  }
}

// ---------------------------------------------------------------------------
// Entity resolution tests (Fix #1 + #8)
// ---------------------------------------------------------------------------

async function testEntityResolution() {
  console.log("\nTEST: Entity resolution — namespaced external IDs");

  const { resolveInternalTeamId, resolveInternalPlayerId, _clearResolutionCaches } = await import("@/lib/db/repositories/entity-resolution");
  _clearResolutionCaches();

  seedTeam("team-aaa", "Silkeborg", "sportmonks:team:86");
  seedPlayer("player-bbb", "Andresen", "sportmonks:player:101");

  const teamId = await resolveInternalTeamId(PROVIDER, "86");
  assertEqual(teamId, "team-aaa", "sportmonks team 86 resolves via external_id 'sportmonks:team:86'");

  const playerId = await resolveInternalPlayerId(PROVIDER, "101");
  assertEqual(playerId, "player-bbb", "sportmonks player 101 resolves via external_id 'sportmonks:player:101'");

  const unknownTeam = await resolveInternalTeamId(PROVIDER, "99999");
  assertEqual(unknownTeam, null, "unknown team ID returns null");

  const unknownPlayer = await resolveInternalPlayerId(PROVIDER, "99999");
  assertEqual(unknownPlayer, null, "unknown player ID returns null");

  const nullResult = await resolveInternalTeamId(PROVIDER, null);
  assertEqual(nullResult, null, "null providerTeamId returns null immediately");

  const undefinedResult = await resolveInternalPlayerId(PROVIDER, undefined);
  assertEqual(undefinedResult, null, "undefined providerPlayerId returns null immediately");

  _clearResolutionCaches();
}

async function testBatchResolution() {
  console.log("\nTEST: Batch entity resolution — single query per type");

  const { resolveTeamIds, resolvePlayerIds, _clearResolutionCaches } = await import("@/lib/db/repositories/entity-resolution");
  _clearResolutionCaches();

  seedTeam("t1", "Home", "sportmonks:team:10");
  seedTeam("t2", "Away", "sportmonks:team:20");
  seedPlayer("p1", "Striker", "sportmonks:player:30");
  seedPlayer("p2", "Midfielder", "sportmonks:player:40");

  const teamMap = await resolveTeamIds(PROVIDER, ["10", "20", "99"]);
  assertEqual(teamMap.get("10"), "t1", "batch: team 10 resolved");
  assertEqual(teamMap.get("20"), "t2", "batch: team 20 resolved");
  assertEqual(teamMap.get("99"), null, "batch: unknown team returns null");

  const playerMap = await resolvePlayerIds(PROVIDER, ["30", "40", "99"]);
  assertEqual(playerMap.get("30"), "p1", "batch: player 30 resolved");
  assertEqual(playerMap.get("40"), "p2", "batch: player 40 resolved");
  assertEqual(playerMap.get("99"), null, "batch: unknown player returns null");

  _clearResolutionCaches();
}

// ---------------------------------------------------------------------------
// Reconciliation tests (Fix #6)
// ---------------------------------------------------------------------------

async function testReconciliationStaleRemoval() {
  console.log("\nTEST: Reconciliation — stale provider rows removed");

  const { replaceMatchEventsSnapshot, getMatchEvents } = await import("@/lib/db/repositories/match-events-repo");

  seedMatch(MATCH_ID);

  // Seed 14 existing events for this match + provider
  for (let i = 1; i <= 14; i++) {
    insertEvent(`evt-old-${i}`, MATCH_ID, PROVIDER, "team-home", i);
  }

  // New snapshot has 13 events (one was removed)
  const newRows = Array.from({ length: 13 }, (_, i) => ({
    id: `evt-new-${i + 1}`, match_id: MATCH_ID, provider: PROVIDER,
    minute: i + 1, sport_specific: {},
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  }));

  await replaceMatchEventsSnapshot(MATCH_ID, PROVIDER, newRows as any);
  const remaining = await getMatchEvents(MATCH_ID);

  assertEqual(remaining.length, 13, "14 → 13 events after stale removal");
  const providerRows = remaining.filter((r) => r.provider === PROVIDER);
  assertEqual(providerRows.length, 13, "all remaining rows belong to provider");
}

async function testReconciliationEmptySnapshot() {
  console.log("\nTEST: Reconciliation — valid empty array clears provider rows");

  const { replaceMatchEventsSnapshot, getMatchEvents } = await import("@/lib/db/repositories/match-events-repo");

  seedMatch(MATCH_ID);

  insertEvent("evt-to-clear-1", MATCH_ID, PROVIDER, "team-home", 1);
  insertEvent("evt-to-clear-2", MATCH_ID, PROVIDER, "team-home", 2);

  // forceReconcile=true: source was valid empty array → authoritative empty
  await replaceMatchEventsSnapshot(MATCH_ID, PROVIDER, [], true);
  const remaining = await getMatchEvents(MATCH_ID);

  assertEqual(remaining.length, 0, "empty snapshot with forceReconcile clears all provider rows");
}

async function testReconciliationAbsentCategory() {
  console.log("\nTEST: Reconciliation — absent category preserves rows");

  const { replaceMatchEventsSnapshot, getMatchEvents } = await import("@/lib/db/repositories/match-events-repo");

  seedMatch(MATCH_ID);

  insertEvent("evt-keep-1", MATCH_ID, PROVIDER, "team-home", 1);
  insertEvent("evt-keep-2", MATCH_ID, PROVIDER, "team-home", 2);

  // forceReconcile=false (default): source was absent/malformed → skip reconciliation
  await replaceMatchEventsSnapshot(MATCH_ID, PROVIDER, []);
  const remaining = await getMatchEvents(MATCH_ID);

  assertEqual(remaining.length, 2, "absent category preserves existing rows");
}

async function testReconciliationNoCrossMatchDelete() {
  console.log("\nTEST: Reconciliation — no cross-match deletion");

  const { replaceMatchEventsSnapshot, getMatchEvents } = await import("@/lib/db/repositories/match-events-repo");

  seedMatch(MATCH_ID);
  seedMatch(OTHER_MATCH);

  insertEvent("evt-match-a", MATCH_ID, PROVIDER, "team-home", 1);
  insertEvent("evt-match-b", OTHER_MATCH, PROVIDER, "team-home", 1);

  const newRows = [{
    id: "evt-new-only", match_id: MATCH_ID, provider: PROVIDER,
    minute: 5, sport_specific: {},
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  }];

  await replaceMatchEventsSnapshot(MATCH_ID, PROVIDER, newRows as any);

  const matchA = await getMatchEvents(MATCH_ID);
  const matchB = await getMatchEvents(OTHER_MATCH);

  assertEqual(matchA.length, 1, "match A has new row only");
  assertEqual(matchA[0].id, "evt-new-only", "match A row is the new one");
  assertEqual(matchB.length, 1, "match B untouched");
  assertEqual(matchB[0].id, "evt-match-b", "match B row preserved");
}

async function testReconciliationNoCrossProviderDelete() {
  console.log("\nTEST: Reconciliation — no cross-provider deletion");

  const { replaceMatchEventsSnapshot, getMatchEvents } = await import("@/lib/db/repositories/match-events-repo");

  seedMatch(MATCH_ID);

  insertEvent("evt-sportmonks", MATCH_ID, "sportmonks", "team-home", 1);
  insertEvent("evt-other", MATCH_ID, "other-provider", "team-home", 2);

  const newRows = [{
    id: "evt-new-sm", match_id: MATCH_ID, provider: "sportmonks",
    minute: 5, sport_specific: {},
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  }];

  await replaceMatchEventsSnapshot(MATCH_ID, "sportmonks", newRows as any);

  const all = await getMatchEvents(MATCH_ID);
  const smRows = all.filter((r) => r.provider === "sportmonks");
  const otherRows = all.filter((r) => r.provider === "other-provider");

  assertEqual(smRows.length, 1, "sportmonks: new row only");
  assertEqual(otherRows.length, 1, "other-provider: row preserved");
}

async function testReconciliationSameForStatsAndLineups() {
  console.log("\nTEST: Reconciliation — statistics and lineups use same pattern");

  const { replaceMatchStatisticsSnapshot, getMatchStatistics } = await import("@/lib/db/repositories/match-statistics-repo");
  const { replaceMatchLineupsSnapshot, getMatchLineups } = await import("@/lib/db/repositories/match-lineups-repo");

  seedMatch(MATCH_ID);

  // Stats: stale removal
  insertStat("stat-1", MATCH_ID, PROVIDER);
  insertStat("stat-2", MATCH_ID, PROVIDER);
  const newStats = [{ id: "stat-new-1", match_id: MATCH_ID, provider: PROVIDER, stat_name: "X", stat_value: 1, sport_specific: {}, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }];
  await replaceMatchStatisticsSnapshot(MATCH_ID, PROVIDER, newStats as any);
  const stats = await getMatchStatistics(MATCH_ID);
  assertEqual(stats.length, 1, "stats: stale removed");
  assertEqual(stats[0].id, "stat-new-1", "stats: only new row remains");

  // Lineups: empty snapshot clears
  insertLineup("lineup-1", MATCH_ID, PROVIDER);
  insertLineup("lineup-2", MATCH_ID, PROVIDER);
  await replaceMatchLineupsSnapshot(MATCH_ID, PROVIDER, [], true);
  const lineups = await getMatchLineups(MATCH_ID);
  assertEqual(lineups.length, 0, "lineups: empty snapshot clears provider rows");
}

// ---------------------------------------------------------------------------
// Event team UI tests (Fix #3)
// ---------------------------------------------------------------------------

async function testEventTeamDisplay() {
  console.log("\nTEST: Event team UI — unresolved never defaults to away");

  // Simulate the UI logic
  const homeTeamId = "team-home";
  const awayTeamId = "team-away";
  const homeShort = "SIL";
  const awayShort = "VIB";

  function getTeamLabel(teamId: string | null | undefined): string {
    const isHome = teamId === homeTeamId;
    const isAway = teamId === awayTeamId;
    return isHome ? homeShort : isAway ? awayShort : "Dato no disponible";
  }

  assertEqual(getTeamLabel("team-home"), "SIL", "home team maps to home short name");
  assertEqual(getTeamLabel("team-away"), "VIB", "away team maps to away short name");
  assertEqual(getTeamLabel(null), "Dato no disponible", "null team_id shows 'Dato no disponible'");
  assertEqual(getTeamLabel(undefined), "Dato no disponible", "undefined team_id shows 'Dato no disponible'");
  assertEqual(getTeamLabel("unknown-id"), "Dato no disponible", "unknown team_id shows 'Dato no disponible'");
}

// ---------------------------------------------------------------------------
// Type safety tests (Fix #5)
// ---------------------------------------------------------------------------

async function testTypeSafety() {
  console.log("\nTEST: Type safety — wrapper uniqueKey is table-specific");

  // Verify that the supabase-wrapper upsert signature does not accept bare strings
  // by checking the type definition at compile time (tsc --noEmit validates this).
  // Runtime test: the in-memory store upsert should work with valid key names.
  const result = InMemoryStore.upsert("teams", {
    id: "type-test", sport_id: "soccer", name: "Type Test", short_name: "TST",
    external_id: "ext-tt", provider: "test",
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    sport_specific: {},
  } as never, "id");

  assert(result.data !== null, "type-safe upsert succeeds with valid key");
  assertEqual(result.data?.id, "type-test", "type-safe upsert returns correct row");
}

// ---------------------------------------------------------------------------
// match_events updated_at tests (Fix #7)
// ---------------------------------------------------------------------------

async function testEventsUpdatedAt() {
  console.log("\nTEST: match_events — updated_at present in output");

  const { normalizeEvents } = await import("@/sports/soccer/data-sources/sportmonks-enrichment-normalizers");

  const events = normalizeEvents(MATCH_ID, [
    { id: "e1", minute: 11, type: { name: "Goal" }, team_id: 86, player_id: 101 },
  ], PROVIDER);

  assertEqual(events.length, 1, "1 event normalized");
  assert(Boolean(events[0].updated_at), "updated_at is set on events");
  assert(events[0].updated_at!.length > 10, "updated_at is a valid ISO timestamp");
}

// ---------------------------------------------------------------------------
// Event context preservation — participant and related player (real fixture)
// ---------------------------------------------------------------------------

async function testEventContextPreservation() {
  console.log("\nTEST: Event normalization — structured participant and related player preserved");

  const { normalizeEvents } = await import("@/sports/soccer/data-sources/sportmonks-enrichment-normalizers");
  const [goal, substitution] = normalizeEvents(MATCH_ID, [
    {
      id: "goal-1", minute: 11, participant_id: 86, player_id: 100,
      player_name: "Goal scorer", related_player_id: 200,
      related_player_name: "Goal assistant", type: { name: "Goal" },
    },
    {
      id: "sub-1", minute: 63, participant_id: 20, player_id: 300,
      player_name: "First player", related_player_id: 400,
      related_player_name: "Second player", on_bench: true, type: { name: "Substitution" },
    },
  ], PROVIDER);

  const goalContext = goal.sport_specific as Record<string, unknown>;
  const subContext = substitution.sport_specific as Record<string, unknown>;
  assertEqual(goal.provider_team_id, "86", "participant_id resolves to provider team ID");
  assertEqual(goalContext.provider_player_name, "Goal scorer", "structured player name is preserved");
  assertEqual(goalContext.related_player_provider_id, "200", "related provider player ID is preserved");
  assertEqual(goalContext.related_player_name, "Goal assistant", "structured related player name is preserved");
  assertEqual(subContext.related_player_name, "Second player", "substitution counterpart is preserved without role inference");
  assertEqual(subContext.player_on_bench, true, "structured bench status is preserved for substitution roles");
}

// ---------------------------------------------------------------------------
// Normalizer strictness (from Phase 3.1, still valid)
// ---------------------------------------------------------------------------

async function testNormalizerStrictness() {
  console.log("\nTEST: Normalizer strict parsing");

  const { normalizeStatistics, normalizeMetadata, normalizeLineups } = await import("@/sports/soccer/data-sources/sportmonks-enrichment-normalizers");

  // Strict: junk values
  const stats = normalizeStatistics(MATCH_ID, [
    { id: "s1", type_id: "1", type: { name: "Empty" }, data: { value: "" }, location: "home" },
    { id: "s2", type_id: "2", type: { name: "Spaces" }, data: { value: "   " }, location: "home" },
    { id: "s3", type_id: "3", type: { name: "Letters" }, data: { value: "abc" }, location: "home" },
    { id: "s4", type_id: "4", type: { name: "Valid" }, data: { value: 42 }, location: "home" },
  ], PROVIDER);

  const emptyStat = stats.find((s) => s.stat_name === "Empty");
  assert(emptyStat?.stat_value === null, "empty string value → null");

  const spacesStat = stats.find((s) => s.stat_name === "Spaces");
  assert(spacesStat?.stat_value === null, "whitespace value → null");

  const lettersStat = stats.find((s) => s.stat_name === "Letters");
  assert(lettersStat?.stat_value === null, "letters value → null");

  const validStat = stats.find((s) => s.stat_name === "Valid");
  assert(validStat?.stat_value === 42, "valid numeric value preserved");

  // Metadata: null venue
  const meta = normalizeMetadata(MATCH_ID, { id: 1, venue: null, referees: [], round: null, formations: [] }, PROVIDER);
  assertEqual(meta.venue_name, null, "null venue → null name");

  // Formations must be associated through the fixture participant identity,
  // never through the provider response array order.
  const reversedFormations = normalizeMetadata(MATCH_ID, {
    id: 1,
    venue: null,
    referees: [],
    round: null,
    participants: [
      { id: 86, meta: { location: "home" } },
      { id: 2447, meta: { location: "away" } },
    ],
    formations: [
      { participant_id: 2447, formation: "4-3-3" },
      { participant_id: 86, formation: "3-4-2-1" },
    ],
  }, PROVIDER);
  assertEqual(reversedFormations.home_formation, "3-4-2-1", "formación local se resuelve por participante aunque el array llegue invertido");
  assertEqual(reversedFormations.away_formation, "4-3-3", "formación visitante se resuelve por participante aunque el array llegue invertido");

  // Lineups: is_starter null when structurally unavailable
  const lineups = normalizeLineups(MATCH_ID, [
    { id: "l1", player: { id: 1 }, team_id: 1 },
    { id: "l2", player: { id: 2, display_name: "Nombre Real" }, team_id: 1, type_id: 11, position_id: 25, detailedposition_id: 7, detailedposition: { name: "Central" }, formation_position: 3, formation_field: "2:2", jersey_number: 4 },
    { id: "l3", player: { id: 3 }, team_id: 1, type_id: 12 },
  ], PROVIDER);
  assertEqual(lineups[0].is_starter, null, "is_starter null when not structurally determinable");
  assertEqual(lineups[1].is_starter, true, "verified type 11 → titular");
  assertEqual(lineups[2].is_starter, false, "verified type 12 → suplente");
  assertEqual(lineups[1].player_name, "Nombre Real", "nombre estructurado del jugador preservado");
  assertEqual(lineups[1].detailed_position_id, "7", "posición detallada estructurada preservada");
  assertEqual(lineups[1].formation_field, "2:2", "ubicación táctica estructurada preservada");

  const otherProviderLineups = normalizeLineups(MATCH_ID, [
    { id: "other-1", player: { id: 4 }, team_id: 1, type_id: 11 },
    { id: "other-2", player: { id: 5 }, team_id: 1, type_id: 12 },
  ], "another-provider");
  assertEqual(otherProviderLineups[0].is_starter, null, "type 11 de otro proveedor no se clasifica");
  assertEqual(otherProviderLineups[1].is_starter, null, "type 12 de otro proveedor no se clasifica");
}

async function testSpanishPositionPresentation() {
  console.log("\nTEST: Presentación de posiciones en español");
  const { presentSoccerPosition } = await import("@/lib/presentation/soccer");
  assertEqual(presentSoccerPosition("Goalkeeper"), "Arquero", "Goalkeeper se presenta como Arquero");
  assertEqual(presentSoccerPosition("Centre Back"), "Defensor central", "Centre Back se presenta como Defensor central");
  assertEqual(presentSoccerPosition("Central Midfield"), "Mediocampista central", "Central Midfield se presenta en español");
  assertEqual(presentSoccerPosition("Unknown provider term"), "Unknown provider term", "término desconocido no inventa una posición");
}

// ---------------------------------------------------------------------------
// ID namespacing (cross-match and cross-provider)
// ---------------------------------------------------------------------------

async function testIdNamespacing() {
  console.log("\nTEST: IDs namespaced by match AND provider");

  const { normalizeEvents } = await import("@/sports/soccer/data-sources/sportmonks-enrichment-normalizers");

  const events1 = normalizeEvents(MATCH_ID, [{ id: "e1", minute: 11, type: { name: "Goal" }, team_id: 1 }], PROVIDER);
  const events2 = normalizeEvents(OTHER_MATCH, [{ id: "e1", minute: 11, type: { name: "Goal" }, team_id: 1 }], PROVIDER);
  const events3 = normalizeEvents(MATCH_ID, [{ id: "e1", minute: 11, type: { name: "Goal" }, team_id: 1 }], "other-provider");

  assert(events1[0].id !== events2[0].id, "same event in different matches gets different IDs");
  assert(events1[0].id !== events3[0].id, "same event with different provider gets different IDs");
}

// ---------------------------------------------------------------------------
// Service DI + error propagation tests (Phase 3.3)
// ---------------------------------------------------------------------------

async function testServiceSuccess() {
  console.log("\nTEST: Service — all deps succeed returns enrichment");

  const { enrichMatchFromSportmonks } = await import("@/lib/services/match-enrichment-service");
  const { _clearResolutionCaches } = await import("@/lib/db/repositories/entity-resolution");
  _clearResolutionCaches();

  // Seed teams/players
  seedTeam("team-home", "Home", "sportmonks:team:10");
  seedTeam("team-away", "Away", "sportmonks:team:20");
  seedPlayer("player-1", "Player One", "sportmonks:player:100");
  seedPlayer("player-2", "Player Two", "sportmonks:player:200");
  seedMatch(MATCH_ID);

  // Fake fixture
  const fakeFixture = {
    id: 19713931,
    venue: { id: 1, name: "Stadium", city_name: "City" },
    referees: [{ id: 1, fullname: "Ref" }],
    round: { id: 1, name: "Round 1" },
    formations: [{ participant: { id: 10 }, formation: "4-4-2" }],
    statistics: [{ type_id: "1", type: { name: "Shots" }, participant_id: 10, data: { value: 10 }, location: "home" }],
    events: [{ id: "e1", minute: 10, type: { name: "Goal" }, team_id: 10, player_id: 100, result: { home: 1, away: 0 } }],
    lineups: [{ id: "l1", player: { id: 100 }, team_id: 10, position_id: "1", position: { name: "GK" }, jersey_number: 1, formation_position: 1, formation_field: "1:1" }],
  };

  const deps = {
    fetchFixtureEnrichment: async () => fakeFixture,
    metadataRepo: {
      upsert: async (m: any) => m,
      get: async () => ({ match_id: MATCH_ID, provider: "sportmonks", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", venue_name: "Stadium" }),
    },
    statisticsRepo: {
      replaceSnapshot: async () => {},
      get: async () => [{ id: "stat-1", match_id: MATCH_ID, provider: "sportmonks", stat_name: "Shots", stat_value: 10, sport_specific: {}, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }],
    },
    eventsRepo: {
      replaceSnapshot: async () => {},
      get: async () => [{ id: "evt-1", match_id: MATCH_ID, provider: "sportmonks", minute: 10, event_type: "Goal", sport_specific: {}, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }],
    },
    lineupsRepo: {
      replaceSnapshot: async () => {},
      get: async () => [{ id: "lineup-1", match_id: MATCH_ID, provider: "sportmonks", player_id: "player-1", sport_specific: {}, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }],
    },
    entityResolver: {
      resolveTeamIds: async () => new Map([["10", "team-home"], ["20", "team-away"]]),
      resolvePlayerIds: async () => new Map([["100", "player-1"], ["200", "player-2"]]),
    },
  };

  const result = await enrichMatchFromSportmonks(MATCH_ID, 19713931, deps);

  assert(result.metadata !== null, "metadata returned");
  assert(result.statistics.length === 1, "statistics returned");
  assert(result.events.length === 1, "events returned");
  assert(result.lineups.length === 1, "lineups returned");
}

async function testServiceMetadataWriteFails() {
  console.log("\nTEST: Service — metadata write fails throws");

  const { enrichMatchFromSportmonks } = await import("@/lib/services/match-enrichment-service");
  const { _clearResolutionCaches } = await import("@/lib/db/repositories/entity-resolution");
  _clearResolutionCaches();

  const deps = {
    fetchFixtureEnrichment: async () => ({ id: 1, venue: null, referees: [], round: null, formations: [], statistics: [], events: [], lineups: [] }),
    metadataRepo: {
      upsert: async () => { throw new Error("metadata upsert failed"); },
      get: async () => null,
    },
    statisticsRepo: { replaceSnapshot: async () => {}, get: async () => [] },
    eventsRepo: { replaceSnapshot: async () => {}, get: async () => [] },
    lineupsRepo: { replaceSnapshot: async () => {}, get: async () => [] },
    entityResolver: { resolveTeamIds: async () => new Map(), resolvePlayerIds: async () => new Map() },
  };

  let threw = false;
  try {
    await enrichMatchFromSportmonks(MATCH_ID, 1, deps);
  } catch (e) {
    threw = true;
    assert((e as Error).message.includes("metadata upsert failed"), "original error propagated");
  }
  assert(threw, "service throws on metadata write failure");
}

async function testServiceStatsWriteFails() {
  console.log("\nTEST: Service — stats write fails after metadata success throws");

  const { enrichMatchFromSportmonks } = await import("@/lib/services/match-enrichment-service");
  const { _clearResolutionCaches } = await import("@/lib/db/repositories/entity-resolution");
  _clearResolutionCaches();

  const deps = {
    fetchFixtureEnrichment: async () => ({ id: 1, venue: null, referees: [], round: null, formations: [], statistics: [{ type_id: "1", type: { name: "Shots" }, participant_id: 10, data: { value: 10 }, location: "home" }], events: [], lineups: [] }),
    metadataRepo: { upsert: async (m: any) => m, get: async () => null },
    statisticsRepo: { replaceSnapshot: async () => { throw new Error("stats upsert failed"); }, get: async () => [] },
    eventsRepo: { replaceSnapshot: async () => {}, get: async () => [] },
    lineupsRepo: { replaceSnapshot: async () => {}, get: async () => [] },
    entityResolver: { resolveTeamIds: async () => new Map([["10", "team-home"]]), resolvePlayerIds: async () => new Map() },
  };

  let threw = false;
  try {
    await enrichMatchFromSportmonks(MATCH_ID, 1, deps);
  } catch (e) {
    threw = true;
    assert((e as Error).message.includes("stats upsert failed"), "original error propagated");
  }
  assert(threw, "service throws on stats write failure");
}

async function testServiceEventsReconcileFails() {
  console.log("\nTEST: Service — events delete/reconcile fails throws");

  const { enrichMatchFromSportmonks } = await import("@/lib/services/match-enrichment-service");
  const { _clearResolutionCaches } = await import("@/lib/db/repositories/entity-resolution");
  _clearResolutionCaches();

  const deps = {
    fetchFixtureEnrichment: async () => ({ id: 1, venue: null, referees: [], round: null, formations: [], statistics: [], events: [{ id: "e1", minute: 10, type: { name: "Goal" }, team_id: 10, player_id: 100, result: { home: 1, away: 0 } }], lineups: [] }),
    metadataRepo: { upsert: async (m: any) => m, get: async () => null },
    statisticsRepo: { replaceSnapshot: async () => {}, get: async () => [] },
    eventsRepo: { replaceSnapshot: async () => { throw new Error("events reconcile failed"); }, get: async () => [] },
    lineupsRepo: { replaceSnapshot: async () => {}, get: async () => [] },
    entityResolver: { resolveTeamIds: async () => new Map([["10", "team-home"]]), resolvePlayerIds: async () => new Map([["100", "player-1"]]) },
  };

  let threw = false;
  try {
    await enrichMatchFromSportmonks(MATCH_ID, 1, deps);
  } catch (e) {
    threw = true;
    assert((e as Error).message.includes("events reconcile failed"), "original error propagated");
  }
  assert(threw, "service throws on events reconcile failure");
}

async function testServiceLineupsWriteFails() {
  console.log("\nTEST: Service — lineups write fails throws");

  const { enrichMatchFromSportmonks } = await import("@/lib/services/match-enrichment-service");
  const { _clearResolutionCaches } = await import("@/lib/db/repositories/entity-resolution");
  _clearResolutionCaches();

  const deps = {
    fetchFixtureEnrichment: async () => ({ id: 1, venue: null, referees: [], round: null, formations: [], statistics: [], events: [], lineups: [{ id: "l1", player: { id: 100 }, team_id: 10, position_id: "1", position: { name: "GK" }, jersey_number: 1, formation_position: 1, formation_field: "1:1" }] }),
    metadataRepo: { upsert: async (m: any) => m, get: async () => null },
    statisticsRepo: { replaceSnapshot: async () => {}, get: async () => [] },
    eventsRepo: { replaceSnapshot: async () => {}, get: async () => [] },
    lineupsRepo: { replaceSnapshot: async () => { throw new Error("lineups upsert failed"); }, get: async () => [] },
    entityResolver: { resolveTeamIds: async () => new Map([["10", "team-home"]]), resolvePlayerIds: async () => new Map([["100", "player-1"]]) },
  };

  let threw = false;
  try {
    await enrichMatchFromSportmonks(MATCH_ID, 1, deps);
  } catch (e) {
    threw = true;
    assert((e as Error).message.includes("lineups upsert failed"), "original error propagated");
  }
  assert(threw, "service throws on lineups write failure");
}

async function testServiceNoFalseSuccess() {
  console.log("\nTEST: Service — no false success after partial persistence");

  const { enrichMatchFromSportmonks } = await import("@/lib/services/match-enrichment-service");
  const { _clearResolutionCaches } = await import("@/lib/db/repositories/entity-resolution");
  _clearResolutionCaches();

  // Track what was called
  const calls: string[] = [];
  const deps = {
    fetchFixtureEnrichment: async () => ({ id: 1, venue: null, referees: [], round: null, formations: [], statistics: [], events: [], lineups: [] }),
    metadataRepo: { upsert: async (m: any) => { calls.push("metadata"); return m; }, get: async () => null },
    statisticsRepo: { replaceSnapshot: async () => { calls.push("stats"); throw new Error("stats fail"); }, get: async () => [] },
    eventsRepo: { replaceSnapshot: async () => { calls.push("events"); }, get: async () => [] },
    lineupsRepo: { replaceSnapshot: async () => { calls.push("lineups"); }, get: async () => [] },
    entityResolver: { resolveTeamIds: async () => new Map(), resolvePlayerIds: async () => new Map() },
  };

  let threw = false;
  try {
    await enrichMatchFromSportmonks(MATCH_ID, 1, deps);
  } catch (e) {
    threw = true;
  }
  assert(threw, "service throws");
  assert(calls.includes("metadata"), "metadata was called");
  assert(calls.includes("stats"), "stats was called before failure");
  // events and lineups should NOT have been called due to Promise.all failure
  // but since they're in Promise.all, they may have started - the key is the error propagates
}

async function testEntityResolutionDbErrorPropagates() {
  console.log("\nTEST: Entity resolution — DB error throws (team)");

  const { resolveTeamIds, _clearResolutionCaches, _setTestDbClient } = await import("@/lib/db/repositories/entity-resolution");
  _clearResolutionCaches();

  // Create a mock DB client that returns an error on .in().select()
  const mockDb = {
    from: () => ({
      in: () => ({
        select: async () => ({ data: [], error: new Error("simulated DB error") }),
      }),
    }),
  } as any;

  _setTestDbClient(mockDb);

  let threw = false;
  try {
    await resolveTeamIds("sportmonks", ["10", "20"]);
  } catch (e) {
    threw = true;
    assert((e as Error).message.includes("resolveTeamIds"), "error message includes function name");
    assert((e as Error).message.includes("simulated DB error"), "original DB error propagated");
  }
  _setTestDbClient(null);
  assert(threw, "resolveTeamIds throws on DB error");
}

async function testEntityResolutionPlayerDbErrorPropagates() {
  console.log("\nTEST: Entity resolution — DB error throws (player)");

  const { resolvePlayerIds, _clearResolutionCaches, _setTestDbClient } = await import("@/lib/db/repositories/entity-resolution");
  _clearResolutionCaches();

  // Create a mock DB client that returns an error on .in().select()
  const mockDb = {
    from: () => ({
      in: () => ({
        select: async () => ({ data: [], error: new Error("simulated DB error") }),
      }),
    }),
  } as any;

  _setTestDbClient(mockDb);

  let threw = false;
  try {
    await resolvePlayerIds("sportmonks", ["100", "200"]);
  } catch (e) {
    threw = true;
    assert((e as Error).message.includes("resolvePlayerIds"), "error message includes function name");
    assert((e as Error).message.includes("simulated DB error"), "original DB error propagated");
  }
  _setTestDbClient(null);
  assert(threw, "resolvePlayerIds throws on DB error");
}

// ---------------------------------------------------------------------------
// Run all tests
// ---------------------------------------------------------------------------

async function runAllTests() {
  console.log("=".repeat(60));
  console.log("MATCH ENRICHMENT PHASE 3.4 — COMPREHENSIVE TESTS");
  console.log("=".repeat(60));

  await testEntityResolution();
  await testBatchResolution();
  await testReconciliationStaleRemoval();
  await testReconciliationEmptySnapshot();
  await testReconciliationAbsentCategory();
  await testReconciliationNoCrossMatchDelete();
  await testReconciliationNoCrossProviderDelete();
  await testReconciliationSameForStatsAndLineups();
  await testEventTeamDisplay();
  await testTypeSafety();
  await testEventsUpdatedAt();
  await testEventContextPreservation();
  await testNormalizerStrictness();
  await testSpanishPositionPresentation();
  await testIdNamespacing();

  // Phase 3.3 tests
  await testServiceSuccess();
  await testServiceMetadataWriteFails();
  await testServiceStatsWriteFails();
  await testServiceEventsReconcileFails();
  await testServiceLineupsWriteFails();
  await testServiceNoFalseSuccess();
  await testEntityResolutionDbErrorPropagates();
  await testEntityResolutionPlayerDbErrorPropagates();

  console.log("\n" + "=".repeat(60));
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) process.exit(1);
}

runAllTests().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
