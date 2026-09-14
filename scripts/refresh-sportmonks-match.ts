/**
 * Targeted match result refresh CLI.
 *
 * Usage:
 *   npm run refresh:sportmonks-match -- <internal-match-id>
 *
 * Example:
 *   npm run refresh:sportmonks-match -- m-soccer-sportmonks:match:19713931
 *
 * Refreshes ONLY the supplied match. Does NOT touch predictions.
 */
import { refreshMatchScore, ScoreRefreshError } from "@/lib/services/score-refresh-service";

const matchId = process.argv[2];

if (!matchId) {
  console.error("Usage: npm run refresh:sportmonks-match -- <internal-match-id>");
  console.error("Example: npm run refresh:sportmonks-match -- m-soccer-sportmonks:match:19713931");
  process.exit(1);
}

async function main(): Promise<void> {
  console.log(`[refresh] Refreshing match: ${matchId}`);
  try {
    const result = await refreshMatchScore(matchId);
    console.log(`[refresh] Match: ${result.matchId}`);
    console.log(`[refresh] Fixture ID: ${result.fixtureId}`);
    console.log(`[refresh] Changed: ${result.changed}`);
    console.log(`[refresh] Before: status=${result.before.status}, home=${result.before.homeScore}, away=${result.before.awayScore}`);
    console.log(`[refresh] After:  status=${result.after.status}, home=${result.after.homeScore}, away=${result.after.awayScore}`);
    if (result.changed) {
      console.log(`[refresh] ✅ Match updated successfully.`);
    } else {
      console.log(`[refresh] ℹ️ No changes detected.`);
    }
  } catch (err) {
    if (err instanceof ScoreRefreshError) {
      console.error(`[refresh] ❌ Error: ${err.message}`);
    } else {
      console.error(`[refresh] ❌ Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exit(1);
  }
}

main();
