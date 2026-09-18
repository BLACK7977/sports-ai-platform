import { getMatchesByLeagueSeason } from "../src/lib/db/repositories/matches-repo";
import { enrichMatchContexts } from "../src/lib/services/match-context-enrichment-service";
import { getMatchIdsWithPersistedContext } from "../src/lib/db/repositories/match-context-repo";

async function main() {
const args = new Set(process.argv.slice(2));
const confirm = args.has("--confirm");
const value = (prefix: string, fallback: number) => {
  const raw = [...args].find((arg) => arg.startsWith(`${prefix}=`))?.split("=")[1];
  const envKey = `npm_config_${prefix.replace(/^--/, "").replaceAll("-", "_")}`;
  const parsed = Number(raw ?? process.env[envKey]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};
const limit = value("--limit", 10);
const horizonDays = value("--horizon-days", 30);
const delayMs = value("--delay-ms", 1500);
const leagueId = process.env.MATCH_CONTEXT_LEAGUE_ID ?? "sportmonks-denmark-superliga";
const seasonId = process.env.MATCH_CONTEXT_SEASON_ID ?? "sportmonks-denmark-superliga-2026-2027";
const cutoff = Date.now() + horizonDays * 86_400_000;
const eligible = (await getMatchesByLeagueSeason(leagueId, seasonId))
  .filter((match) => match.status === "scheduled" && Date.parse(match.match_date) >= Date.now() && Date.parse(match.match_date) <= cutoff)
  .sort((a, b) => a.match_date.localeCompare(b.match_date) || a.id.localeCompare(b.id));
const completed = await getMatchIdsWithPersistedContext(eligible.map((match) => match.id));
const matches = eligible.filter((match) => !completed.has(match.id))
  .slice(0, limit);
const results = await enrichMatchContexts(matches, { confirm, delayMs });
results.forEach((result, index) => console.log(`[${index + 1}/${results.length}] fixture=${result.fixtureId} ${result.status}${result.error ? ` (${result.error})` : ""}`));
console.log(JSON.stringify({ mode: confirm ? "CONFIRM" : "DRY_RUN", candidates: results.length, sportmonksRequests: confirm ? results.length : 0 }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Error inesperado"); process.exitCode = 1; });
