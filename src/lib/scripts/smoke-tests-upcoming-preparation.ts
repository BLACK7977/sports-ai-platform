import assert from "node:assert/strict";
import { prepareUpcomingPredictions, type PreparationDeps } from "@/lib/services/upcoming-preparation-service";
import { isFutureScheduledMatch } from "@/lib/db/repositories/matches-repo";
import { persistedVenueView } from "@/lib/presentation/match-venue";
import { getDefaultParameters } from "@/lib/ai/probability-model";
import type { Match } from "@/types/db/tables";
import type { PredictionStore, StoredPrediction } from "@/lib/ai/prediction-service";

const NOW = Date.parse("2026-09-16T12:00:00Z");
const match = (id: string, date = "2026-09-17T12:00:00Z", status: Match["status"] = "scheduled"): Match => ({ id, sport_id: "soccer", league_id: "l", season_id: "s", home_team_id: "h", away_team_id: "a", match_date: date, status, home_score: null, away_score: null, sport_specific: {}, created_at: "", updated_at: "" });
const prediction: StoredPrediction = { id: 1, match_id: "m1", market_id: "1x2", model_version_id: "v1-dixon-coles-2026-01", model_probabilities: { home: .4, draw: .3, away: .3 }, data_snapshot: {}, predicted_at: "2026-09-16T10:00:00Z", kickoff_at: "2026-09-17T12:00:00Z" };

function setup(options: { existing?: boolean; fallback?: boolean; invalidProbs?: boolean; reread?: Match | null; insertRace?: boolean } = {}) {
  let writes = 0;
  const store: PredictionStore = {
    getMatchById: async () => match("m1"),
    getModelVersionById: async () => ({ id: "v1-dixon-coles-2026-01", is_active: true, parameters: { ...getDefaultParameters(), homeAdvFactor: 1 } }),
    getMarketById: async () => ({ id: "1x2" }),
    findExisting: async () => options.existing || (options.insertRace && writes > 0) ? prediction : null,
    insert: async () => { writes++; if (options.insertRace) throw new Error("duplicate"); return prediction; },
    getLatest: async () => null, listByMatch: async () => [], listRecent: async () => [],
  };
  const deps: PreparationDeps = {
    listEligible: async () => [match("m1")],
    getMatch: async () => options.reread === undefined ? match("m1") : options.reread,
    prediction: {
      store,
      nowMs: () => NOW,
      runModel: {
        run: async () => ({
          probabilities: options.invalidProbs ? { home: .8, draw: .8, away: .8 } : { home: .4, draw: .3, away: .3 },
          expectedGoals: { home: 1.2, away: 1 },
          usedFallback: options.fallback ?? false,
          fallbackReason: options.fallback ? "insufficient" : "",
          dataQuality: { homeMatchesUsed: 6, awayMatchesUsed: 6, leagueMatchesUsed: 20 },
          parameters: getDefaultParameters(),
        }),
      },
    },
  };
  return { deps, writes: () => writes };
}

async function main() {
  let tests = 0; const ok = (value: unknown, msg: string) => { assert.ok(value, msg); tests++; };
  ok(isFutureScheduledMatch(match("x"), NOW), "scheduled future eligible");
  ok(!isFutureScheduledMatch(match("x", "2026-09-15T12:00:00Z"), NOW), "scheduled past ineligible");
  { const x = setup({ existing: true }); const r = await prepareUpcomingPredictions({ dryRun: false, nowMs: () => NOW }, x.deps); ok(r.items[0].outcome === "SKIPPED_EXISTING" && x.writes() === 0, "existing frozen prediction skipped"); }
  { const x = setup({ reread: match("m1", "2026-09-16T11:00:00Z") }); const r = await prepareUpcomingPredictions({ dryRun: false, nowMs: () => NOW }, x.deps); ok(r.items[0].outcome === "SKIPPED_INELIGIBLE", "kickoff passed while processing"); }
  { const x = setup({ insertRace: true }); const r = await prepareUpcomingPredictions({ dryRun: false, nowMs: () => NOW }, x.deps); ok(r.items[0].outcome === "SKIPPED_EXISTING", "race returns canonical prediction"); }
  { const x = setup(); const r = await prepareUpcomingPredictions({ nowMs: () => NOW }, x.deps); ok(r.dryRun && r.items[0].outcome === "WOULD_CREATE" && x.writes() === 0, "dry run writes zero"); }
  { const x = setup({ fallback: true }); const r = await prepareUpcomingPredictions({ dryRun: false, nowMs: () => NOW }, x.deps); ok(r.items[0].outcome === "FAILED" && x.writes() === 0, "fallback probabilities rejected"); }
  { const x = setup({ invalidProbs: true }); const r = await prepareUpcomingPredictions({ dryRun: false, nowMs: () => NOW }, x.deps); ok(r.items[0].outcome === "FAILED" && x.writes() === 0, "invalid model input is isolated"); }
  { const x = setup(); const r = await prepareUpcomingPredictions({ dryRun: false, nowMs: () => NOW }, x.deps); ok(r.items[0].outcome === "CREATED" && x.writes() === 1, "confirmed path inserts once and never updates"); }
  ok(persistedVenueView(null) === null, "venue missing neutral");
  const venue = persistedVenueView({ match_id: "m", venue_name: "JYSK park", venue_city: "Silkeborg", venue_capacity: 10000, venue_surface: "grass", created_at: "", updated_at: "" });
  ok(venue?.name === "JYSK park" && venue.capacity === 10000, "persisted venue displayed");
  console.log(`Upcoming preparation tests: ${tests}/${tests} PASS`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
