/**
 * POST-MIGRATION 015 — REAL theme persistence E2E.
 *
 * Migration 015 is APPLIED (profiles.theme exists; trigger enabled). This
 * script now performs REAL allowed writes: the PREMIUM account selects themes
 * through the actual ThemeSelector UI (legit Server-Action persistence via
 * service_role). The FREE account never clicks a non-cyan swatch (UI blocks
 * it; the browser cannot dispatch on a disabled control) and never issues a
 * write.
 *
 * DB reads (after each allowed change) use the service_role to confirm what
 * was persisted. Credentials are read from .env.e2e / .env.local and are
 * NEVER printed.
 *
 * Usage: node scripts/qa-theme-persistence-e2e.mjs  (dev server on :3101)
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = "http://localhost:3101";

function loadSecrets(path, re) {
  const out = {};
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = re.exec(line.trim());
    if (m && m[2]) out[m[1]] = m[2];
  }
  return out;
}

const SECRETS = loadSecrets(".env.e2e", /^([Ee][A-Za-z0-9_]+)\s*=\s*(.*)$/);
const ENV = loadSecrets(".env.local", /^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
for (const key of ["E2E_FREE_EMAIL", "E2E_FREE_PASSWORD", "E2E_PREMIUM_EMAIL", "E2E_PREMIUM_PASSWORD"]) {
  if (!SECRETS[key]) {
    console.error(`MISSING ${key} in .env.e2e`);
    process.exit(2);
  }
}
const SUPABASE_URL = ENV.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("MISSING NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(2);
}
// La app normaliza la URL raíz del proyecto (getSupabaseProjectUrl en
// src/lib/config/env.ts): acepta el sufijo histórico /rest/v1 y lo recorta.
// createClient requiere la URL raíz; sin este recorte toda llamada admin/REST
// falla con "Invalid path specified in request URL".
const PROJECT_URL = SUPABASE_URL.replace(/\/?rest\/v1\/?$/, "").replace(/\/$/, "");

const FIGHT_ID = "m-soccer-sportmonks:match:19713917";
const FINISHED_ID = "m-soccer-sportmonks:match:19713931";

let passCount = 0;
let failCount = 0;
const failures = [];

function check(name, cond, detail = "") {
  if (cond) {
    passCount++;
    console.log(`  OK   ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    failCount++;
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` (${detail})` : ""}`);
  }
}
function section(title) {
  console.log(`\n[${title}]`);
}

// ── DB read-helpers (READ ONLY; never print credentials) ──
const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function dbReadProfile(email) {
  const { data: users, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error || !users?.users) return { error: "listUsers failed" };
  const u = users.users.find((x) => x.email === email);
  if (!u) return { error: "user not found by email" };
  const { data, error: e2 } = await supabase.from("profiles").select("role, theme").eq("user_id", u.id).maybeSingle();
  if (e2) return { error: e2.message };
  return { data };
}

async function waitDbTheme(email, theme, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const r = await dbReadProfile(email);
    if (r.data?.theme) last = r.data.theme;
    if (r.data?.theme === theme) return { ok: true, theme: last };
    await new Promise((res) => setTimeout(res, 400));
  }
  return { ok: false, theme: last };
}

// ── Browser helpers ──
async function login(page, email, password) {
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill("#auth-email", email);
  await page.fill("#auth-password", password);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForLoadState("networkidle");
}

async function openPage(ctx, path) {
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  const metrics = await page.evaluate(() => {
    const d = document.documentElement;
    return { overflowX: Math.max(0, d.scrollWidth - d.clientWidth), scrollWidth: d.scrollWidth, clientWidth: d.clientWidth };
  });
  const txt = await page.evaluate(() => document.body?.innerText ?? "");
  return { page, metrics, txt, errors };
}

function readTheme(page) {
  return page.evaluate(() => document.documentElement.dataset.theme);
}

function readCss(page) {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      accent: cs.getPropertyValue("--sa-cyan").trim(),
      cyan400: cs.getPropertyValue("--color-cyan-400").trim(),
      bodyBg: getComputedStyle(document.body).backgroundColor,
    };
  });
}

const DARK_BG = "rgb(2, 4, 6)";
const ACCENTS = { gold: "#ecc24d", pink: "#f43f8e", cyan: "#00e5ff" };

// Normaliza un color CSS (hex o rgb[a]) a canónico "r,g,b". Chromium
// serializa el custom property --sa-cyan de forma distinta según el theme
// (hex para los acentos, rgb() para cyan), así que la comparación textual
// cruda es frágil.
function canonicalRgb(value) {
  const s = String(value).trim().toLowerCase();
  const hex = /^#([0-9a-f]{6})$/.exec(s);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }
  const m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    return m[1].split(/[,\s/]+/).filter(Boolean).slice(0, 3).join(",");
  }
  return s;
}

async function clickTheme(page, title, themeVal) {
  await page.locator('[role="radiogroup"] button[role="radio"]').filter({ hasText: title }).click();
  await page.waitForFunction((t) => document.documentElement.dataset.theme === t, themeVal, { timeout: 15000 });
}

async function verifyThemeApplied(label, page, themeVal) {
  const css = await readCss(page);
  const expect = ACCENTS[themeVal];
  check(`${label} accent token coherent (${themeVal})`, canonicalRgb(css.accent) === canonicalRgb(expect), `got ${css.accent}`);
  if (themeVal !== "cyan") {
    check(`${label} tailwind cyan-400 re-mapped (${themeVal})`, css.cyan400.toLowerCase() === expect.toLowerCase(), `got ${css.cyan400}`);
  }
  check(`${label} dark foundation intact (body bg)`, css.bodyBg === DARK_BG, `got ${css.bodyBg}`);
}

async function run() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });

  // ────────── 1. PREMIUM persistence (1440) ──────────
  {
    section("PREMIUM persistence 1440");
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await login(page, SECRETS.E2E_PREMIUM_EMAIL, SECRETS.E2E_PREMIUM_PASSWORD);

    const acc0 = await openPage(ctx, "/account");
    check("PREMIUM starts server-rendered cyan", (await readTheme(acc0.page)) === "cyan");
    check("PREMIUM /account no overflow (initial)", acc0.metrics.overflowX <= 1, `overflow=${acc0.metrics.overflowX}`);
    check("PREMIUM /account no console errors (initial)", acc0.errors.length === 0, acc0.errors[0] ?? "");
    const sw = acc0.page.locator('[role="radiogroup"] button[role="radio"]');
    check("PREMIUM five swatches present", (await sw.count()) === 5);
    check("PREMIUM swatches all enabled", await acc0.page.evaluate(() =>
      [...document.querySelectorAll('[role="radiogroup"] button[role="radio"]')].every((b) => !b.disabled)));

    // GOLD
    await clickTheme(acc0.page, "Oro", "gold");
    check("PREMIUM GOLD applied to <html>", (await readTheme(acc0.page)) === "gold");
    await verifyThemeApplied("PREMIUM GOLD", acc0.page, "gold");
    const dbGold = await waitDbTheme(SECRETS.E2E_PREMIUM_EMAIL, "gold");
    check("DB: PREMIUM persisted GOLD", dbGold.ok, `theme=${dbGold.theme}`);
    check("PREMIUM /account no console errors (gold set)", acc0.errors.length === 0, acc0.errors[0] ?? "");

    // reload → persists
    const acc1 = await openPage(ctx, "/account");
    check("PREMIUM reload persists GOLD (server-rendered)", (await readTheme(acc1.page)) === "gold");
    const goldChecked = await acc1.page.evaluate(() =>
      [...document.querySelectorAll('[role="radiogroup"] button[role="radio"]')].find((b) => b.getAttribute("aria-checked") === "true")?.title ?? "");
    check("PREMIUM GOLD swatch active after reload", goldChecked === "Oro", `got ${goldChecked}`);
    check("PREMIUM /account no console errors (gold reload)", acc1.errors.length === 0, acc1.errors[0] ?? "");

    // match page → theme remains gold
    const fm = await openPage(ctx, "/soccer/matches/" + encodeURIComponent(FINISHED_ID));
    check("PREMIUM match page renders GOLD", (await readTheme(fm.page)) === "gold");
    check("PREMIUM match page no overflow", fm.metrics.overflowX <= 1, `overflow=${fm.metrics.overflowX}`);
    check("PREMIUM match page no console errors", fm.errors.length === 0, fm.errors[0] ?? "");
    await verifyThemeApplied("PREMIUM match GOLD", fm.page, "gold");

    // PINK
    const acc2 = await openPage(ctx, "/account");
    await clickTheme(acc2.page, "Rosa", "pink");
    check("PREMIUM PINK applied to <html>", (await readTheme(acc2.page)) === "pink");
    await verifyThemeApplied("PREMIUM PINK", acc2.page, "pink");
    const dbPink = await waitDbTheme(SECRETS.E2E_PREMIUM_EMAIL, "pink");
    check("DB: PREMIUM persisted PINK", dbPink.ok, `theme=${dbPink.theme}`);
    const acc3 = await openPage(ctx, "/account");
    check("PREMIUM reload persists PINK (server-rendered)", (await readTheme(acc3.page)) === "pink");

    // restore CYAN
    await clickTheme(acc3.page, "Cian", "cyan");
    check("PREMIUM CYAN restored on <html>", (await readTheme(acc3.page)) === "cyan");
    await verifyThemeApplied("PREMIUM CYAN", acc3.page, "cyan");
    const dbCyan = await waitDbTheme(SECRETS.E2E_PREMIUM_EMAIL, "cyan");
    check("DB: PREMIUM persisted CYAN (restored)", dbCyan.ok, `theme=${dbCyan.theme}`);
    const acc4 = await openPage(ctx, "/account");
    check("PREMIUM reload restores CYAN", (await readTheme(acc4.page)) === "cyan");
    check("PREMIUM final /account no console errors", acc4.errors.length === 0, acc4.errors[0] ?? "");

    await ctx.close();
  }

  // ────────── 2. PREMIUM persistence (390) ──────────
  {
    section("PREMIUM persistence 390");
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await login(page, SECRETS.E2E_PREMIUM_EMAIL, SECRETS.E2E_PREMIUM_PASSWORD);
    const acc = await openPage(ctx, "/account");
    check("PREMIUM mobile starts cyan", (await readTheme(acc.page)) === "cyan");
    check("PREMIUM mobile no overflow /account", acc.metrics.overflowX <= 1, `overflow=${acc.metrics.overflowX}`);
    check("PREMIUM mobile no console errors /account", acc.errors.length === 0, acc.errors[0] ?? "");
    await clickTheme(acc.page, "Oro", "gold");
    check("PREMIUM mobile GOLD applied", (await readTheme(acc.page)) === "gold");
    await verifyThemeApplied("PREMIUM mobile GOLD", acc.page, "gold");
    const dbGold = await waitDbTheme(SECRETS.E2E_PREMIUM_EMAIL, "gold");
    check("DB: PREMIUM mobile persisted GOLD", dbGold.ok, `theme=${dbGold.theme}`);
    const acc2 = await openPage(ctx, "/account");
    check("PREMIUM mobile reload persists GOLD", (await readTheme(acc2.page)) === "gold");
    const fm = await openPage(ctx, "/soccer/matches/" + encodeURIComponent(FIGHT_ID));
    check("PREMIUM mobile match page renders GOLD", (await readTheme(fm.page)) === "gold");
    check("PREMIUM mobile match page no overflow", fm.metrics.overflowX <= 1, `overflow=${fm.metrics.overflowX}`);
    check("PREMIUM mobile match page no console errors", fm.errors.length === 0, fm.errors[0] ?? "");
    await clickTheme(acc2.page, "Cian", "cyan");
    await waitDbTheme(SECRETS.E2E_PREMIUM_EMAIL, "cyan");
    await ctx.close();
  }

  // ────────── 3. FREE lock (1440) ──────────
  {
    section("FREE lock 1440");
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await login(page, SECRETS.E2E_FREE_EMAIL, SECRETS.E2E_FREE_PASSWORD);
    const acc = await openPage(ctx, "/account");
    check("FREE server-rendered cyan", (await readTheme(acc.page)) === "cyan");
    check("FREE /account no overflow", acc.metrics.overflowX <= 1, `overflow=${acc.metrics.overflowX}`);
    check("FREE /account no console errors", acc.errors.length === 0, acc.errors[0] ?? "");
    const state = await acc.page.evaluate(() =>
      [...document.querySelectorAll('[role="radiogroup"] button[role="radio"]')].map((b) => ({
        theme: b.title,
        disabled: b.disabled,
        ariaDisabled: b.getAttribute("aria-disabled"),
        checked: b.getAttribute("aria-checked"),
      })));
    check("FREE five swatches", state.length === 5, `got ${state.length}`);
    const cyan = state.find((s) => s.checked === "true");
    check("FREE cyan selectable+active", cyan?.theme === "Cian" && !cyan.disabled, cyan?.theme ?? "none");
    const locked = state.filter((s) => s.checked !== "true");
    check("FREE gold/pink/green/red locked (disabled)", locked.length === 4 && locked.every((s) => s.disabled && s.ariaDisabled === "true"),
      locked.map((s) => `${s.theme}:${s.disabled}/${s.ariaDisabled}`).join(","));
    check("FREE locked swatches show PRO", locked.every((s) => /NYVORX PRO/.test(s.theme)), locked.map((s) => s.theme).join(","));

    // attempt to click a locked swatch (UI must block: disabled control cannot dispatch)
    await acc.page.locator('[role="radiogroup"] button[role="radio"]').nth(1).click({ force: true, timeout: 5000 }).catch(() => {});
    await acc.page.waitForTimeout(1200);
    check("FREE theme stays cyan after locked attempt", (await readTheme(acc.page)) === "cyan");
    // Next.js inyecta un announcer de rutas <div id="__next-route-announcer__"
    // role="alert"> (vacío, dentro de un shadow root). Es del framework, NO de
    // ThemeSelector: se excluye para afirmar que la app no muestra alertas.
    const appAlerts = await acc.page
      .locator('[role="alert"]:not(#__next-route-announcer__)')
      .allTextContents();
    check("FREE no error alert on account", appAlerts.length === 0, appAlerts.join(" | "));
    const dbFree = await dbReadProfile(SECRETS.E2E_FREE_EMAIL);
    check("DB: FREE theme remains cyan", dbFree.data?.theme === "cyan", dbFree.data?.theme ?? dbFree.error ?? "n/a");

    const fm = await openPage(ctx, "/soccer/matches/" + encodeURIComponent(FIGHT_ID));
    check("FREE match page cyan", (await readTheme(fm.page)) === "cyan");
    check("FREE match page no overflow", fm.metrics.overflowX <= 1, `overflow=${fm.metrics.overflowX}`);
    check("FREE match page no console errors", fm.errors.length === 0, fm.errors[0] ?? "");
    await ctx.close();
  }

  // ────────── 4. FREE lock (390) ──────────
  {
    section("FREE lock 390");
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await login(page, SECRETS.E2E_FREE_EMAIL, SECRETS.E2E_FREE_PASSWORD);
    const acc = await openPage(ctx, "/account");
    check("FREE mobile server-rendered cyan", (await readTheme(acc.page)) === "cyan");
    const st = await acc.page.evaluate(() =>
      [...document.querySelectorAll('[role="radiogroup"] button[role="radio"]')].map((b) => ({
        theme: b.title, disabled: b.disabled, checked: b.getAttribute("aria-checked"),
      })));
    check("FREE mobile cyan active only", st.filter((s) => s.checked === "true").length === 1 && st.find((s) => s.checked === "true")?.theme === "Cian");
    check("FREE mobile four locked", st.filter((s) => s.checked !== "true").length === 4 && st.filter((s) => s.checked !== "true").every((s) => s.disabled));
    const fm = await openPage(ctx, "/soccer/matches/" + encodeURIComponent(FINISHED_ID));
    check("FREE mobile match no overflow", fm.metrics.overflowX <= 1, `overflow=${fm.metrics.overflowX}`);
    check("FREE mobile match no console errors", fm.errors.length === 0, fm.errors[0] ?? "");
    await ctx.close();
  }

  await browser.close();

  // ── Final DB state readout (values only, no credentials) ──
  {
    const pre = await dbReadProfile(SECRETS.E2E_PREMIUM_EMAIL);
    const free = await dbReadProfile(SECRETS.E2E_FREE_EMAIL);
    console.log("\n[DB final state]");
    console.log(`  premium → role=${pre.data?.role ?? "?"} theme=${pre.data?.theme ?? "?"}`);
    console.log(`  free    → role=${free.data?.role ?? "?"} theme=${free.data?.theme ?? "?"}`);
    check("DB: premium final theme cyan (restored)", pre.data?.theme === "cyan", pre.data?.theme ?? "n/a");
    check("DB: free final theme cyan (unchanged)", free.data?.theme === "cyan", free.data?.theme ?? "n/a");
  }

  console.log(`\nQA_THEME_PERSISTENCE_RESULT ${failCount === 0 ? "PASS" : "FAIL"} count=${failCount}`);
  if (failures.length) console.log("Failures:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(failCount === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});