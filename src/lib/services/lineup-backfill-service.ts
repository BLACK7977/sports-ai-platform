import "server-only";
import { z } from "zod";
import { parseEntityId } from "@/lib/config/validation";

export const BACKFILL_SCOPE = {
  leagueId: "sportmonks-denmark-superliga",
  seasonId: "sportmonks-denmark-superliga-2026-2027",
} as const;
export const BACKFILL_SCOPE_KEY = `${BACKFILL_SCOPE.leagueId}/${BACKFILL_SCOPE.seasonId}/finished`;
const PROTECTED_FIXTURE = 19713931;

export const backfillMatchSchema = z.object({
  id: z.string(), sport_id: z.string(), league_id: z.string(), season_id: z.string(),
  status: z.string(), provider: z.string().nullable(), external_id: z.string().nullable(),
  match_date: z.string(),
});
export type BackfillMatch = z.infer<typeof backfillMatchSchema>;
const attemptSchema = z.object({
  fixtureId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  state: z.enum(["in_progress", "completed", "failed"]),
  attemptedAt: z.string().datetime(), finishedAt: z.string().datetime().optional(),
  errorCode: z.enum(["RATE_LIMIT", "ACCESS_DENIED", "ENRICHMENT_FAILED"]).optional(),
}).strict();
const journalSchema = z.object({
  version: z.literal(1), scope: z.literal(BACKFILL_SCOPE_KEY), project: z.string(),
  attempts: z.record(z.string(), attemptSchema),
}).strict();
export type BackfillJournal = z.infer<typeof journalSchema>;

export class BackfillError extends Error {
  constructor(public readonly code: string) { super(code); }
}

export function readBackfillJournal(value: unknown, project: string): BackfillJournal {
  const parsed = journalSchema.safeParse(value);
  if (!parsed.success || parsed.data.project !== project ||
      Object.keys(parsed.data.attempts).some(id => !parseEntityId(id))) {
    throw new BackfillError("INVALID_CHECKPOINT");
  }
  return parsed.data;
}

export function emptyBackfillJournal(project: string): BackfillJournal {
  return { version: 1, scope: BACKFILL_SCOPE_KEY, project, attempts: {} };
}

export function fixtureIdOf(match: BackfillMatch): number | null {
  const externalId = match.external_id ?? "";
  const parsed = /^sportmonks:match:([1-9][0-9]*)$/.exec(externalId);
  const fixture = parsed && parsed[0] === externalId ? Number(parsed[1]) : NaN;
  return Number.isSafeInteger(fixture) && fixture > 0 ? fixture : null;
}

export type BackfillEntry = {
  match: BackfillMatch; fixtureId: number | null; existing: boolean;
  action: "ENRICH" | "SKIP" | "FAIL"; reason: string;
};

/** Presence means any persisted category, NOT proof of provider lineup availability. */
export function planLineupBackfill(
  matches: BackfillMatch[], existing: ReadonlySet<string>, journal: BackfillJournal,
): BackfillEntry[] {
  const seen = new Set<string>();
  const fixtureCounts = new Map<number, number>();
  for (const match of matches) {
    if (seen.has(match.id)) throw new BackfillError("DUPLICATE_MATCH_ID");
    seen.add(match.id);
    const fixture = fixtureIdOf(match);
    if (fixture !== null) fixtureCounts.set(fixture, (fixtureCounts.get(fixture) ?? 0) + 1);
  }
  return [...matches].sort((a, b) => a.match_date.localeCompare(b.match_date) || a.id.localeCompare(b.id)).map(match => {
    const fixtureId = fixtureIdOf(match);
    const base = { match, fixtureId, existing: existing.has(match.id) };
    if (match.sport_id !== "soccer" || match.league_id !== BACKFILL_SCOPE.leagueId ||
        match.season_id !== BACKFILL_SCOPE.seasonId || match.status !== "finished") {
      return { ...base, action: "SKIP", reason: "OUT_OF_SCOPE" };
    }
    if (fixtureId === PROTECTED_FIXTURE || match.id === "m-soccer-sportmonks:match:19713931") {
      return { ...base, action: "SKIP", reason: "PROTECTED_EXISTING_FIXTURE" };
    }
    if (match.provider !== "sportmonks" || !parseEntityId(match.id) || fixtureId === null ||
        fixtureCounts.get(fixtureId) !== 1) {
      return { ...base, action: "FAIL", reason: "INVALID_PROVIDER_OR_ID" };
    }
    const attempt = journal.attempts[match.id];
    if (attempt && attempt.fixtureId !== fixtureId) {
      return { ...base, action: "FAIL", reason: "CHECKPOINT_ID_MISMATCH" };
    }
    if (attempt?.state === "completed") return { ...base, action: "SKIP", reason: "CHECKPOINT_COMPLETED" };
    // Only our own interrupted attempts may reconcile partial rows. Never adopt pre-existing data.
    if (attempt) return { ...base, action: "ENRICH", reason: "RESUME_INTERRUPTED_ATTEMPT" };
    if (base.existing) return { ...base, action: "SKIP", reason: "EXISTING_ENRICHMENT" };
    return { ...base, action: "ENRICH", reason: "NOT_CHECKED" };
  });
}

