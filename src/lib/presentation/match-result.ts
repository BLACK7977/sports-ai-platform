import type { Match } from "@/types/db/tables";

export type ValidFinishedResult = { home: number; away: number };

/** A real 0-0 is valid; a missing, partial or malformed score is not a result. */
export function validFinishedResult(
  match: Pick<Match, "status" | "home_score" | "away_score">,
): ValidFinishedResult | null {
  if (match.status !== "finished") return null;
  const home = match.home_score;
  const away = match.away_score;
  if (!Number.isSafeInteger(home) || !Number.isSafeInteger(away) ||
      home === null || home === undefined || away === null || away === undefined ||
      home < 0 || away < 0) return null;
  return { home, away };
}
