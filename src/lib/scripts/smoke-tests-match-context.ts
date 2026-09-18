import assert from "node:assert/strict";
import { normalizeFixtureMatchContext } from "@/sports/soccer/data-sources/sportmonks-context-normalize";
import { enrichMatchContexts } from "@/lib/services/match-context-enrichment-service";

async function main() {
const fixture = {
  id: 19713923, venue_id: 1576,
  participants: [{ id: 86, meta: { location: "away" } }, { id: 2650, meta: { location: "home" } }],
  coaches: [
    { id: 1, display_name: "DT Visitante", image_path: "https://x/placeholder.png", meta: { participant_id: 86 } },
    { id: 2, display_name: "DT Local", image_path: "https://x/real.jpg", meta: { participant_id: 2650 } },
    { id: 3, display_name: "Sin vínculo", meta: {} },
  ],
  venue: { id: 1576, name: "Lyngby Stadion", capacity: 10000, surface: "grass", city: { name: "Lyngby" } },
};
const normalized = normalizeFixtureMatchContext(fixture);
assert.equal(normalized.coaches.find((c) => c.fullName === "DT Local")?.location, "home");
assert.equal(normalized.coaches.find((c) => c.fullName === "DT Visitante")?.location, "away");
assert.equal(normalized.coaches.length, 2);
assert.equal(normalized.coaches[0].imageIsPlaceholder, true);
assert.equal(normalized.venue?.name, "Lyngby Stadion");
assert.equal(normalizeFixtureMatchContext({ ...fixture, venue_id: 999 }).venue, null);

let requests = 0; let writes = 0;
const matches = [{ id: "m-soccer-sportmonks:match:19713923", home_team_id: "home", away_team_id: "away", match_date: "2026-09-20T10:00:00Z", sport_specific: { source: { external_id: "sportmonks:match:19713923" } } }];
const dry = await enrichMatchContexts(matches, { confirm: false, delayMs: 0 }, { fetchFixture: async () => { requests++; return fixture; }, persist: async () => { writes++; }, wait: async () => {} });
assert.equal(dry[0].status, "WOULD_ENRICH"); assert.equal(requests, 0); assert.equal(writes, 0);
const confirmed = await enrichMatchContexts(matches, { confirm: true, delayMs: 0 }, { fetchFixture: async () => { requests++; return fixture; }, persist: async () => { writes++; }, wait: async () => {} });
assert.equal(confirmed[0].status, "ENRICHED"); assert.equal(requests, 1); assert.equal(writes, 1);
console.log("match-context: 10/10 PASS");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
