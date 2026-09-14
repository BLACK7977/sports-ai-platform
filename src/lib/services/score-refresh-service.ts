import "server-only";
import { getMatchById, updateMatchResult, type MatchResultUpdate } from "@/lib/db/repositories/matches-repo";
import { SportmonksClient } from "@/sports/soccer/data-sources/sportmonks-client";
import { normalizeFixtureResult } from "@/sports/soccer/data-sources/sportmonks-normalize";
import type { Match, MatchStatus } from "@/types/db/tables";

const PROVIDER = "sportmonks";

export type RefreshResult = {
  matchId: string;
  before: { status: MatchStatus; homeScore: number | null; awayScore: number | null };
  after: { status: MatchStatus; homeScore: number | null; awayScore: number | null };
  changed: boolean;
  fixtureId: number;
};

export class ScoreRefreshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScoreRefreshError";
  }
}

/**
 * Extract Sportmonks numeric fixture ID from an internal match row.
 * External IDs follow the pattern "sportmonks:match:<numericId>".
 * Returns null if the external_id is missing, malformed, or not a safe positive integer.
 */
function extractSportmonksFixtureId(match: Match): number | null {
  const extId = match.external_id ?? "";
  const prefix = `${PROVIDER}:match:`;
  if (!extId.startsWith(prefix)) return null;
  const numericPart = extId.slice(prefix.length);
  if (numericPart.length === 0) return null;
  const parsed = Number(numericPart);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

/**
 * Validate that scores are non-negative safe integers.
 * Throws ScoreRefreshError if validation fails.
 */
function validateScores(homeScore: number, awayScore: number, fixtureId: number): void {
  if (!Number.isSafeInteger(homeScore) || homeScore < 0) {
    throw new ScoreRefreshError(`Invalid home_score from fixture ${fixtureId}: ${homeScore}. Must be a non-negative safe integer.`);
  }
  if (!Number.isSafeInteger(awayScore) || awayScore < 0) {
    throw new ScoreRefreshError(`Invalid away_score from fixture ${fixtureId}: ${awayScore}. Must be a non-negative safe integer.`);
  }
}

export type RefreshMatchScoreDeps = {
  getMatchById?: typeof getMatchById;
  updateMatchResult?: (row: MatchResultUpdate) => Promise<Match | null>;
  createClient?: () => SportmonksClient;
};

/**
 * Refresh the status and scores of a single match from Sportmonks.
 *
 * - Only updates mutable fields: status, home_score, away_score, last_synced_at, sport_specific.source.last_synced_at
 * - Never modifies predictions or prediction_evaluations
 * - Never invents scores: if provider returns invalid data, throws without writing
 * - One API request per call (no retry loop on 429)
 * - If sporting state/scores are unchanged, skips DB write and returns changed=false
 * - Explicitly persists null for home_score/away_score when provider reports non-finished
 *   status, preventing stale scores from lingering in the DB
 */
export async function refreshMatchScore(
  internalMatchId: string,
  deps: RefreshMatchScoreDeps = {},
): Promise<RefreshResult> {
  const doGetMatchById = deps.getMatchById ?? getMatchById;
  const doUpdateMatchResult = deps.updateMatchResult ?? updateMatchResult;
  const doCreateClient = deps.createClient ?? (() => new SportmonksClient());

  const match = await doGetMatchById(internalMatchId);
  if (!match) {
    throw new ScoreRefreshError(`Match not found: ${internalMatchId}`);
  }
  if (match.provider !== PROVIDER) {
    throw new ScoreRefreshError(`Match ${internalMatchId} provider is "${match.provider ?? "null"}", not "${PROVIDER}". Only Sportmonks matches can be refreshed.`);
  }
  const fixtureId = extractSportmonksFixtureId(match);
  if (fixtureId === null) {
    throw new ScoreRefreshError(`Match ${internalMatchId} has invalid Sportmonks external_id: "${match.external_id ?? "null"}"`);
  }

  const before = { status: match.status, homeScore: match.home_score ?? null, awayScore: match.away_score ?? null };

  const client = doCreateClient();
  let raw;
  try {
    raw = await client.getFixtureById(fixtureId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("429") || msg.includes("rate limit")) {
      throw new ScoreRefreshError(`Sportmonks rate limit hit for fixture ${fixtureId}. Try again later.`);
    }
    throw new ScoreRefreshError(`Sportmonks API error for fixture ${fixtureId}: ${msg}`);
  }

  const result = normalizeFixtureResult(raw);

  // Validate scores before any DB write
  if (result.status === "finished") {
    if (result.homeScore === null || result.awayScore === null) {
      throw new ScoreRefreshError(`Fixture ${fixtureId} is finished but scores are null. Refusing to write.`);
    }
    validateScores(result.homeScore, result.awayScore, fixtureId);
  }

  // No-change semantics: if status and scores are identical, skip DB write entirely
  const afterHomeScore = result.homeScore;
  const afterAwayScore = result.awayScore;
  const changed = before.status !== result.status || before.homeScore !== afterHomeScore || before.awayScore !== afterAwayScore;

  if (!changed) {
    return {
      matchId: match.id,
      before,
      after: { status: result.status, homeScore: afterHomeScore, awayScore: afterAwayScore },
      changed: false,
      fixtureId,
    };
  }

  const now = new Date().toISOString();

  const existingSource = (match.sport_specific as Record<string, unknown>)?.source as Record<string, unknown> | undefined;
  const updatedSportSpecific: Record<string, unknown> = {
    ...(match.sport_specific as Record<string, unknown> ?? {}),
    source: {
      ...(existingSource ?? {}),
      provider: PROVIDER,
      external_id: fixtureId,
      last_synced_at: now,
    },
  };

  const update: MatchResultUpdate = {
    id: match.id,
    sport_id: match.sport_id,
    league_id: match.league_id,
    season_id: match.season_id,
    home_team_id: match.home_team_id,
    away_team_id: match.away_team_id,
    match_date: match.match_date,
    status: result.status,
    home_score: afterHomeScore,
    away_score: afterAwayScore,
    external_id: match.external_id,
    provider: match.provider,
    last_synced_at: now,
    sport_specific: updatedSportSpecific,
  };

  const saved = await doUpdateMatchResult(update);
  if (!saved) {
    throw new ScoreRefreshError(`DB upsert failed for match ${match.id}. Persistence unsuccessful.`);
  }

  return {
    matchId: match.id,
    before,
    after: { status: result.status, homeScore: afterHomeScore, awayScore: afterAwayScore },
    changed: true,
    fixtureId,
  };
}