export type BackfillDeps = {
  readMatch(id: string): Promise<BackfillMatch | null>;
  hasEnrichment(id: string): Promise<boolean>;
  enrich(matchId: string, fixtureId: number): Promise<unknown>;
  saveJournal(journal: BackfillJournal): Promise<void>;
  sleep(ms: number): Promise<void>;
  now(): string;
  log(line: string): void;
  shouldStop?(): boolean;
};
export type BackfillOptions = { confirm?: boolean; delayMs?: number; maxMatches?: number };

export function backfillErrorCode(error: unknown): "RATE_LIMIT" | "ACCESS_DENIED" | "ENRICHMENT_FAILED" {
  const message = error instanceof Error ? error.message : "";
  if (/\b429\b|rate.?limit/i.test(message)) return "RATE_LIMIT";
  if (/\b40[13]\b/.test(message)) return "ACCESS_DENIED";
  return "ENRICHMENT_FAILED";
}

/** No provider, persistence, checkpoint mutation or sleeps unless confirm is explicitly true. */
export async function runLineupBackfill(
  plan: BackfillEntry[], journal: BackfillJournal, deps: BackfillDeps, options: BackfillOptions = {},
) {
  const delayMs = options.delayMs ?? 2000;
  const maxMatches = options.maxMatches ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(delayMs) || delayMs < 1000 || delayMs > 60000 ||
      !Number.isSafeInteger(maxMatches) || maxMatches < 1) throw new BackfillError("INVALID_OPTIONS");
  const candidates = plan.filter(entry => entry.action === "ENRICH");
  const result = { candidates: candidates.length, attempted: 0, completed: 0, failed: 0, skipped: 0, stopped: false };
  for (const entry of plan.filter(entry => entry.action !== "ENRICH")) {
    deps.log(`fixture=${entry.fixtureId ?? "invalid"} ${entry.action} ${entry.reason}`);
    if (entry.action === "FAIL") result.failed++;
    else result.skipped++;
  }
  if (options.confirm !== true) {
    candidates.forEach((entry, i) => deps.log(`[${i + 1}/${candidates.length}] fixture=${entry.fixtureId} ENRICH DRY_RUN ${entry.reason}`));
    return result;
  }
  for (const [i, entry] of candidates.entries()) {
    if (result.attempted >= maxMatches || deps.shouldStop?.()) { result.stopped = true; break; }
    if (result.attempted > 0) await deps.sleep(delayMs);
    if (deps.shouldStop?.()) { result.stopped = true; break; }
    const prefix = `[${i + 1}/${candidates.length}] fixture=${entry.fixtureId}`;
    // Fail closed on read failures; re-check scope and pre-existing data immediately before each attempt.
    const current = await deps.readMatch(entry.match.id);
    const existing = current && await deps.hasEnrichment(current.id);
    const refreshed = current && planLineupBackfill([current], new Set(existing ? [current.id] : []), journal)[0];
    if (!refreshed || current?.id !== entry.match.id || refreshed.action !== "ENRICH" || refreshed.fixtureId !== entry.fixtureId || entry.fixtureId === null) {
      result.skipped++;
      deps.log(`${prefix} SKIP STATE_CHANGED`);
      continue;
    }
    journal.attempts[entry.match.id] = { fixtureId: entry.fixtureId, state: "in_progress", attemptedAt: deps.now() };
    // Checkpoint failure aborts BEFORE provider request; a failed completion checkpoint never reports success.
    await deps.saveJournal(journal);
    result.attempted++;
    let failure: ReturnType<typeof backfillErrorCode> | undefined;
    try { await deps.enrich(entry.match.id, entry.fixtureId); }
    catch (error) { failure = backfillErrorCode(error); }
    journal.attempts[entry.match.id] = {
      ...journal.attempts[entry.match.id], state: failure ? "failed" : "completed",
      finishedAt: deps.now(), ...(failure ? { errorCode: failure } : {}),
    };
    await deps.saveJournal(journal);
    if (failure) {
      result.failed++;
      deps.log(`${prefix} FAIL ${failure}`);
      if (failure === "RATE_LIMIT" || failure === "ACCESS_DENIED") { result.stopped = true; break; }
    } else {
      result.completed++;
      deps.log(`${prefix} ENRICH COMPLETED`);
    }
  }
  return result;
}
