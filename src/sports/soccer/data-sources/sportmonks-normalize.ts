import type { MatchStatus } from "@/types/db/tables";
import type { SportmonksFixture } from "./sportmonks-client";

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`[sportmonks] falta ${label}.`);
  return value;
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`[sportmonks] falta ${label}.`);
  return value;
}

/**
 * Map Sportmonks fixture state to our internal MatchStatus.
 * Shared between ingestion and score refresh.
 */
export function mapSportmonksState(raw: unknown): MatchStatus {
  const value = typeof raw === "object" && raw !== null ? (raw as { short_name?: unknown; name?: unknown }).short_name ?? (raw as { name?: unknown }).name : raw;
  const code = requiredString(value, "fixture.state").toUpperCase();
  if (["NS", "TBD", "SCHEDULED"].includes(code)) return "scheduled";
  if (["FT", "AET", "PEN", "FINISHED"].includes(code)) return "finished";
  if (["1H", "HT", "2H", "ET", "BT", "LIVE", "INPLAY"].includes(code)) return "in_progress";
  if (["PST", "POSTPONED"].includes(code)) return "postponed";
  if (["CANC", "CANCL", "CANCELLED"].includes(code)) return "cancelled";
  throw new Error(`[sportmonks] estado de fixture no soportado: ${code}.`);
}

/**
 * Extract current (home, away) scores from Sportmonks fixture scores array.
 * Returns null scores for non-finished fixtures.
 */
export function extractCurrentScores(scores: unknown): { homeScore: number | null; awayScore: number | null } {
  if (!Array.isArray(scores)) return { homeScore: null, awayScore: null };
  const current = scores.filter((score) => (score as { description?: unknown }).description === "CURRENT");
  const homeEntry = current.find((score) => (score as { score?: { participant?: unknown } }).score?.participant === "home") as { score?: { goals?: unknown } } | undefined;
  const awayEntry = current.find((score) => (score as { score?: { participant?: unknown } }).score?.participant === "away") as { score?: { goals?: unknown } } | undefined;
  const homeGoals = homeEntry?.score?.goals;
  const awayGoals = awayEntry?.score?.goals;
  return {
    homeScore: typeof homeGoals === "number" && Number.isFinite(homeGoals) ? homeGoals : null,
    awayScore: typeof awayGoals === "number" && Number.isFinite(awayGoals) ? awayGoals : null,
  };
}

export type SportmonksFixtureResult = {
  id: number;
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  stateRaw: string;
};

/**
 * Normalize a raw Sportmonks fixture response into a minimal result
 * suitable for score/status refresh. Does NOT touch teams or players.
 */
export function normalizeFixtureResult(raw: SportmonksFixture): SportmonksFixtureResult {
  const state = raw.state;
  const status = mapSportmonksState(state);
  const stateCode = typeof state === "object" && state !== null
    ? String((state as { short_name?: unknown; name?: unknown }).short_name ?? (state as { name?: unknown }).name ?? "unknown")
    : String(state ?? "unknown");
  const result: SportmonksFixtureResult = {
    id: requiredNumber(raw.id, "fixture.id"),
    status,
    homeScore: null,
    awayScore: null,
    stateRaw: stateCode,
  };
  if (status === "finished") {
    const { homeScore, awayScore } = extractCurrentScores(raw.scores);
    result.homeScore = requiredNumber(homeScore, "fixture.homeScore");
    result.awayScore = requiredNumber(awayScore, "fixture.awayScore");
  }
  return result;
}
