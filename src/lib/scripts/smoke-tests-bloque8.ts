import {
  ManualOddsProvider,
  SyntheticOddsProvider,
  InvalidOddsQuoteError,
  selectClosingOdds,
  selectCurrentOdds,
  snapshotIdentity,
  toOddsSnapshotPayload,
  validateOddsQuote1X2,
  type OddsQuote1X2,
} from "@/lib/ai/odds-providers";
import { InvalidOddsError } from "@/lib/ai/value-engine";

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

function throwsQuote(fn: () => void): boolean {
  try {
    fn();
    return false;
  } catch (err) {
    return err instanceof InvalidOddsQuoteError;
  }
}

const MATCH_X = "match-x";

function fixtureMultiBookmaker() {
  return [
    {
      matchId: MATCH_X,
      bookmakerId: "book-a",
      snapshots: [
        { capturedAt: "2026-03-01T10:00:00.000Z", odds: { home: 2.2, draw: 3.2, away: 3.1 } },
        { capturedAt: "2026-03-01T12:00:00.000Z", odds: { home: 2.15, draw: 3.25, away: 3.2 } },
      ],
    },
    {
      matchId: MATCH_X,
      bookmakerId: "book-b",
      snapshots: [
        { capturedAt: "2026-03-01T10:00:00.000Z", odds: { home: 2.25, draw: 3.1, away: 3.05 } },
      ],
    },
  ];
}

const KICKOFF = "2026-03-01T18:00:00.000Z";

