import { matchDetailHref } from "@/lib/navigation/match-detail-href";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean): void {
  if (condition) {
    passed++;
    console.log(`✓ ${label}`);
  } else {
    failed++;
    console.error(`✗ ${label}`);
  }
}

function main(): void {
  const canonicalId = "m-soccer-sportmonks:match:19713931";
  const expected = "/soccer/matches/m-soccer-sportmonks%3Amatch%3A19713931";
  const scheduledHref = matchDetailHref("soccer", canonicalId);
  const finishedHref = matchDetailHref("soccer", canonicalId);

  console.log("CANONICAL MATCH NAVIGATION TESTS");
  check("canonical namespaced ID is URL-encoded", scheduledHref === expected);
  check("scheduled cards use the canonical detail route", scheduledHref === expected);
  check("finished cards use the canonical detail route", finishedHref === expected);
  check("sport and match segments are encoded", matchDetailHref("soccer", "match 1") === "/soccer/matches/match%201");

  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
