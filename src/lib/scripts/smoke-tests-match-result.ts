import { strict as assert } from "node:assert";
import { validFinishedResult } from "@/lib/presentation/match-result";

const checks: Array<[string, { status: "finished" | "scheduled"; home_score?: number | null; away_score?: number | null }, { home: number; away: number } | null]> = [
  ["real finished 0-0 stays valid", { status: "finished", home_score: 0, away_score: 0 }, { home: 0, away: 0 }],
  ["null-null is not a result", { status: "finished", home_score: null, away_score: null }, null],
  ["partial home score is not a result", { status: "finished", home_score: 2, away_score: null }, null],
  ["partial away score is not a result", { status: "finished", home_score: null, away_score: 2 }, null],
  ["finished valid score is accepted", { status: "finished", home_score: 2, away_score: 1 }, { home: 2, away: 1 }],
  ["scheduled match is not completed", { status: "scheduled", home_score: 1, away_score: 1 }, null],
  ["negative score is not a result", { status: "finished", home_score: -1, away_score: 0 }, null],
  ["decimal score is not a result", { status: "finished", home_score: 1.5, away_score: 0 }, null],
  ["missing score is not a result", { status: "finished" }, null],
];
for (const [label, match, expected] of checks) {
  assert.deepEqual(validFinishedResult(match), expected, label);
  console.log(`[PASS] ${label}`);
}
console.log(`Match result validity: ${checks.length}/${checks.length} passed`);
