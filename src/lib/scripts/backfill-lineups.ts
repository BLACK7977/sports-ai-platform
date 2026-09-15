import "server-only";
import { loadEnvConfig } from "@next/env";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  BACKFILL_SCOPE, BackfillError, emptyBackfillJournal, planLineupBackfill, readBackfillJournal,
  runLineupBackfill, type BackfillJournal, type BackfillOptions,
} from "@/lib/services/lineup-backfill-service";

function optionsFrom(args: string[]): BackfillOptions {
  const options: BackfillOptions = {};
  const seen = new Set<string>();
  for (const arg of args) {
    const [key, value] = arg.split("=");
    if (seen.has(key)) throw new BackfillError("DUPLICATE_ARGUMENT");
    seen.add(key);
    if (arg === "--confirm") options.confirm = true;
    else if (/^--delay-ms=[0-9]+$/.test(arg)) options.delayMs = Number(value);
    else if (/^--max-matches=[0-9]+$/.test(arg)) options.maxMatches = Number(value);
    else throw new BackfillError("UNKNOWN_ARGUMENT");
  }
  return options;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function main() {
  const options = optionsFrom(process.argv.slice(2));
  // Same environment loader as existing sync commands, before initializing repositories.
  loadEnvConfig(process.cwd(), true);
  const { createLineupBackfillReader } = await import("@/lib/db/repositories/lineup-backfill-repo");
  const reader = createLineupBackfillReader();
  const directory = path.join(process.cwd(), ".backfill");
  const checkpoint = path.join(directory, `lineups-${reader.project.slice(0, 16)}.json`);
  const lockPath = `${checkpoint}.lock`;
  let lock: Awaited<ReturnType<typeof open>> | undefined;
  if (options.confirm === true) {
    if (!process.env.SPORTMONKS_API_TOKEN?.trim()) throw new BackfillError("SPORTMONKS_TOKEN_REQUIRED");
    await mkdir(directory, { recursive: true });
    try { lock = await open(lockPath, "wx"); }
    catch { throw new BackfillError("CHECKPOINT_LOCKED_REVIEW_RUNNING_OR_INTERRUPTED_PROCESS"); }
  }
  let interrupted = false;
  const stop = () => { interrupted = true; };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    let journal: BackfillJournal;
    try { journal = readBackfillJournal(JSON.parse(await readFile(checkpoint, "utf8")), reader.project); }
    catch (error) {
      if (!isMissing(error)) throw new BackfillError("INVALID_OR_UNREADABLE_CHECKPOINT");
      journal = emptyBackfillJournal(reader.project);
    }
    const matches = await reader.readFinished();
    const existing = await reader.readPresence(matches.map(match => match.id));
    const plan = planLineupBackfill(matches, existing, journal);
    console.log(`mode=${options.confirm === true ? "CONFIRMED" : "DRY_RUN"}`);
    console.log(`competition=${BACKFILL_SCOPE.leagueId} season=${BACKFILL_SCOPE.seasonId} status=finished`);
    console.log(`finished=${matches.length} already_enriched=${existing.size} candidates=${plan.filter(entry => entry.action === "ENRICH").length}`);
    const result = await runLineupBackfill(plan, journal, {
      readMatch: reader.readMatch, hasEnrichment: reader.hasEnrichment,
      enrich: async (matchId, fixtureId) => {
        // Loaded ONLY in explicit confirmed mode. No alternate normalization/persistence path.
        const { enrichMatchFromSportmonks } = await import("@/lib/services/match-enrichment-service");
        return enrichMatchFromSportmonks(matchId, fixtureId);
      },
      saveJournal: async value => {
        await writeFile(`${checkpoint}.tmp`, JSON.stringify(value, null, 2), { mode: 0o600 });
        await rename(`${checkpoint}.tmp`, checkpoint);
      },
      sleep: async ms => { await delay(ms); }, now: () => new Date().toISOString(), log: console.log,
      shouldStop: () => interrupted,
    }, options);
    console.log(`attempted=${result.attempted} completed=${result.completed} failed=${result.failed} skipped=${result.skipped} stopped=${result.stopped}`);
    if (options.confirm !== true) console.log("Sportmonks requests=0 DB writes=0 checkpoint writes=0");
    if (result.failed > 0 || interrupted || (result.stopped && result.attempted < (options.maxMatches ?? Infinity))) process.exitCode = 1;
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    if (lock) { await lock.close(); await unlink(lockPath); }
  }
}

main().catch(error => {
  // Never print provider bodies, URLs, stack traces, secrets or arbitrary DB error messages.
  console.error(`[backfill] ${error instanceof BackfillError ? error.code : "FAILED_SAFE_DETAILS_SUPPRESSED"}`);
  process.exitCode = 1;
});
