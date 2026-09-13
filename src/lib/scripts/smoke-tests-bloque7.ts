import {
  computeValue1X2,
  InvalidOddsError,
  InvalidModelProbabilitiesError,
  type Odds1X2,
  type Probs1X2,
} from "@/lib/ai/value-engine";

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

function approx(a: number, b: number, tol = 1e-9): boolean {
  return Math.abs(a - b) <= tol;
}

function throwsErr(fn: () => void, cls: new (...args: never[]) => Error): boolean {
  try {
    fn();
    return false;
  } catch (err) {
    return err instanceof cls;
  }
}

async function runTests(): Promise<void> {
  console.log("=== SMOKE TESTS — Bloque 7 (Value Engine 1X2) ===\n");

  // Caso base: odds 2.00 / 3.00 / 4.00
  const oddsA: Odds1X2 = { home: 2.0, draw: 3.0, away: 4.0 };
  const modelA: Probs1X2 = { home: 0.5, draw: 0.3, away: 0.2 };

  console.log("--- A/B/C. Raw / overround / normalizadas ---");
  const resA = computeValue1X2(oddsA, modelA);
  check(
    "A: raw correctas (0.5 / 0.3333 / 0.25)",
    approx(resA.rawImpliedProbabilities.home, 0.5) &&
      approx(resA.rawImpliedProbabilities.draw, 1 / 3) &&
      approx(resA.rawImpliedProbabilities.away, 0.25),
  );
  const expectedOverround = 0.5 + 1 / 3 + 0.25 - 1;
  check(
    "B: overround correcto (≈0.0833)",
    approx(resA.overround, expectedOverround),
    `got ${resA.overround}`,
  );
  const normSum =
    resA.normalizedBookmakerProbabilities.home +
    resA.normalizedBookmakerProbabilities.draw +
    resA.normalizedBookmakerProbabilities.away;
  check("C: normalizadas suman 1", approx(normSum, 1, 1e-9), `got ${normSum}`);
  check(
    "C2: normalizada home ≈ 0.4615",
    approx(resA.normalizedBookmakerProbabilities.home, 0.5 / (1 + expectedOverround)),
  );

  console.log("\n--- D/E/F/G/H/I. Edge / EV / flags ---");
  // D: modelo > bookmaker => edge positivo (home: 0.5 > 0.4615)
  check("D: edge home positivo", resA.edge.home > 0, `got ${resA.edge.home}`);
  // E: modelo < bookmaker => edge negativo (away: 0.2 < 0.2308)
  check("E: edge away negativo", resA.edge.away < 0, `got ${resA.edge.away}`);
  // EV home = 0.5*2 - 1 = 0
  check("F/G: EV home = 0 (límite)", approx(resA.ev.home, 0));
  // Modelo con ventaja clara: EV positivo
  const modelPos: Probs1X2 = { home: 0.55, draw: 0.27, away: 0.18 };
  const resPos = computeValue1X2(oddsA, modelPos);
  check("F: EV home positivo (0.55*2-1=0.10)", approx(resPos.ev.home, 0.1), `got ${resPos.ev.home}`);
  check("F2: edge home positivo", resPos.edge.home > 0);
  // EV negativo
  const modelNeg: Probs1X2 = { home: 0.4, draw: 0.32, away: 0.28 };
  const resNeg = computeValue1X2(oddsA, modelNeg);
  check("G: EV home negativo (0.4*2-1=-0.20)", approx(resNeg.ev.home, -0.2), `got ${resNeg.ev.home}`);
  // H: value true cuando EV>0 AND edge>0
  check("H: value home true (EV>0 y edge>0)", resPos.valueFlags.home === true);
  // I: value false cuando EV<=0
  check("I: value home false (EV=0)", resA.valueFlags.home === false);
  check("I2: value home false (EV<0)", resNeg.valueFlags.home === false);

  console.log("\n--- J/K/L/M/N. Validaciones ---");
  check(
    "J: odds <=1 rechazadas (home=1.0)",
    throwsErr(() => computeValue1X2({ home: 1.0, draw: 3.0, away: 4.0 }, modelA), InvalidOddsError),
  );
  check(
    "J2: odds <=1 rechazadas (away=0.5)",
    throwsErr(() => computeValue1X2({ home: 2.0, draw: 3.0, away: 0.5 }, modelA), InvalidOddsError),
  );
  check(
    "K: NaN rechazado",
    throwsErr(
      () => computeValue1X2({ home: NaN, draw: 3.0, away: 4.0 }, modelA),
      InvalidOddsError,
    ),
  );
  check(
    "L: Infinity rechazado",
    throwsErr(
      () => computeValue1X2({ home: Infinity, draw: 3.0, away: 4.0 }, modelA),
      InvalidOddsError,
    ),
  );
  check(
    "M: prob. modelo negativa rechazada",
    throwsErr(() => computeValue1X2(oddsA, { home: -0.1, draw: 0.6, away: 0.5 }), InvalidModelProbabilitiesError),
  );
  check(
    "M2: prob. modelo >1 rechazada",
    throwsErr(() => computeValue1X2(oddsA, { home: 1.2, draw: 0, away: -0.2 }), InvalidModelProbabilitiesError),
  );
  check(
    "M3: prob. modelo NaN rechazada",
    throwsErr(() => computeValue1X2(oddsA, { home: NaN, draw: 0.5, away: 0.5 }), InvalidModelProbabilitiesError),
  );
  check(
    "N: suma modelo inválida rechazada (0.9)",
    throwsErr(() => computeValue1X2(oddsA, { home: 0.4, draw: 0.3, away: 0.2 }), InvalidModelProbabilitiesError),
  );
  check(
    "N2: suma modelo inválida rechazada (1.1)",
    throwsErr(() => computeValue1X2(oddsA, { home: 0.5, draw: 0.4, away: 0.2 }), InvalidModelProbabilitiesError),
  );

  console.log("\n--- O. Determinismo ---");
  const resO1 = computeValue1X2(oddsA, modelA);
  const resO2 = computeValue1X2(oddsA, modelA);
  check(
    "O: mismo input => mismo output",
    resO1.overround === resO2.overround &&
      resO1.edge.home === resO2.edge.home &&
      resO1.ev.home === resO2.ev.home &&
      resO1.valueFlags.home === resO2.valueFlags.home,
  );

  console.log("\n--- P. Caso obligatorio: edge>0 pero EV<0 ---");
  // odds home=2.00 (P_raw=0.50); draw=4.00 (0.25); away≈3.1865 (raw≈0.3138)
  // sumRaw ≈ 1.0638 → P_book home ≈ 0.47; P_model = 0.48
  const oddsP: Odds1X2 = { home: 2.0, draw: 4.0, away: 3.1865 };
  const modelP: Probs1X2 = { home: 0.48, draw: 0.28, away: 0.24 };
  const resP = computeValue1X2(oddsP, modelP);
  console.log(
    `   P_raw home=${resP.rawImpliedProbabilities.home.toFixed(4)}, ` +
      `P_book home=${resP.normalizedBookmakerProbabilities.home.toFixed(4)}, ` +
      `P_model home=0.4800`,
  );
  console.log(
    `   edge home=${resP.edge.home.toFixed(4)}, EV home=${resP.ev.home.toFixed(4)}, ` +
      `value=${resP.valueFlags.home}`,
  );
  check(
    "P1: P_book home ≈ 0.47",
    Math.abs(resP.normalizedBookmakerProbabilities.home - 0.47) < 0.005,
    `got ${resP.normalizedBookmakerProbabilities.home}`,
  );
  check("P2: edge home > 0", resP.edge.home > 0, `got ${resP.edge.home}`);
  check(
    "P3: EV home < 0 (0.48*2-1=-0.04)",
    approx(resP.ev.home, -0.04),
    `got ${resP.ev.home}`,
  );
  check("P4: valueFlag home = false", resP.valueFlags.home === false);

  console.log("\n--- Q/R. Overround cero y negativo ---");
  const resQ = computeValue1X2({ home: 3.0, draw: 3.0, away: 3.0 }, { home: 0.34, draw: 0.33, away: 0.33 });
  check("Q: overround cero soportado", approx(resQ.overround, 0), `got ${resQ.overround}`);
  check("Q2: normalizadas = raw con overround 0", approx(resQ.normalizedBookmakerProbabilities.home, 1 / 3));
  const resR = computeValue1X2({ home: 4.0, draw: 4.0, away: 4.0 }, { home: 0.34, draw: 0.33, away: 0.33 });
  check("R: overround negativo soportado (≈-0.25)", approx(resR.overround, -0.25), `got ${resR.overround}`);
  const normSumR =
    resR.normalizedBookmakerProbabilities.home +
    resR.normalizedBookmakerProbabilities.draw +
    resR.normalizedBookmakerProbabilities.away;
  check("R2: normalizadas suman 1 con overround negativo", approx(normSumR, 1, 1e-9));

  console.log("\n--- S. Forma exacta {home,draw,away} en runtime ---");
  check(
    "S1: odds con key faltante (sin away) rechazadas",
    throwsErr(
      () => computeValue1X2({ home: 2.0, draw: 3.0 } as unknown as Odds1X2, modelA),
      InvalidOddsError,
    ),
  );
  check(
    "S2: odds con key extra (overtime) rechazadas",
    throwsErr(
      () =>
        computeValue1X2(
          { home: 2.0, draw: 3.0, away: 4.0, overtime: 5.0 } as unknown as Odds1X2,
          modelA,
        ),
      InvalidOddsError,
    ),
  );
  check(
    "S3: odds null rechazadas",
    throwsErr(() => computeValue1X2(null as unknown as Odds1X2, modelA), InvalidOddsError),
  );
  check(
    "S4: odds array rechazadas",
    throwsErr(
      () => computeValue1X2([2.0, 3.0, 4.0] as unknown as Odds1X2, modelA),
      InvalidOddsError,
    ),
  );
  check(
    "S5: odds primitivo rechazado",
    throwsErr(
      () => computeValue1X2(2.0 as unknown as Odds1X2, modelA),
      InvalidOddsError,
    ),
  );
  check(
    "S6: probs con key faltante (sin away) rechazadas",
    throwsErr(
      () => computeValue1X2(oddsA, { home: 0.5, draw: 0.5 } as unknown as Probs1X2),
      InvalidModelProbabilitiesError,
    ),
  );
  check(
    "S7: probs con key extra rechazadas",
    throwsErr(
      () =>
        computeValue1X2(
          oddsA,
          { home: 0.4, draw: 0.3, away: 0.3, extra: 0 } as unknown as Probs1X2,
        ),
      InvalidModelProbabilitiesError,
    ),
  );
  check(
    "S8: probs null rechazadas",
    throwsErr(() => computeValue1X2(oddsA, null as unknown as Probs1X2), InvalidModelProbabilitiesError),
  );
  check(
    "S9: probs array rechazadas",
    throwsErr(
      () => computeValue1X2(oddsA, [0.4, 0.3, 0.3] as unknown as Probs1X2),
      InvalidModelProbabilitiesError,
    ),
  );
  check(
    "S10: probs objeto vacío rechazado",
    throwsErr(
      () => computeValue1X2(oddsA, {} as unknown as Probs1X2),
      InvalidModelProbabilitiesError,
    ),
  );

  console.log("\n======================================================================");
  console.log(
    `RESULTADO FINAL BLOQUE 7: ${failed === 0 ? "TODOS LOS TESTS PASARON ✅✅✅" : `${failed} FALLARON ❌`}`,
  );
  console.log(`Pasaron: ${passed}, Fallaron: ${failed}`);
  console.log("======================================================================");

  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
