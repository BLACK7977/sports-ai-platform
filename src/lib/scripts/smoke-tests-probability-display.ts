import { probabilityPercentages } from "@/lib/presentation/probability";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, details?: string): void {
  if (condition) {
    console.log(`[PASS] ${name}`);
    passed++;
  } else {
    console.log(`[FAIL] ${name}${details ? ` - ${details}` : ""}`);
    failed++;
  }
}

function isIntegerInRange(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 100;
}

// 1) Normal probabilities: any consistent scale, must total exactly 100.
const normal = probabilityPercentages({ home: 0.4387, draw: 0.2594, away: 0.3019 });
check(
  "normal case total = 100",
  normal.total === 100,
  `got ${JSON.stringify(normal)}`,
);
check(
  "normal case yields integers in [0,100]",
  [normal.home, normal.draw, normal.away].every(isIntegerInRange),
  `got ${JSON.stringify(normal)}`,
);
check(
  "normal case home+draw+away matches total",
  normal.home + normal.draw + normal.away === normal.total,
  `got ${JSON.stringify(normal)}`,
);

// 2) Over-100 case: weights whose independent Math.round would be 44/30/30=104.
const over = probabilityPercentages({ home: 44, draw: 30, away: 30 });
check(
  "over-100 independent rounding totals exactly 100",
  over.total === 100,
  `got ${JSON.stringify(over)}`,
);
check(
  "over-100 case never exceeds 100",
  over.home + over.draw + over.away <= 100 && over.total <= 100,
  `got ${JSON.stringify(over)}`,
);

// 3) Under-100 case: three equal thirds independently round to 33+33+33=99.
const under = probabilityPercentages({ home: 1 / 3, draw: 1 / 3, away: 1 / 3 });
check(
  "under-100 independent rounding (33.33/33.33/33.33) totals 100",
  under.total === 100 && under.home + under.draw + under.away === 100,
  `got ${JSON.stringify(under)}`,
);
check(
  "under-100 case allocates the leftover deterministically (34/33/33)",
  under.home === 34 && under.draw === 33 && under.away === 33,
  `got ${JSON.stringify(under)}`,
);

// 4) Exact-100 input: no redistribution needed.
const exact = probabilityPercentages({ home: 0.5, draw: 0.3, away: 0.2 });
check(
  "exact 100 input stays 100 (50/30/20)",
  exact.home === 50 && exact.draw === 30 && exact.away === 20 && exact.total === 100,
  `got ${JSON.stringify(exact)}`,
);

// 5) Remainder tie: equal fractional remainders must resolve deterministically.
const tie = probabilityPercentages({ home: 0.345, draw: 0.345, away: 0.31 });
check(
  "tie case resolves by fixed key order (home first): 35/34/31",
  tie.home === 35 && tie.draw === 34 && tie.away === 31 && tie.total === 100,
  `got ${JSON.stringify(tie)}`,
);

// 6) Very small probability, deterministic and still totals 100.
const tiny = probabilityPercentages({ home: 0.996, draw: 0.002, away: 0.002 });
check(
  "very small probability floors to 0 without breaking the total",
  tiny.home === 100 && tiny.draw === 0 && tiny.away === 0 && tiny.total === 100,
  `got ${JSON.stringify(tiny)}`,
);

// 7) Determinism: identical inputs → identical outputs (ties included).
const tieA = probabilityPercentages({ home: 0.345, draw: 0.345, away: 0.31 });
const tieB = probabilityPercentages({ home: 0.345, draw: 0.345, away: 0.31 });
check(
  "deterministic across repeated calls",
  tieA.home === tieB.home && tieA.draw === tieB.draw && tieA.away === tieB.away,
  `got ${JSON.stringify(tieA)} vs ${JSON.stringify(tieB)}`,
);

// 8) Real persisted prediction #3 (v1-dixon-coles-2026-01): 48/28/25=101 under
//    independent Math.round; must become sum-to-100 (47/28/25) here.
const predictionThree = probabilityPercentages({
  home: 0.4758872135079252,
  draw: 0.2764942921355626,
  away: 0.24761849435651231,
});
check(
  "prediction #3 raw probs total exactly 100",
  predictionThree.total === 100,
  `got ${JSON.stringify(predictionThree)}`,
);
check(
  "prediction #3 expected split 47/28/25",
  predictionThree.home === 47 && predictionThree.draw === 28 && predictionThree.away === 25,
  `got ${JSON.stringify(predictionThree)}`,
);

// 9) Worked example from the spec: raw percentages 47.5887/27.6494/24.7618.
const spec = probabilityPercentages({ home: 47.5887, draw: 27.6494, away: 24.7618 });
check(
  "spec example 47.5887/27.6494/24.7618 becomes 47/28/25 (sum 100)",
  spec.home === 47 && spec.draw === 28 && spec.away === 25 && spec.total === 100,
  `got ${JSON.stringify(spec)}`,
);

// 10) Scale invariance: 0-1 vs 0-100 vs raw-104 scales produce the same split.
const scaleA = probabilityPercentages({ home: 0.4387, draw: 0.2594, away: 0.3019 });
const scaleB = probabilityPercentages({ home: 43.87, draw: 25.94, away: 30.19 });
check(
  "0-1 and 0-100 scales produce identical splits",
  scaleA.home === scaleB.home && scaleA.draw === scaleB.draw && scaleA.away === scaleB.away,
  `got ${JSON.stringify(scaleA)} vs ${JSON.stringify(scaleB)}`,
);

// 11) All-zero guard: no probabilities → zeroed distribution, not NaN.
const zero = probabilityPercentages({ home: 0, draw: 0, away: 0 });
check(
  "all-zero input yields zeroed distribution",
  zero.home === 0 && zero.draw === 0 && zero.away === 0 && zero.total === 0,
  `got ${JSON.stringify(zero)}`,
);

// 12) Invalid input guards.
let threwNegative = false;
try {
  probabilityPercentages({ home: -0.1, draw: 0.5, away: 0.6 });
} catch {
  threwNegative = true;
}
check("negative probability throws", threwNegative);

let threwNaN = false;
try {
  probabilityPercentages({ home: Number.NaN, draw: 0.5, away: 0.5 });
} catch {
  threwNaN = true;
}
check("NaN probability throws", threwNaN);

let threwInfinity = false;
try {
  probabilityPercentages({ home: Infinity, draw: 0.5, away: 0.5 });
} catch {
  threwInfinity = true;
}
check("infinite probability throws", threwInfinity);

// 13) Property test: 5000 arbitrary distributions always sum to 100.
let propertyOk = true;
let propertyDetail = "";
for (let i = 0; i < 5000; i += 1) {
  const a = Math.random();
  const b = Math.random();
  const c = Math.random();
  const result = probabilityPercentages({ home: a, draw: b, away: c });
  if (
    result.total !== 100 ||
    result.home + result.draw + result.away !== 100 ||
    ![result.home, result.draw, result.away].every(isIntegerInRange)
  ) {
    propertyOk = false;
    propertyDetail = `seed (${a},${b},${c}) -> ${JSON.stringify(result)}`;
    break;
  }
}
check("5000 random distributions always total exactly 100", propertyOk, propertyDetail);

console.log(`\n[SUMMARY] probability display smoke: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}