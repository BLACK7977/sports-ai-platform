import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = "http://localhost:3101";
const raw = readFileSync(".env.local", "utf8");
const ENV = {};
for (const line of raw.split(/\r?\n/)) {
  const m = /^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
  if (m && m[2]) ENV[m[1]] = m[2];
}
const e2e = {};
for (const line of readFileSync(".env.e2e", "utf8").split(/\r?\n/)) {
  const m = /^([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
  if (m && m[2]) e2e[m[1]] = m[2];
}

// La app normaliza NEXT_PUBLIC_SUPABASE_URL a la URL raíz del proyecto
// (getSupabaseProjectUrl en src/lib/config/env.ts) antes de construir
// supabase-js: recorta el sufijo histórico /rest/v1. El valor raw de .env.local
// NO es la raíz; sin este recorte createClient falla en cada llamada.
const PROJECT_URL = ENV.NEXT_PUBLIC_SUPABASE_URL.replace(/\/?rest\/v1\/?$/, "").replace(/\/$/, "");

const supabase = createClient(PROJECT_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function decodeJwt(token) {
  const p = token.split(".")[1];
  return JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
}

async function readProfileBySub(sub) {
  const { data, error } = await supabase.from("profiles").select("role, theme").eq("user_id", sub).maybeSingle();
  return { data, error: error?.message ?? null };
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(BASE + "/login", { waitUntil: "networkidle" });
await page.fill("#auth-email", e2e.E2E_PREMIUM_EMAIL);
await page.fill("#auth-password", e2e.E2E_PREMIUM_PASSWORD);
await Promise.all([
  page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25000 }),
  page.click('button[type="submit"]'),
]);
await page.waitForLoadState("networkidle");

const cookies = await ctx.cookies();
const tokenKey = cookies.map((c) => c.name).find((k) => /token|auth/i.test(k));
const tc = cookies.find((c) => c.name === tokenKey);
if (!tc) {
  console.log("NO_COOKIE", cookies.map((c) => c.name).join(","));
  await browser.close();
  process.exit(1);
}
console.log("cookie names = ", cookies.map((c) => c.name).join(","));
console.log("token cookie name = ", tc.name, "| value len =", String(tc.value).length);
const token = String(tc.value);
let cred;
try {
  const raw = token.startsWith("base64-") ? token.slice("base64-".length) : token;
  const parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  cred = parsed.access_token ? parsed : null;
  console.log("parsed session keys = ", Object.keys(parsed).join(","));
} catch (e) {
  console.log("parse failed: ", e.message);
  cred = null;
}
const jwt = cred ? cred.access_token : token;
const payload = decodeJwt(jwt);
const sub = String(payload.sub);
console.log("JWT sub (prefix)= ", sub.slice(0, 8) + "…", "| role= ", payload.role, "| email= ", payload.email);

const before = await readProfileBySub(sub);
console.log("profiles BEFORE = ", JSON.stringify({ role: before.data?.role, theme: before.data?.theme, err: before.error }));

await page.goto(BASE + "/account", { waitUntil: "networkidle" });
console.log("server-rendered data-theme (fresh /account) = ", await page.evaluate(() => document.documentElement.dataset.theme));
await page.locator('[role="radiogroup"] button[role="radio"]').filter({ hasText: "Oro" }).click();
await page.waitForFunction(() => document.documentElement.dataset.theme === "gold", null, { timeout: 15000 });
await page.waitForTimeout(3000);

const after = await readProfileBySub(sub);
console.log("profiles AFTER gold = ", JSON.stringify({ role: after.data?.role, theme: after.data?.theme, err: after.error }));

console.log("browser data-theme = ", await page.evaluate(() => document.documentElement.dataset.theme));
console.log("browser alert present = ", await page.locator('[role="alert"]').count());
const alertText = await page.locator('[role="alert"]').first().textContent().catch(() => null);
console.log("browser alert text = ", alertText ?? "(none)");

await browser.close();