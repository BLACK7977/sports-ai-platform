import {
  parseEntityId,
  safeDecodeEntityId,
} from "@/lib/config/validation";

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

function runTests(): void {
  console.log("=== SMOKE TESTS — Encoded Entity ID Hardening ===\n");

  // A. Encoded colon decodes correctly
  console.log("--- A. Encoded colon ---");
  const encoded = "m-soccer-sportmonks%3Amatch%3A19713931";
  const decoded = safeDecodeEntityId(encoded);
  check("A1: safeDecodeEntityId does not throw", decoded !== undefined);
  check(
    "A2: decodes %3A to :",
    decoded === "m-soccer-sportmonks:match:19713931",
    `got: ${decoded}`,
  );
  check(
    "A3: decoded passes parseEntityId",
    parseEntityId(decoded!) === decoded,
  );

  // B. Ordinary ID unchanged
  console.log("\n--- B. Ordinary ID (no encoding) ---");
  const plain = "m-l1-1";
  const plainDecoded = safeDecodeEntityId(plain);
  check("B1: unchanged", plainDecoded === "m-l1-1", `got: ${plainDecoded}`);
  check(
    "B2: passes parseEntityId",
    parseEntityId(plainDecoded!) === "m-l1-1",
  );

  // C. Malformed encoding → safe null, never throw
  console.log("\n--- C. Malformed encoding ---");
  let threw = false;
  let result: string | null = null;
  try {
    result = safeDecodeEntityId("bad%ZZ");
  } catch {
    threw = true;
  }
  check("C1: does not throw", !threw);
  check("C2: returns null", result === null, `got: ${result}`);

  // D. Invalid decoded character rejected by entityIdSchema
  console.log("\n--- D. Invalid decoded character ---");
  const slash = safeDecodeEntityId("abc%2Fdef");
  check("D1: decodes %2F to /", slash === "abc/def", `got: ${slash}`);
  check(
    "D2: rejected by parseEntityId (slash not allowed)",
    parseEntityId(slash!) === null,
  );

  // E. Double encoding — decode ONCE, no recursion
  console.log("\n--- E. Double encoding ---");
  const double = safeDecodeEntityId("abc%253Adef");
  check("E1: decode once → abc%3Adef", double === "abc%3Adef", `got: ${double}`);
  check(
    "E2: rejected by parseEntityId (% not in schema)",
    parseEntityId(double!) === null,
  );

  // F. Equivalent player IDs (encoded vs raw)
  console.log("\n--- F. Player ID equivalence ---");
  const playerRaw = "sportmonks-player:12345";
  const playerEncoded = "sportmonks-player%3A12345";
  const rawDecoded = safeDecodeEntityId(playerRaw);
  const encDecoded = safeDecodeEntityId(playerEncoded);
  check("F1: raw unchanged", rawDecoded === playerRaw, `got: ${rawDecoded}`);
  check(
    "F2: encoded decodes to same value",
    encDecoded === playerRaw,
    `got: ${encDecoded}`,
  );
  check(
    "F3: both pass parseEntityId",
    parseEntityId(rawDecoded!) === parseEntityId(encDecoded!),
  );

  // G. Validation.ts exports the helper
  console.log("\n--- G. Export verification ---");
  check(
    "G1: safeDecodeEntityId is exported",
    typeof safeDecodeEntityId === "function",
  );

  // H. Edge cases
  console.log("\n--- H. Edge cases ---");
  check("H1: empty string → empty (falsy, caught by !id)", safeDecodeEntityId("") === "");
  check(
    "H2: incomplete percent → null (URIError)",
    safeDecodeEntityId("%") === null,
    `got: ${safeDecodeEntityId("%")}`,
  );
  const fullEncoded = encodeURIComponent("m-soccer-sportmonks:match:19713931");
  check(
    "H3: fully encoded decodes correctly",
    safeDecodeEntityId(fullEncoded) === "m-soccer-sportmonks:match:19713931",
    `got: ${safeDecodeEntityId(fullEncoded)}`,
  );

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log(
    `RESULTADO FINAL: Pasaron: ${passed}, Fallaron: ${failed}`,
  );
  if (failed > 0) {
    console.log("❌ ALGUNOS TESTS FALLARON");
    process.exit(1);
  } else {
    console.log("✅ TODOS LOS TESTS PASARON");
  }
  console.log("=".repeat(60));
}

runTests();
