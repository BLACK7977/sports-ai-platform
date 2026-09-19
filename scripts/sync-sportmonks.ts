import { loadEnvConfig } from "@next/env";
import { runSportmonksCompetitionSync, type SportmonksSyncOptions } from "../src/lib/services/sportmonks-sync-service";

loadEnvConfig(process.cwd(), true);

// SPORTMONKS_SYNC_CONFIRM es solo un fallback de runner cuando el shell consume --confirm.
const confirmed = process.argv.includes("--confirm") || process.env.SPORTMONKS_SYNC_CONFIRM === "true";

function option(name: string): string | undefined {
  return process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1);
}

function requiredNumber(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} debe ser un entero positivo.`);
  return parsed;
}

async function main() {
  // Defaults aprobados: liga 271 / temporada 27897 (Denmark Superliga).
  const input: SportmonksSyncOptions = {
    leagueExternalId: requiredNumber(option("--league-id") ?? "271", "--league-id"),
    seasonExternalId: requiredNumber(option("--season-id") ?? "27897", "--season-id"),
    internalLeagueId: option("--internal-league-id") ?? "sportmonks-denmark-superliga",
    internalSeasonId: option("--internal-season-id") ?? "sportmonks-denmark-superliga-2026-2027",
    displayName: option("--name") ?? "Superliga",
    country: option("--country") ?? "Denmark",
    from: option("--from") ?? "2026-07-24",
    to: option("--to") ?? "2027-03-21",
    confirm: confirmed,
  };

  const outcome = await runSportmonksCompetitionSync(input);
  console.log(`SPORTMONKS_PREVIEW: ${JSON.stringify(outcome.summary)}`);
  if (!outcome.result) {
    console.log("SPORTMONKS_SYNC: PREVIEW_ONLY. Agregá --confirm únicamente después de aprobar estos datos.");
    return;
  }
  console.log(`SPORTMONKS_SYNC: COMPLETE ${JSON.stringify(outcome.result)}`);
  if (outcome.result.errors > 0) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
