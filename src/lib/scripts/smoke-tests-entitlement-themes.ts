import fs from "node:fs";
import {
  THEME_IDS,
  DEFAULT_THEME,
  FREE_THEME_ID,
  isThemeId,
  normalizeTheme,
  resolveTheme,
  type ThemeId,
} from "@/lib/themes";
import { getCurrentProfile, type SessionAuthClient } from "@/lib/auth/session";
import { runSetProfileTheme } from "@/lib/services/theme-service";
import {
  AUTH_REQUIRED_ERROR,
  PRO_REQUIRED_ERROR,
  GENERIC_ERROR,
} from "@/lib/services/action-errors";

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

// ── Fake auth client (profiles: role + theme) ──

function fakeClient(
  user: { id: string; email?: string | null } | null,
  opts: {
    role?: unknown;
    theme?: unknown;
    authError?: unknown;
    profileError?: unknown;
    profileMissing?: boolean;
  } = {},
): SessionAuthClient {
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: opts.authError ?? null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (opts.profileError) return { data: null, error: opts.profileError };
            if (opts.profileMissing) return { data: null, error: null };
            if (opts.role === undefined) return { data: null, error: null };
            return {
              data: opts.theme === undefined ? { role: opts.role } : { role: opts.role, theme: opts.theme },
              error: null,
            };
          },
        }),
      }),
      upsert: async () => ({ error: null }),
    }),
  } as unknown as SessionAuthClient;
}

const PRO = ["cyan", "gold", "pink", "green", "red"] as const satisfies readonly ThemeId[];