async function runTests(): Promise<void> {
  console.log("=== SMOKE TESTS — Bloque 8 (Odds providers + snapshots) ===\n");

  const provider = new SyntheticOddsProvider(fixtureMultiBookmaker());

  console.log("--- A/B/C/D. Provider sintético ---");
  const all = await provider.getPreMatchOdds({ matchId: MATCH_X });
  check("A: provider devuelve quotes válidas (3 snapshots)", all.length === 3, `got ${all.length}`);
  check(
    "A2: quotes con bookmaker/market/capturedAt",
    all.every((q) => q.bookmakerId && q.marketId === "1x2" && Number.isFinite(Date.parse(q.capturedAt))),
  );
  const allAgain = await provider.getPreMatchOdds({ matchId: MATCH_X });
  check(
    "B: mismo input => mismo output",
    JSON.stringify(all) === JSON.stringify(allAgain),
  );
  const bookmakers = new Set(all.map((q) => q.bookmakerId));
  check("C: múltiples bookmakers (A y B)", bookmakers.has("book-a") && bookmakers.has("book-b"));
  const bookA = await provider.getPreMatchOdds({ matchId: MATCH_X, bookmakerId: "book-a" });
  check("D: múltiples snapshots mismo partido/bookmaker (2)", bookA.length === 2, `got ${bookA.length}`);
  check(
    "D2: movimiento de cuotas (2.20 → 2.15)",
    bookA[0].odds.home === 2.2 && bookA[1].odds.home === 2.15,
  );

  console.log("\n--- E/F/G/H/I. Mapper + validaciones ---");
  const payload = toOddsSnapshotPayload(all[0]);
  check(
    "E: mapper genera payload compatible (match_id/bookmaker_id/market_id/odds/captured_at/source)",
    payload.match_id === MATCH_X &&
      typeof payload.bookmaker_id === "string" &&
      payload.market_id === "1x2" &&
      payload.odds.home > 1 &&
      Number.isFinite(Date.parse(payload.captured_at)) &&
      typeof payload.source === "string",
  );
  check(
    "F: odds inválidas rechazadas (<=1, reutiliza regla 4C.2)",
    (() => {
      try {
        validateOddsQuote1X2({
          provider: "synthetic",
          bookmakerId: "book-a",
          marketId: "1x2",
          matchId: MATCH_X,
          odds: { home: 1.0, draw: 3.0, away: 3.0 },
          capturedAt: "2026-03-01T10:00:00.000Z",
          source: "synthetic",
        });
        return false;
      } catch (err) {
        return err instanceof InvalidOddsQuoteError || err instanceof InvalidOddsError;
      }
    })(),
  );
  check(
    "G: bookmaker vacío rechazado",
    throwsQuote(() =>
      validateOddsQuote1X2({
        provider: "synthetic",
        bookmakerId: "  ",
        marketId: "1x2",
        matchId: MATCH_X,
        odds: { home: 2.0, draw: 3.0, away: 3.0 },
        capturedAt: "2026-03-01T10:00:00.000Z",
        source: "synthetic",
      }),
    ),
  );
  check(
    "H: market distinto de 1x2 rechazado",
    throwsQuote(() =>
      validateOddsQuote1X2({
        provider: "synthetic",
        bookmakerId: "book-a",
        marketId: "ou25",
        matchId: MATCH_X,
        odds: { home: 2.0, draw: 3.0, away: 3.0 },
        capturedAt: "2026-03-01T10:00:00.000Z",
        source: "synthetic",
      } as unknown as OddsQuote1X2),
    ),
  );
  check(
    "I: capturedAt inválido rechazado",
    throwsQuote(() =>
      validateOddsQuote1X2({
        provider: "synthetic",
        bookmakerId: "book-a",
        marketId: "1x2",
        matchId: MATCH_X,
        odds: { home: 2.0, draw: 3.0, away: 3.0 },
        capturedAt: "no-es-fecha",
        source: "synthetic",
      }),
    ),
  );
  check("I2: null rechazado", throwsQuote(() => validateOddsQuote1X2(null)));
  check("I3: array rechazado", throwsQuote(() => validateOddsQuote1X2([])));

  console.log("\n--- J/K/L/M. Closing odds (con scope de serie) ---");
  const SCOPE_A = { matchId: MATCH_X, bookmakerId: "book-a", marketId: "1x2" as const, kickoffAt: KICKOFF };
  const closingSet: OddsQuote1X2[] = [
    { provider: "synthetic", bookmakerId: "book-a", marketId: "1x2", matchId: MATCH_X, odds: { home: 2.2, draw: 3.2, away: 3.1 }, capturedAt: "2026-03-01T15:00:00.000Z", source: "synthetic" },
    { provider: "synthetic", bookmakerId: "book-a", marketId: "1x2", matchId: MATCH_X, odds: { home: 2.18, draw: 3.22, away: 3.12 }, capturedAt: "2026-03-01T16:30:00.000Z", source: "synthetic" },
    { provider: "synthetic", bookmakerId: "book-a", marketId: "1x2", matchId: MATCH_X, odds: { home: 2.15, draw: 3.25, away: 3.2 }, capturedAt: "2026-03-01T17:55:00.000Z", source: "synthetic" },
    { provider: "synthetic", bookmakerId: "book-a", marketId: "1x2", matchId: MATCH_X, odds: { home: 2.1, draw: 3.3, away: 3.3 }, capturedAt: "2026-03-01T18:02:00.000Z", source: "synthetic" },
  ];
  const closing = selectClosingOdds(closingSet, SCOPE_A);
  check("J: closing = último pre-kickoff (17:55)", closing?.capturedAt === "2026-03-01T17:55:00.000Z", `got ${closing?.capturedAt}`);
  check("K: closing ignora post-kickoff (18:02)", closing?.capturedAt !== "2026-03-01T18:02:00.000Z");
  const withExact: OddsQuote1X2[] = [
    ...closingSet,
    { provider: "synthetic", bookmakerId: "book-a", marketId: "1x2", matchId: MATCH_X, odds: { home: 2.05, draw: 3.4, away: 3.4 }, capturedAt: KICKOFF, source: "synthetic" },
  ];
  const closingExact = selectClosingOdds(withExact, SCOPE_A);
  check("L: closing ignora capturedAt === kickoff", closingExact?.capturedAt === "2026-03-01T17:55:00.000Z", `got ${closingExact?.capturedAt}`);
  const onlyFuture = closingSet.filter((q) => q.capturedAt === "2026-03-01T18:02:00.000Z");
  check("M: sin snapshot previo => null", selectClosingOdds(onlyFuture, SCOPE_A) === null);

  console.log("\n--- N/O/P. Current odds (con scope de serie) ---");
  const current = selectCurrentOdds(closingSet, { matchId: MATCH_X, bookmakerId: "book-a", marketId: "1x2" });
  check("N: current = más reciente (18:02)", current?.capturedAt === "2026-03-01T18:02:00.000Z", `got ${current?.capturedAt}`);
  const reversed = [...closingSet].reverse();
  check(
    "O: orden no cambia closing",
    selectClosingOdds(reversed, SCOPE_A)?.capturedAt === "2026-03-01T17:55:00.000Z",
  );
  check(
    "P: orden no cambia current",
    selectCurrentOdds(reversed, { matchId: MATCH_X, bookmakerId: "book-a", marketId: "1x2" })?.capturedAt === "2026-03-01T18:02:00.000Z",
  );

  console.log("\n--- U/V/W/X/Y. Scoping por serie ---");
  const mixed: OddsQuote1X2[] = [
    ...closingSet,
    { provider: "synthetic", bookmakerId: "book-a", marketId: "1x2", matchId: "match-y", odds: { home: 1.9, draw: 3.5, away: 4.0 }, capturedAt: "2026-03-01T17:59:00.000Z", source: "synthetic" },
    { provider: "synthetic", bookmakerId: "book-b", marketId: "1x2", matchId: MATCH_X, odds: { home: 2.3, draw: 3.0, away: 3.0 }, capturedAt: "2026-03-01T17:59:30.000Z", source: "synthetic" },
  ];
  const closingU = selectClosingOdds(mixed, SCOPE_A);
  check(
    "U: closing de match-X nunca devuelve snapshot de match-Y (aunque sea más reciente)",
    closingU?.matchId === MATCH_X && closingU?.capturedAt === "2026-03-01T17:55:00.000Z",
    `got ${closingU?.matchId} @ ${closingU?.capturedAt}`,
  );
  check(
    "V: closing de book-A nunca devuelve quote de book-B",
    closingU?.bookmakerId === "book-a",
    `got ${closingU?.bookmakerId}`,
  );
  const currentW = selectCurrentOdds(mixed, { matchId: MATCH_X, bookmakerId: "book-b", marketId: "1x2" });
  check(
    "W: current respeta match+bookmaker+market (book-B → 17:59:30)",
    currentW?.bookmakerId === "book-b" && currentW?.capturedAt === "2026-03-01T17:59:30.000Z",
    `got ${currentW?.bookmakerId} @ ${currentW?.capturedAt}`,
  );
  // Reordenamiento fijo y determinista (sin random)
  const reordered = [mixed[4], mixed[0], mixed[5], mixed[2], mixed[1], mixed[3]];
  check(
    "X: input mezclado/desordenado devuelve la serie correcta",
    selectClosingOdds(reordered, SCOPE_A)?.capturedAt === "2026-03-01T17:55:00.000Z" &&
      selectCurrentOdds(reordered, { matchId: MATCH_X, bookmakerId: "book-b", marketId: "1x2" })?.capturedAt === "2026-03-01T17:59:30.000Z",
  );
  check(
    "Y: sin snapshot para la identidad => null",
    selectClosingOdds(mixed, { matchId: "match-zzz", bookmakerId: "book-a", marketId: "1x2", kickoffAt: KICKOFF }) === null &&
      selectCurrentOdds(mixed, { matchId: "match-zzz", bookmakerId: "book-a", marketId: "1x2" }) === null,
  );

  console.log("\n--- Z. Identidad con timestamps equivalentes ---");
  const pZ1 = toOddsSnapshotPayload({
    provider: "synthetic", bookmakerId: "book-a", marketId: "1x2", matchId: MATCH_X,
    odds: { home: 2.2, draw: 3.2, away: 3.1 }, capturedAt: "2026-09-13T15:00:00Z", source: "synthetic",
  });
  const pZ2 = toOddsSnapshotPayload({
    provider: "synthetic", bookmakerId: "book-a", marketId: "1x2", matchId: MATCH_X,
    odds: { home: 2.2, draw: 3.2, away: 3.1 }, capturedAt: "2026-09-13T12:00:00-03:00", source: "synthetic",
  });
  check(
    "Z: mismo instante con distinto timezone => misma identidad",
    snapshotIdentity(pZ1) === snapshotIdentity(pZ2),
    `${snapshotIdentity(pZ1)} vs ${snapshotIdentity(pZ2)}`,
  );

  console.log("\n--- Q/R. Identidad de snapshot ---");
  const p1 = toOddsSnapshotPayload(closingSet[0]);
  const p2 = toOddsSnapshotPayload({ ...closingSet[0] });
  check("Q: misma identidad lógica detectada", snapshotIdentity(p1) === snapshotIdentity(p2));
  const p3 = toOddsSnapshotPayload({ ...closingSet[0], capturedAt: "2026-03-01T15:00:01.000Z" });
  check("R: timestamps diferentes => identidades diferentes", snapshotIdentity(p1) !== snapshotIdentity(p3));

  console.log("\n--- S/T. Manual provider + offline ---");
  const manual = new ManualOddsProvider(closingSet);
  const manualQuotes = await manual.getPreMatchOdds({ matchId: MATCH_X });
  check("S: manual provider válido (4 quotes)", manualQuotes.length === 4, `got ${manualQuotes.length}`);
  check(
    "S2: manual rechaza quotes inválidas en constructor",
    (() => {
      try {
        new ManualOddsProvider([
          { provider: "manual", bookmakerId: "", marketId: "1x2", matchId: MATCH_X, odds: { home: 2.0, draw: 3.0, away: 4.0 }, capturedAt: KICKOFF, source: "manual" },
        ]);
        return false;
      } catch {
        return true;
      }
    })(),
  );
  const t0 = Date.now();
  await provider.getPreMatchOdds({ matchId: MATCH_X });
  await manual.getPreMatchOdds({ matchId: MATCH_X });
  check("T: providers 100% offline (sin network, respuesta inmediata)", Date.now() - t0 < 5000);

  console.log("\n======================================================================");
  console.log(
    `RESULTADO FINAL BLOQUE 8: ${failed === 0 ? "TODOS LOS TESTS PASARON ✅✅✅" : `${failed} FALLARON ❌`}`,
  );
  console.log(`Pasaron: ${passed}, Fallaron: ${failed}`);
  console.log("======================================================================");

  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
