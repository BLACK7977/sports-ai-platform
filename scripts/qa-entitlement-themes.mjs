/**
 * Browser QA — PRO entitlements + premium themes (feature under test).
 *
 * READ-ONLY: no generate clicks (analyze/report/lineup/explanation), no
 * theme-swatch clicks (persist would be a DB write; migration 015 is NOT
 * applied). Theme CSS is exercised by driving `data-theme` on <html> directly
 * (pure DOM, zero server interaction). Server-side entitlement is covered by
 * `test:entitlement-themes` and `test:action-authorization` (zero-write).
 *
 * Credentials come from .env.e2e (gitignored) and are never printed.
 * Usage: node scripts/qa-entitlement-themes.mjs   (dev server must run on :3101)
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = "http://localhost:3101";

function loadSecrets() {
  const raw = readFileSync(".env.e2e", "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*(E2E_[A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && m[2]) out[m[1]] = m[2];
  }
  return out;
}

const SECRETS = loadSecrets();
const REQ = ["E2E_FREE_EMAIL", "E2E_FREE_PASSWORD", "E2E_PREMIUM_EMAIL", "E2E_PREMIUM_PASSWORD"];
for (const key of REQ) {
  if (!SECRETS[key]) {
    console.error(`MISSING ${key} in .env.e2e`);
    process.exit(2);
  }
}

const FIGHT_ID = "m-soccer-sportmonks:match:19713917"; // future match, persisted prediction #8
const FINISHED_ID = "m-soccer-sportmonks:match:19713931"; // finished match with official lineups

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

// Normaliza un color CSS (hex o rgb[a], con separadores por coma O espacio)
// a canónico "r,g,b". Cada tema autoriza --sa-cyan de forma distinta (hex para
// los acentos, rgb(0 229 255) para el cyan por defecto), así que la
// comparación textual cruda es frágil frente a la serialización del browser.
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

const ACCENT_RGB = { gold: "236,194,77", pink: "244,63,142", green: "47,216,165", red: "240,75,87", cyan: "0,229,255" };

async function login(page, email, password) {
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill("#auth-email", email);
  await page.fill("#auth-password", password);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForLoadState("networkidle");
}

async function openPage(ctx, path) {
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  const resp = await page.goto(BASE + path, { waitUntil: "networkidle" });
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      overflowX: Math.max(0, doc.scrollWidth - doc.clientWidth),
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
    };
  });
  const txt = await page.evaluate(() => document.body?.innerText ?? "");
  return { page, resp, metrics, txt, errors };
}

async function themeCssChecks(page, label) {
  const out = await page.evaluate(() => {
    const reads = {};
    const set = (t) => {
      const root = document.documentElement;
      delete root.dataset.themeTransition;
      root.dataset.theme = t;
    };
    const getCyan = () => getComputedStyle(document.documentElement).getPropertyValue("--sa-cyan").trim();
    u1: for (const t of ["gold", "pink", "green", "red"]) {
      set(t);
      reads[t] = getCyan();
    }
    set("cyan");
    reads.cyan = getCyan();
    const root = document.documentElement;
    root.dataset.themeTransition = "on";
    const trans = getComputedStyle(document.body).transitionProperty;
    delete root.dataset.themeTransition;
    return { reads, trans };
  });
  check(
    `${label} gold theme re-maps accent token`,
    canonicalRgb(out.reads.gold) === ACCENT_RGB.gold,
    `got ${out.reads.gold}`,
  );
  check(
    `${label} pink theme re-maps accent token`,
    canonicalRgb(out.reads.pink) === ACCENT_RGB.pink,
    `got ${out.reads.pink}`,
  );
  check(
    `${label} green theme re-maps accent token`,
    canonicalRgb(out.reads.green) === ACCENT_RGB.green,
    `got ${out.reads.green}`,
  );
  check(
    `${label} red theme re-maps accent token`,
    canonicalRgb(out.reads.red) === ACCENT_RGB.red,
    `got ${out.reads.red}`,
  );
  check(
    `${label} cyan restores default accent`,
    canonicalRgb(out.reads.cyan) === ACCENT_RGB.cyan,
    `got ${out.reads.cyan}`,
  );
  check(`${label} transition applies when motion allowed`, /background-color/.test(out.trans), `got ${out.trans || "(none)"}`);
  await page.reload({ waitUntil: "networkidle" });
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  check(`${label} reload restores server theme (hydrated)`, after === "cyan", `got ${after}`);
}

async function swatchChecks(page, label, opts) {
  const swatches = page.locator('[role="radiogroup"] button[role="radio"]');
  const count = await swatches.count();
  check(`${label} five theme swatches`, count === 5, `got ${count}`);
  const state = await page.evaluate(() =>
    [...document.querySelectorAll('[role="radiogroup"] button[role="radio"]')].map((b) => ({
      theme: b.getAttribute("title"),
      disabled: b.disabled,
      ariaDisabled: b.getAttribute("aria-disabled"),
      checked: b.getAttribute("aria-checked"),
    })),
  );
  const cyan = state.find((s) => s.checked === "true");
  check(`${label} cyan active by default`, Boolean(cyan), cyan?.theme ?? "none");
  const others = state.filter((s) => s.checked !== "true");
  if (opts.free) {
    check(
      `${label} non-cyan swatches disabled for FREE`,
      others.length === 4 && others.every((s) => s.disabled && s.ariaDisabled === "true"),
      others.map((s) => `${s.disabled}/${s.ariaDisabled}`).join(","),
    );
    check(`${label} locked swatch copy says PRO`, /NYVORX PRO/.test(others[0]?.theme ?? ""), others[0]?.theme ?? "");
  } else {
    check(
      `${label} all swatches enabled for PREMIUM`,
      state.every((s) => !s.disabled && s.ariaDisabled === "false"),
      state.map((s) => `${s.disabled}/${s.ariaDisabled}`).join(","),
    );
  }
}

async function firstPlayerPath(ctx) {
  const pl = await ctx.newPage();
  await pl.goto(BASE + "/soccer/players", { waitUntil: "networkidle" });
  const href = await pl
    .locator("a[href*='/soccer/players/sportmonks-player-']")
    .first()
    .getAttribute("href")
    .catch(() => null);
  await pl.close();
  return href;
}

async function run() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });

  // ─────────── 1. FREE desktop 1440 ───────────
  {
    console.log("\n[FREE desktop 1440]");
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    await login(page, SECRETS.E2E_FREE_EMAIL, SECRETS.E2E_FREE_PASSWORD);

    const acc = await openPage(ctx, "/account");
    check("FREE html data-theme=cyan", (await acc.page.evaluate(() => document.documentElement.dataset.theme)) === "cyan");
    check("FREE account CTA 'Desbloquear con NYVORX PRO'", /Desbloquear con NYVORX PRO/.test(acc.txt));
    check("FREE no horizontal overflow /account", acc.metrics.overflowX <= 1, `overflow=${acc.metrics.overflowX}`);
    check("FREE no console errors /account", errors.length === 0, errors[0] ?? "");
    await swatchChecks(acc.page, "FREE", { free: true });

    // future match: persisted prediction (FREE) + probable-lineup module renders
    const mf = await openPage(ctx, "/soccer/matches/" + encodeURIComponent(FIGHT_ID));
    check("FREE future-match prediction SSR present (50/23/27)", /ANÁLISIS NYVORX/.test(mf.txt) && /50%/.test(mf.txt) && /23%/.test(mf.txt) && /27%/.test(mf.txt), "prediction #8");
    check("FREE future-match probable-lineup module present", /PREDICCIÓN DE ALINEACIÓN/.test(mf.txt));
    const pitch = await mf.page.locator(".probable-lineup").count();
    check("FREE future-match probable lineup renders (probable mode)", pitch > 0, `got ${pitch}`);
    check("FREE no locks in probable-lineup mode (data present)", (await mf.page.locator(".match-explanation-locked").count()) === 0);
    check("FREE no overflow match", mf.metrics.overflowX <= 1, `overflow=${mf.metrics.overflowX}`);
    check("FREE no console errors match", mf.errors.length === 0, mf.errors[0] ?? "");

    // finished match: radiografía PRO lock + FREE prediction CTA (predict match stays FREE)
    const fn = await openPage(ctx, "/soccer/matches/" + encodeURIComponent(FINISHED_ID));
    const fnLocks = await fn.page.locator(".match-explanation-locked").count();
    check("FREE finished-match radiografía locked (PRO)", fnLocks >= 1, `locks=${fnLocks}`);
    check("FREE finished-match locked copy present", /Radiografía con IA/.test(fn.txt) && /Desbloquear con NYVORX PRO/.test(fn.txt));
    check("FREE finished-match predict-match CTA stays FREE", /Cargar predicción del modelo/.test(fn.txt));
    check("FREE no horizontal overflow finished match", fn.metrics.overflowX <= 1, `overflow=${fn.metrics.overflowX}`);
    check("FREE no console errors finished match", fn.errors.length === 0, fn.errors[0] ?? "");

    // player page lock
    const playerHref = await firstPlayerPath(ctx);
    check("FREE player page resolves", Boolean(playerHref), playerHref ?? "none");
    if (playerHref) {
      const pp = await openPage(ctx, playerHref);
      check("FREE player report locked", /Informe avanzado del jugador/.test(pp.txt) && /Desbloquear con NYVORX PRO/.test(pp.txt));
      check("FREE no overflow player", pp.metrics.overflowX <= 1, `overflow=${pp.metrics.overflowX}`);
      check("FREE no console errors player", pp.errors.length === 0, pp.errors[0] ?? "");
    }

    // premium-test locked state
    const pt = await openPage(ctx, "/soccer/premium-test");
    check("FREE premium-test ZONA PRO locked", /ZONA PRO/.test(pt.txt) && /bloqueado/i.test(pt.txt));

    await ctx.close();
  }

  // ─────────── 2. PREMIUM desktop 1440 ───────────
  {
    console.log("\n[PREMIUM desktop 1440]");
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    await login(page, SECRETS.E2E_PREMIUM_EMAIL, SECRETS.E2E_PREMIUM_PASSWORD);

    const acc = await openPage(ctx, "/account");
    check("PREMIUM html data-theme=cyan (pre-migration default)", (await acc.page.evaluate(() => document.documentElement.dataset.theme)) === "cyan");
    check("PREMIUM account shows active plan", /NYVORX Pro/.test(acc.txt) && /activo/i.test(acc.txt));
    check("PREMIUM no upgrade CTA on account", !/Ver NYVORX PRO/.test(acc.txt) && !/Desbloquear con NYVORX PRO/.test(acc.txt));
    check("PREMIUM no horizontal overflow /account", acc.metrics.overflowX <= 1, `overflow=${acc.metrics.overflowX}`);
    check("PREMIUM no console errors /account", errors.length === 0, errors[0] ?? "");
    await swatchChecks(acc.page, "PREMIUM", { free: false });
    await themeCssChecks(acc.page, "PREMIUM");

    // future match: persisted prediction + probable lineup, zero locks
    const mf = await openPage(ctx, "/soccer/matches/" + encodeURIComponent(FIGHT_ID));
    const locks = await mf.page.locator(".match-explanation-locked").count();
    check("PREMIUM future-match has no PRO lock", locks === 0, `got ${locks}`);
    check("PREMIUM future-match prediction SSR present (50/23/27)", /ANÁLISIS NYVORX/.test(mf.txt) && /50%/.test(mf.txt) && /23%/.test(mf.txt) && /27%/.test(mf.txt));
    check("PREMIUM future-match probable lineup renders", (await mf.page.locator(".probable-lineup").count()) > 0);
    check("PREMIUM no overflow match", mf.metrics.overflowX <= 1, `overflow=${mf.metrics.overflowX}`);
    check("PREMIUM no console errors match", mf.errors.length === 0, mf.errors[0] ?? "");

    // finished match: radiografía unlocked (CTA) + predict CTA
    const fn = await openPage(ctx, "/soccer/matches/" + encodeURIComponent(FINISHED_ID));
    const fnLocks = await fn.page.locator(".match-explanation-locked").count();
    check("PREMIUM finished-match no PRO lock", fnLocks === 0, `got ${fnLocks}`);
    check("PREMIUM finished-match radiografía CTA present", /Generar análisis con IA/.test(fn.txt));
    check("PREMIUM finished-match predict CTA present", /Cargar predicción del modelo/.test(fn.txt));
    check("PREMIUM no horizontal overflow finished match", fn.metrics.overflowX <= 1, `overflow=${fn.metrics.overflowX}`);
    check("PREMIUM no console errors finished match", fn.errors.length === 0, fn.errors[0] ?? "");

    // player page unlocked
    const playerHref = await firstPlayerPath(ctx);
    if (playerHref) {
      const pp = await openPage(ctx, playerHref);
      check("PREMIUM player report unlocked (CTA)", /Generar informe con IA/.test(pp.txt) && !/Desbloquear con NYVORX PRO/.test(pp.txt));
      check("PREMIUM no overflow player", pp.metrics.overflowX <= 1, `overflow=${pp.metrics.overflowX}`);
      check("PREMIUM no console errors player", pp.errors.length === 0, pp.errors[0] ?? "");
    }

    // premium-test unlocked
    const pt = await openPage(ctx, "/soccer/premium-test");
    check("PREMIUM premium-test shows PREMIUM ACTIVO", /PREMIUM ACTIVO/.test(pt.txt));
    check("PREMIUM no locked ZONA PRO", !/bloqueado/i.test(pt.txt) || /SIN BLOQUEOS/.test(pt.txt));

    await ctx.close();
  }

  // ─────────── 3. FREE mobile 390 ───────────
  {
    console.log("\n[FREE mobile 390]");
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await login(page, SECRETS.E2E_FREE_EMAIL, SECRETS.E2E_FREE_PASSWORD);
    const acc = await openPage(ctx, "/account");
    check("FREE mobile account CTA present", /Desbloquear con NYVORX PRO/.test(acc.txt));
    check("FREE mobile no horizontal overflow /account", acc.metrics.overflowX <= 1, `overflow=${acc.metrics.overflowX}`);
    await swatchChecks(acc.page, "FREE-mobile", { free: true });
    const mf = await openPage(ctx, "/soccer/matches/" + encodeURIComponent(FIGHT_ID));
    check("FREE mobile no horizontal overflow match", mf.metrics.overflowX <= 1, `overflow=${mf.metrics.overflowX}`);
    const fn = await openPage(ctx, "/soccer/matches/" + encodeURIComponent(FINISHED_ID));
    const locks = await fn.page.locator(".match-explanation-locked").count();
    check("FREE mobile finished-match shows radiografía lock", locks >= 1, `got ${locks}`);
    check("FREE mobile finished-match no horizontal overflow", fn.metrics.overflowX <= 1, `overflow=${fn.metrics.overflowX}`);
    await ctx.close();
  }

  // ─────────── 4. PREMIUM mobile 390 ───────────
  {
    console.log("\n[PREMIUM mobile 390]");
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await login(page, SECRETS.E2E_PREMIUM_EMAIL, SECRETS.E2E_PREMIUM_PASSWORD);
    const acc = await openPage(ctx, "/account");
    check("PREMIUM mobile no horizontal overflow /account", acc.metrics.overflowX <= 1, `overflow=${acc.metrics.overflowX}`);
    await swatchChecks(acc.page, "PREMIUM-mobile", { free: false });
    const mf = await openPage(ctx, "/soccer/matches/" + encodeURIComponent(FIGHT_ID));
    const locks = await mf.page.locator(".match-explanation-locked").count();
    check("PREMIUM mobile no locks", locks === 0, `got ${locks}`);
    check("PREMIUM mobile no horizontal overflow match", mf.metrics.overflowX <= 1, `overflow=${mf.metrics.overflowX}`);
    const fn = await openPage(ctx, "/soccer/matches/" + encodeURIComponent(FINISHED_ID));
    const fnLocks = await fn.page.locator(".match-explanation-locked").count();
    check("PREMIUM mobile finished-match radiografía unlocked", fnLocks === 0, `got ${fnLocks}`);
    await ctx.close();
  }

  // ─────────── 5. Reduced-motion fallback ───────────
  {
    console.log("\n[reduced-motion 1440]");
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await login(page, SECRETS.E2E_PREMIUM_EMAIL, SECRETS.E2E_PREMIUM_PASSWORD);
    await openPage(ctx, "/account");
    const how = await page.evaluate(() => {
      const root = document.documentElement;
      root.dataset.theme = "gold";
      const body = getComputedStyle(document.body);
      const base = body.transitionDuration;
      root.dataset.themeTransition = "on";
      const themed = getComputedStyle(document.body).transitionDuration;
      const res = {
        base,
        themed,
        unchanged: themed === base,
        goldCyan: getComputedStyle(root).getPropertyValue("--sa-cyan").trim(),
      };
      delete root.dataset.theme;
      delete root.dataset.themeTransition;
      return res;
    });
    check("reduced-motion: theme switch adds no transition (duration unchanged)", how.unchanged, `base=${how.base} themed=${how.themed}`);
    check("reduced-motion: theme still applies", canonicalRgb(how.goldCyan) === ACCENT_RGB.gold, `got ${how.goldCyan}`);
    await ctx.close();
  }

  await browser.close();

  console.log(`\nQA_ENTITLEMENT_THEMES_RESULT ${failCount === 0 ? "PASS" : "FAIL"} count=${failCount}`);
  if (failures.length) console.log("Failures:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(failCount === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});