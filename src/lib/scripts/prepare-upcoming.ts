import { prepareUpcomingPredictions } from "@/lib/services/upcoming-preparation-service";

function numberArg(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  return raw === undefined ? fallback : Number(raw);
}

async function main() {
  const confirmed = process.argv.includes("--confirm");
  const result = await prepareUpcomingPredictions({
    dryRun: !confirmed,
    horizonDays: numberArg("horizon-days", 14),
    limit: numberArg("limit", 20),
  });
  console.log(result.dryRun ? "DRY RUN — 0 writes" : "CONFIRMED");
  result.items.forEach((item, index) => console.log(`[${index + 1}/${result.items.length}] match=${item.matchId} ${item.outcome}${item.reason ? ` (${item.reason})` : ""}`));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Preparation failed"); process.exitCode = 1; });
