# Lineup coverage backfill — Phase 1

## Current scope and review gate

Only soccer / `sportmonks-denmark-superliga` /
`sportmonks-denmark-superliga-2026-2027` / `finished`.
Fixture `19713931` is explicitly protected even if its enrichment is later absent.
Scheduled fixtures, predictions, evaluations, odds, competition rules and auth are outside this command.

Preview (default, SELECT only):

```sh
npm run backfill:lineups
```

**Do not execute the following until the preview has been reviewed and execution authorized:**

```sh
npm run backfill:lineups -- --confirm --delay-ms=2000 --max-matches=3
```

`--max-matches` limits provider attempts, including failures. Without it, all eligible
matches are attempted. Delay is configurable from 1000 to 60000 ms, default 2000 ms,
between awaited attempts (not parallel provider calls). No environment flag enables writes.
HTTP 429/401/403 stops the batch; no automatic provider retries. Other per-match
enrichment failures are isolated. Read/checkpoint errors abort conservatively.
The command calls the existing `enrichMatchFromSportmonks()` once per attempt;
there is no second normalization/persistence implementation.

## Windows / PowerShell note

In this Windows / PowerShell environment `npm run backfill:lineups -- --confirm ...`
may fail to forward CLI arguments to the script and can therefore fall back safely
to DRY RUN (zero requests, zero writes). The verified execution form here is:

```sh
npx tsx --conditions=react-server src/lib/scripts/backfill-lineups.ts --confirm --max-matches=<N>
```

## Resumption and safety

- Presence in **any** of metadata/statistics/events/lineups means pre-existing
  enrichment and is skipped. Presence is not a claim of complete lineup coverage.
- SELECTs are paginated, including enrichment presence beyond PostgREST's row limit.
  Re-check match scope, status, provider/external ID and presence before each call.
- Explicit Sportmonks external IDs are required; the fixture is never inferred
  from digits in a canonical/internal match ID. Canonical IDs from DB are retained.
- Only confirmed execution creates a private local `.backfill/` checkpoint,
  keyed by project hash and fixed competition/season scope. This directory is ignored by Git.
- Persist `in_progress` before the request and `completed` only after the service
  returns. A failure is `failed`, never success. Only journal-owned interrupted/failed
  attempts may resume/reconcile their partial data. Pre-existing partial enrichment
  without a journal stays skipped and requires a separately reviewed repair.
- A completed checkpoint prevents repeat requests even when a valid provider
  response contains no lineups. It means pipeline completion, **not** lineup availability.
- An exclusive local lock prevents concurrent runs of this command from this checkout.
  Ctrl+C stops between attempts, preserving the in-flight attempt's result.
  After a hard crash, verify the old process is gone before manually removing **only**
  the corresponding `.lock`; retain its `.json` checkpoint. Never clear locks blindly.
- Local locks cannot coordinate another computer or a different ingestion command.
  Run a single ingestion operator; distributed locking is not introduced in this phase.
- Persistence is not transactional across enrichment tables. A partial failure is
  recorded and idempotently reconciled on resume, not described as a rollback.
- Dry-run does not create a lock/checkpoint, instantiate SportmonksClient or call
  `getEnrichment()` (which currently instantiates the provider client even for reads).
- Only fixed error codes and safe identifiers/counts are printed; no raw API/DB
  errors, credential values or provider URLs are logged by the runner.

## Observed dry run — 2026-09-15

Supabase SELECT results: **44 finished, 1 already enriched, 43 candidates**.
Protected skip: **19713931**. Provider requests: **0**. DB writes: **0**.
The 88 scheduled fixtures were not selected. This snapshot is not hardcoded in the runner.

Exact candidate fixtures, in execution order:

```text
19714016 19714015 19714014 19714011 19714012 19714013 19714010
19714008 19714009 19714006 19714004 19714002 19713964 19713962
19713960 19713958 19714000 19713996 19713998 19713994 19713992
19713990 19713986 19713984 19713988 19713982 19713980 19713978
19713976 19713972 19713974 19713970 19713968 19713966 19713956
19713954 19713952 19713950 19713948 19713946 19713944 19713942
19713940
```

## Proposed coverage state — design only, no migration

Future per-match/provider/category observation keyed by `(match_id, provider, category)`:

| State | Meaning |
| --- | --- |
| NOT_CHECKED | No provider observation has been attempted. |
| AVAILABLE | Valid nonempty official lineup snapshot persisted successfully. |
| NOT_AVAILABLE | Successful authoritative response explicitly contained a valid empty lineup array. This is a time-bound observation, not permanent unavailability. |
| FAILED | Latest transport/access/validation/persistence attempt failed; keep previous valid data and successful state separately. |

Proposed fields: `enrichment_last_attempt_at`, `lineups_checked_at` (valid authoritative
observation), `lineups_available_at` (nonempty persisted observation),
`last_success_state`, `last_success_at`, sanitized `last_error_code`, optional `next_retry_at`.
Missing includes, malformed payloads, denied access and transport failures must not
be interpreted as `NOT_AVAILABLE`. A provider empty response followed by failed
persistence is still a failed attempt, not a successful availability transition.
Current row counts cannot distinguish these states. Do not backfill them by guessing.

## Proposed probable lineups — design only

- Official `match_lineups` remains exclusively structured provider truth (`SPORTMONKS`).
- Separate immutable probable-lineup runs: canonical match/team IDs,
  `source=SPORTS_AI_MODEL`, `model_version`, `generated_at`, `input_cutoff_at`,
  predicted formation and optional calibrated `confidence`.
- Separate predicted-player rows per run: canonical player ID, predicted starter,
  model-produced slot, optional player confidence. Unique run/player identity.
- Never persist a probable lineup into official `match_lineups`, even temporarily.
- UI priority per team: available official lineup, then explicitly labeled Sports AI
  probable lineup, otherwise **Alineación aún no disponible**. Do not silently fill
  a partial official lineup with model guesses.
- Separate future lineup evaluations reference the probable run and the official
  snapshot/version. Compare starter sets (`correct XI count`, e.g. 9/11), formation
  agreement, and sample-weighted historical accuracy by `model_version`.
  Evaluate only sufficiently complete official truth; missing official XI is
  unevaluated, not incorrect. Preserve original pre-kickoff input cutoff to avoid leakage.
- This is not an extension of prediction #2/evaluation #1; no model or evaluation
  writes are introduced here. No new schema or migration has been created.