async function runTests(): Promise<void> {
  console.log("=== SMOKE TESTS — PRO entitlements + premium themes ===\n");

  // ── A. Pure theme model ──
  console.log("--- A. theme model (pure) ---");
  {
    check("A1: five themes exposed", THEME_IDS.length === 5 && THEME_IDS.includes("cyan"), JSON.stringify(THEME_IDS));
    check("A2: default/free theme is cyan", DEFAULT_THEME === "cyan" && FREE_THEME_ID === "cyan");
    check("A3: isThemeId accepts valid ids only", PRO.every((t) => isThemeId(t)) && !isThemeId("purple") && !isThemeId(null));
    check("A4: normalizeTheme fails closed to cyan", normalizeTheme("purple") === "cyan" && normalizeTheme(undefined) === "cyan" && normalizeTheme("gold") === "gold");
    check("A5: FREE renders cyan regardless of stored theme", PRO.every((t) => resolveTheme("free", t) === "cyan") && resolveTheme("free", "purple") === "cyan");
    check("A6: PREMIUM renders valid stored theme", resolveTheme("premium", "gold") === "gold" && resolveTheme("premium", "red") === "red");
    check("A7: PREMIUM with invalid/missing stored theme fails closed to cyan", resolveTheme("premium", "purple") === "cyan" && resolveTheme("premium", undefined) === "cyan");
  }

  // ── B. getCurrentProfile surfaces theme only when valid ──
  console.log("\n--- B. getCurrentProfile theme hydration ---");
  {
    const valid = await getCurrentProfile("u", fakeClient({ id: "u" }, { role: "premium", theme: "gold" }));
    check("B1: valid stored theme hydrated (premium)", valid.status === "ok" && valid.profile.theme === "gold");

    const invalid = await getCurrentProfile("u", fakeClient({ id: "u" }, { role: "premium", theme: "purple" }));
    check("B2: invalid stored theme NOT hydrated (user_profile omits theme)", invalid.status === "ok" && invalid.profile.theme === undefined);

    const missing = await getCurrentProfile("u", fakeClient({ id: "u" }, { role: "free" }));
    check("B3: absent theme stays undefined", missing.status === "ok" && missing.profile.theme === undefined);

    // Migration 015 sin aplicar: el SELECT con "theme" falla 42703 → el perfil
    // se relee sin la columna y el role se conserva (fail-closed preservado).
    const missingThemeState = { calls: 0 };
    const fallbackClient: SessionAuthClient = {
      auth: { getUser: async () => ({ data: { user: { id: "u" } }, error: null }) },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              missingThemeState.calls += 1;
              if (missingThemeState.calls === 1) {
                return { data: null, error: { code: "42703", message: 'column "theme" does not exist' } };
              }
              return { data: { role: "premium" }, error: null };
            },
          }),
        }),
        upsert: async () => ({ error: null }),
      }),
    } as unknown as SessionAuthClient;
    const degen = await getCurrentProfile("u", fallbackClient);
    check("B4: missing theme column degrades gracefully, role kept", degen.status === "ok" && degen.profile.role === "premium" && degen.profile.theme === undefined, JSON.stringify(degen));
  }

  // ── C. runSetProfileTheme: server-side entitlement over every request ──
  console.log("\n--- C. runSetProfileTheme (auth → entitlement → persist) ---");
  {
    // Invalid theme → safe error, 0 persists.
    {
      const persists: ThemeId[] = [];
      const result = await runSetProfileTheme("purple", { authClient: premiumClient(), persist: persistSpy(persists) });
      check("C1: invalid theme → GENERIC safe error", !result.ok && result.code === "GENERIC" && result.error === GENERIC_ERROR, JSON.stringify(result));
      check("C2: invalid theme causes 0 persists", persists.length === 0);
    }

    // Anonymous → AUTH_REQUIRED, 0 persists.
    {
      const persists: ThemeId[] = [];
      const result = await runSetProfileTheme("gold", { authClient: fakeClient(null), persist: persistSpy(persists) });
      check("C3: anonymous → UNAUTHORIZED shared message", !result.ok && result.code === "UNAUTHORIZED" && result.error === AUTH_REQUIRED_ERROR, JSON.stringify(result));
      check("C4: anonymous causes 0 persists", persists.length === 0);
    }

    // FREE cyan → allowed (explicit cyan persists).
    {
      const persists: ThemeId[] = [];
      const result = await runSetProfileTheme("cyan", { authClient: freeClient(), persist: persistSpy(persists) });
      check("C5: FREE cyan → ok", result.ok && result.theme === "cyan", JSON.stringify(result));
      check("C6: FREE cyan persists exactly once with cyan", persists.length === 1 && persists[0] === "cyan");
    }

    // FREE gold/pink/green/red → PRO_REQUIRED, 0 persists.
    for (const t of ["gold", "pink", "green", "red"] as const) {
      const persists: ThemeId[] = [];
      const result = await runSetProfileTheme(t, { authClient: freeClient(), persist: persistSpy(persists) });
      check(`C7: FREE ${t} → denied PRO_REQUIRED`, !result.ok && result.code === "PRO_REQUIRED" && result.error === PRO_REQUIRED_ERROR, JSON.stringify(result));
      check(`C8: FREE ${t} causes 0 persists`, persists.length === 0);
    }

    // FREE + client-supplied plan/role decoys cannot elevate.
    {
      const persists: ThemeId[] = [];
      const deps = {
        authClient: freeClient(),
        persist: persistSpy(persists),
        plan: "premium",
        role: "premium",
      };
      const result = await runSetProfileTheme("gold", deps);
      check("C9: FREE with decoy plan/role stays denied PRO_REQUIRED", !result.ok && result.code === "PRO_REQUIRED", JSON.stringify(result));
      check("C10: decoy plan/role causes 0 persists", persists.length === 0);
    }

    // PREMIUM: all five themes allowed, each persisted exactly once.
    for (const t of PRO) {
      const persists: ThemeId[] = [];
      const result = await runSetProfileTheme(t, { authClient: premiumClient(), persist: persistSpy(persists) });
      check(`C11: PREMIUM ${t} → ok`, result.ok && result.theme === t && result.appliedPreview === t, JSON.stringify(result));
      check(`C12: PREMIUM ${t} persists exactly once`, persists.length === 1 && persists[0] === t);
    }

    // PREMIUM invalid → safe error, 0 persists.
    {
      const persists: ThemeId[] = [];
      const result = await runSetProfileTheme("purple", { authClient: premiumClient(), persist: persistSpy(persists) });
      check("C13: PREMIUM invalid theme → GENERIC safe error", !result.ok && result.code === "GENERIC" && result.error === GENERIC_ERROR);
      check("C14: PREMIUM invalid causes 0 persists", persists.length === 0);
    }

    // Persistence failure → GENERIC safe error (render never breaks).
    {
      const result = await runSetProfileTheme("gold", {
        authClient: premiumClient(),
        persist: async () => {
          throw new Error("offline supabase");
        },
      });
      check("C15: persist failure → GENERIC safe error", !result.ok && result.code === "GENERIC" && result.error === GENERIC_ERROR, JSON.stringify(result));
    }

    // The persist payload must be ONLY (userId, theme): theme persistence must
    // NEVER write profiles.role nor accept it as an argument. Entitlement comes
    // exclusively from the server-side profile read in resolveActionAccess,
    // not from the persistence layer.
    {
      const seen: Array<{ args: unknown[] }> = [];
      const result = await runSetProfileTheme("gold", {
        authClient: premiumClient(),
        persist: async (...args: unknown[]) => {
          seen.push({ args });
        },
      });
      check("C16: PREMIUM persists requested gold via a 2-arg (userId, theme) call, role NOT written", result.ok && seen.length === 1 && seen[0].args.length === 2 && typeof seen[0].args[0] === "string" && seen[0].args[1] === "gold", JSON.stringify(seen));
    }
    {
      const seen: Array<{ args: unknown[] }> = [];
      const result = await runSetProfileTheme("cyan", {
        authClient: freeClient(),
        persist: async (...args: unknown[]) => {
          seen.push({ args });
        },
      });
      check("C17: FREE persists cyan via a 2-arg (userId, theme) call, role NOT written", result.ok && seen.length === 1 && seen[0].args.length === 2 && seen[0].args[1] === "cyan", JSON.stringify(seen));
    }

    // Missing profile row (no row in profiles) → fail-closed: treated as FREE,
    // premium theme denied BEFORE any persistence attempt.
    {
      const persists: ThemeId[] = [];
      const result = await runSetProfileTheme("gold", {
        authClient: fakeClient({ id: "u" }, { profileMissing: true }),
        persist: persistSpy(persists),
      });
      check("C18: missing profile → premium theme denied PRO_REQUIRED before persistence", !result.ok && result.code === "PRO_REQUIRED", JSON.stringify(result));
      check("C19: missing profile causes 0 persists", persists.length === 0);
    }
  }

  // ── D. Render fail-closed source invariants ──
  console.log("\n--- D. render + UI source invariants ---");
  {
    const cwd = process.cwd();
    const css = fs.readFileSync(`${cwd}/src/app/globals.css`, "utf8");
    for (const t of ["gold", "pink", "green", "red"] as const) {
      check(`D1: globals.css defines [data-theme="${t}"]`, css.includes(`[data-theme="${t}"]`));
    }
    check("D2: globals.css keeps --sa-cyan-rgb token for all themes", css.includes("--sa-cyan-rgb:") && css.includes("--sa-cyan-glow:"));
    check("D3: theme switch is reduced-motion safe", css.includes("prefers-reduced-motion:reduce"));

    const layout = fs.readFileSync(`${cwd}/src/app/layout.tsx`, "utf8");
    check("D4: root layout renders data-theme server-side", layout.includes("data-theme={theme}") && layout.includes("resolveViewerThemeForRender"));

    const account = fs.readFileSync(`${cwd}/src/app/account/page.tsx`, "utf8");
    check("D5: account page renders ThemeSelector with server plan+theme", account.includes("<ThemeSelector") && account.includes("resolveTheme"));

    const selector = fs.readFileSync(`${cwd}/src/components/auth/theme-selector.tsx`, "utf8");
    check("D6: selector hides premium themes behind plan", selector.includes("actionSetProfileTheme") && selector.includes("!isPro && theme !== \"cyan\"") && selector.includes("NYVORX PRO"));
    check("D7: selector triggers client theme transition", selector.includes("themeTransition"));

    const matchPage = fs.readFileSync(`${cwd}/src/components/sports/matches/match-detail-page.tsx`, "utf8");
    const playerPage = fs.readFileSync(`${cwd}/src/components/sports/players/player-detail-page.tsx`, "utf8");
    check("D8: MatchDetailPage forwards plan to PRO panels", /<ProbableLineupPanel[\s\S]*?plan=\{plan\}/.test(matchPage) && /<MatchAiPanels[\s\S]*?plan=\{plan\}/.test(matchPage));
    check("D9: PlayerDetailPage forwards plan to PlayerReportPanel", /<PlayerReportPanel[\s\S]*?plan=\{plan\}/.test(playerPage));

    const lock = fs.readFileSync(`${cwd}/src/components/auth/pro-lock-cta.tsx`, "utf8");
    check("D10: PRO lock CTA points to premium-test with unlock copy", lock.includes("Desbloquear con NYVORX PRO") && lock.includes("premium-test"));

    const upgrade = fs.readFileSync(`${cwd}/src/components/auth/upgrade-card.tsx`, "utf8");
    check("D11: upgrade card advertises ONLY real PRO features (no historial/filtros/odds claims)",
      !upgrade.includes("filtros") && !upgrade.includes("Historial") && !upgrade.includes("Probabilidades completas de local"));
    check("D12: upgrade card keeps honest upcoming-activation CTA", upgrade.includes("Activar PRO — próximamente"));

    const migration = fs.readFileSync(`${cwd}/supabase/migrations/015_profile_theme.sql`, "utf8");
    check("D13: migration 015 adds profiles.theme with check constraint", migration.includes("ADD COLUMN IF NOT EXISTS theme") && migration.includes("CHECK (theme IN ('cyan', 'gold', 'pink', 'green', 'red'))"));
    check("D14: migration 015 forces free → cyan at DB level", migration.includes("enforce_profile_theme_for_role"));

    const admin = fs.readFileSync(`${cwd}/src/lib/auth/admin.ts`, "utf8");
    const setThemeSrc = admin.slice(admin.indexOf("export async function setProfileTheme"));
    check("D15: setProfileTheme signature omits role (userId, theme only)", setThemeSrc.includes("setProfileTheme(userId: string, theme: ThemeId)") && !setThemeSrc.includes("setProfileTheme(userId: string, theme: ThemeId, role"), setThemeSrc.slice(0, 80));
    check("D16: setProfileTheme is UPDATE-only and never writes role", setThemeSrc.includes(".update({ theme })") && !setThemeSrc.includes("upsert") && !/\.update\(\{[^}]*role/.test(setThemeSrc));
    check("D17: setProfileTheme fails safely when the profile row is missing (no insert)", setThemeSrc.includes(".select(") && setThemeSrc.includes("perfil no encontrado"));
  }

  // ── E. Explanation read split NOT regressed ──
  console.log("\n--- E. explanation read split preserved ---");
  {
    const cwd = process.cwd();
    const availability = fs.readFileSync(`${cwd}/src/lib/presentation/explanation-availability.ts`, "utf8");
    check("E1: explanation availability still exports resolveExplanationPlanForRender", availability.includes("resolveExplanationPlanForRender"));
    check("E2: explanation availability now delegates to viewer plan funnel", availability.includes("resolveViewerPlanForRender"));
  }

  console.log("\n======================================================================");
  console.log(`Entitlement/themes smoke: ${passed} passed, ${failed} failed`);
  console.log("======================================================================");
  if (failed > 0) process.exit(1);
}

function premiumClient(): SessionAuthClient {
  return fakeClient({ id: "u-pro" }, { role: "premium" });
}
function freeClient(): SessionAuthClient {
  return fakeClient({ id: "u-free" }, { role: "free" });
}
function persistSpy(persists: ThemeId[]) {
  return async (_userId: string, theme: ThemeId) => {
    persists.push(theme);
  };
}

runTests().catch((err) => {
  console.error("[FATAL] smoke-tests-entitlement-themes failed", err);
  process.exit(1);
});