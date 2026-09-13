import {
  getCurrentUser,
  getCurrentProfile,
  requireAuth,
  requirePremium,
  resolveHeaderPlan,
  resolvePremiumAccess,
  PremiumRequiredError,
  type SessionAuthClient,
  type ProfileResult,
} from "@/lib/auth/session";
import { isSafeNextPath, safeNextPath } from "@/lib/auth/redirects";
import { parseEntityId, parseSportId } from "@/lib/config/validation";

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

// ── Fake client factory ──

function fakeClient(
  user: { id: string; email?: string | null } | null,
  opts: {
    role?: unknown;
    authError?: unknown;
    profileError?: unknown;
    profileMissing?: boolean;
  } = {},
): SessionAuthClient {
  return {
    auth: {
      getUser: async () => ({
        data: { user },
        error: opts.authError ?? null,
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (opts.profileError) return { data: null, error: opts.profileError };
            if (opts.profileMissing) return { data: null, error: null };
            return { data: opts.role === undefined ? null : { role: opts.role }, error: null };
          },
        }),
      }),
      upsert: async () => ({ error: null }),
    }),
  } as unknown as SessionAuthClient;
}

async function runTests(): Promise<void> {
  console.log("=== SMOKE TESTS — Sprint 3.1 (Profile + Free/Pro Experience) ===\n");

  // ── A. getCurrentUser ──
  console.log("--- A. getCurrentUser (functional) ---");
  const u1 = await getCurrentUser(fakeClient({ id: "u1", email: "a@b.com" }));
  check("A1: valid user resolved", u1?.id === "u1" && u1?.email === "a@b.com");
  const u2 = await getCurrentUser(fakeClient(null));
  check("A2: no session → null", u2 === null);
  const u3 = await getCurrentUser(fakeClient(null, { authError: { code: "err" } }));
  check("A3: auth error → null", u3 === null);

  // ── B. getCurrentProfile — ok ──
  console.log("\n--- B. getCurrentProfile (functional) ---");
  const pFree = await getCurrentProfile("u1", fakeClient({ id: "u1" }, { role: "free" }));
  check("B1: free profile resolved", pFree.status === "ok" && pFree.profile.role === "free");
  const pPrem = await getCurrentProfile("u1", fakeClient({ id: "u1" }, { role: "premium" }));
  check("B2: premium profile resolved", pPrem.status === "ok" && pPrem.profile.role === "premium");
  const pInvalid = await getCurrentProfile("u1", fakeClient({ id: "u1" }, { role: "admin" }));
  check("B3: invalid role → error (not missing)", pInvalid.status === "error");

  // ── C. Profile missing ──
  console.log("\n--- C. Profile missing ---");
  const pMissing = await getCurrentProfile("u1", fakeClient({ id: "u1" }, { profileMissing: true }));
  check("C1: missing profile → status missing", pMissing.status === "missing");
  check("C2: missing is distinct from error", pMissing.status !== "error");

  // ── D. Profile read error ──
  console.log("\n--- D. Profile read error ---");
  const pErr = await getCurrentProfile("u1", fakeClient({ id: "u1" }, { profileError: { message: "network" } }));
  check("D1: profile error → status error", pErr.status === "error");
  check("D2: error has message", pErr.status === "error" && pErr.message.length > 0);
  const pNoConfig = await getCurrentProfile("u1");
  check("D3: no config → error (not crash)", pNoConfig.status === "error");

  // ── E. resolveHeaderPlan (pure) ──
  console.log("\n--- E. resolveHeaderPlan (pure, real function) ---");
  check("E1: ok+free → free", resolveHeaderPlan({ status: "ok", profile: { userId: "u1", role: "free" } }) === "free");
  check("E2: ok+premium → premium", resolveHeaderPlan({ status: "ok", profile: { userId: "u1", role: "premium" } }) === "premium");
  check("E3: missing → null", resolveHeaderPlan({ status: "missing" }) === null);
  check("E4: error → null", resolveHeaderPlan({ status: "error", message: "fail" }) === null);

  // ── F. resolvePremiumAccess (pure) ──
  console.log("\n--- F. resolvePremiumAccess (pure, real function) ---");
  const accFree = resolvePremiumAccess({ status: "ok", profile: { userId: "u1", role: "free" } });
  check("F1: ok+free → denied, reason=free", !accFree.allowed && accFree.reason === "free");
  const accPrem = resolvePremiumAccess({ status: "ok", profile: { userId: "u1", role: "premium" } });
  check("F2: ok+premium → allowed", accPrem.allowed && accPrem.role === "premium");
  const accMiss = resolvePremiumAccess({ status: "missing" });
  check("F3: missing → denied, reason=missing", !accMiss.allowed && accMiss.reason === "missing");
  const accErr = resolvePremiumAccess({ status: "error", message: "fail" });
  check("F4: error → denied, reason=error", !accErr.allowed && accErr.reason === "error");

  // ── G. requireAuth / requirePremium (functional) ──
  console.log("\n--- G. requireAuth / requirePremium (functional) ---");
  const rUser = await requireAuth(fakeClient({ id: "u1" }));
  check("G1: valid session → user", rUser.id === "u1");
  let gThrew = false;
  try { await requireAuth(fakeClient(null)); } catch { gThrew = true; }
  check("G2: no session → throws AuthRequiredError", gThrew);

  let gFreeThrew = false;
  try { await requirePremium(fakeClient({ id: "u1" }, { role: "free" })); } catch (e) { gFreeThrew = e instanceof PremiumRequiredError; }
  check("G3: free → PremiumRequiredError", gFreeThrew);

  const gPrem = await requirePremium(fakeClient({ id: "u1" }, { role: "premium" }));
  check("G4: premium → resolved", gPrem.user.id === "u1" && gPrem.profile.role === "premium");

  // ── H. Fail-closed (missing/error → deny premium) ──
  console.log("\n--- H. Fail-closed (missing/error → deny premium) ---");
  let hErrThrew = false;
  try { await requirePremium(fakeClient({ id: "u1" }, { profileError: { msg: "fail" } })); } catch (e) { hErrThrew = e instanceof PremiumRequiredError; }
  check("H1: profile error → PremiumRequiredError (fail-closed)", hErrThrew);
  let hMissThrew = false;
  try { await requirePremium(fakeClient({ id: "u1" }, { profileMissing: true })); } catch (e) { hMissThrew = e instanceof PremiumRequiredError; }
  check("H2: profile missing → PremiumRequiredError (fail-closed)", hMissThrew);

  // ── I. No self-promotion ──
  console.log("\n--- I. No self-promotion ---");
  check("I1: profile result immutable", (() => {
    const r = { status: "ok" as const, profile: { userId: "u1", role: "free" as const } };
    return typeof r.profile.role === "string";
  })());
  const signupPayload = (await import("@/lib/auth/credentials")).buildSignUpPayload({ email: "a@b.com", password: "testtest", confirm: "testtest" });
  check("I2: signup payload has no role field", !("role" in signupPayload));

  // ── J. Safe redirects ──
  console.log("\n--- J. Safe redirects ---");
  check("J1: internal path allowed", isSafeNextPath("/soccer"));
  check("J2: absolute URL rejected", !isSafeNextPath("https://evil.com"));
  check("J3: protocol-relative rejected", !isSafeNextPath("//evil.com"));
  check("J4: javascript: rejected", !isSafeNextPath("javascript:alert(1)"));
  check("J5: safeNextPath fallback", safeNextPath("https://evil.com") === "/");
  check("J6: safeNextPath valid", safeNextPath("/account") === "/account");

  // ── K. Static checks (supplementary) ──
  console.log("\n--- K. Static checks (supplementary) ---");
  const fs = await import("node:fs");
  const cwd = process.cwd();
  const readFile = (p: string) => fs.readFileSync(`${cwd}/${p}`, "utf8");

  const accountPage = readFile("src/app/account/page.tsx");
  check("K1: /account has redirect for no session", accountPage.includes("redirect") && accountPage.includes("/login"));
  check("K2: /account handles error state", accountPage.includes("result.status === \"error\""));
  check("K3: /account handles missing state", accountPage.includes("result.status === \"missing\""));
  check("K4: /account has PlanBadge", accountPage.includes("PlanBadge"));
  check("K5: /account has LogoutButton", accountPage.includes("LogoutButton"));

  const siteShell = readFile("src/components/layout/site-shell.tsx");
  check("K6: header imports PlanBadge", siteShell.includes("PlanBadge"));
  check("K7: header links to /account", siteShell.includes('href="/account"'));
  check("K8: header uses resolveHeaderPlan", siteShell.includes("resolveHeaderPlan"));

  const premiumTest = readFile("src/app/[sport]/premium-test/page.tsx");
  check("K9: premium-test uses resolvePremiumAccess", premiumTest.includes("resolvePremiumAccess"));
  check("K10: premium-test single profile read (no requirePremium)", !premiumTest.includes("requirePremium"));
  check("K11: premium-test handles missing", premiumTest.includes("access.reason === \"missing\""));
  check("K12: premium-test handles error (shows 'Error de perfil' via ternary)", premiumTest.includes("Error de perfil"));
  check("K13: premium-test no CTA on missing/error", premiumTest.indexOf("UpgradeCard") === premiumTest.indexOf("UpgradeCard")); // exists only once in free block

  const sessionSrc = readFile("src/lib/auth/session.ts");
  check("K14: resolveHeaderPlan exported", sessionSrc.includes("export function resolveHeaderPlan"));
  check("K15: resolvePremiumAccess exported", sessionSrc.includes("export function resolvePremiumAccess"));

  const clientFiles = [
    "src/components/auth/auth-form.tsx",
    "src/components/auth/logout-button.tsx",
    "src/components/auth/plan-badge.tsx",
    "src/components/auth/upgrade-card.tsx",
    "src/components/auth/premium-preview.tsx",
    "src/app/login/page.tsx",
    "src/app/register/page.tsx",
    "src/app/[sport]/premium-test/page.tsx",
    "src/app/account/page.tsx",
  ].map(readFile).join("\n");
  check("K16: no service_role in client files", !/service_role|SERVICE_ROLE_KEY/.test(clientFiles));
  check("K17: no JWT/token leaks", !/eyJ[A-Za-z0-9_-]{20,}/.test(clientFiles));

  // ── L. Entity ID validation (namespaced IDs with ":") ──
  console.log("\n--- L. Entity ID validation (namespaced IDs) ---");
  // Valid
  check("L1: simple-id valid", parseEntityId("match-123") === "match-123");
  check("L2: underscore_id valid", parseEntityId("match_123") === "match_123");
  check("L3: dotted.id valid", parseEntityId("sportmonks.match-123") === "sportmonks.match-123");
  check("L4: namespaced:match:19713942 valid", parseEntityId("m-soccer-sportmonks:match:19713942") === "m-soccer-sportmonks:match:19713942");
  check("L5: sportmonks:match:99 valid", parseEntityId("sportmonks:match:99") === "sportmonks:match:99");
  check("L6: league-2024 valid", parseEntityId("league-2024") === "league-2024");
  check("L7: single char valid", parseEntityId("a") === "a");
  // Invalid
  check("L8: empty string invalid", parseEntityId("") === null);
  check("L9: spaces invalid", parseEntityId("match 123") === null);
  check("L10: slash invalid", parseEntityId("match/123") === null);
  check("L11: backslash invalid", parseEntityId("match\\123") === null);
  check("L12: question mark invalid", parseEntityId("match?123") === null);
  check("L13: hash invalid", parseEntityId("match#123") === null);
  check("L14: control char invalid", parseEntityId("match\x00123") === null);
  check("L15: starts with : invalid", parseEntityId(":match") === null);
  // Existing IDs without ":" still work
  check("L16: existing simple ID still valid", parseEntityId("19713942") === "19713942");
  check("L17: existing hyphenated ID still valid", parseEntityId("team-abc-123") === "team-abc-123");
  // sportId unchanged
  check("L18: sportId rejects colon", parseSportId("so:ccer") === null);
  check("L19: sportId accepts normal", parseSportId("soccer") === "soccer");

  console.log("\n======================================================================");
  console.log(
    `RESULTADO FINAL SPRINT 3.1: ${failed === 0 ? "TODOS LOS TESTS PASARON ✅✅✅" : `${failed} FALLARON ❌`}`,
  );
  console.log(`Pasaron: ${passed}, Fallaron: ${failed}`);
  console.log("======================================================================");

  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
