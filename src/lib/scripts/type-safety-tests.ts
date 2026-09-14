/**
 * Compile-time contract checks for the production DbClient boundary.
 *
 * These calls are intentionally contained in an uninvoked function: TypeScript
 * verifies the real interface without constructing a client or touching a DB.
 * Run with: npx tsc --noEmit
 */

import type { DbClient } from "@/lib/db/supabase-wrapper";
import type {
  MatchEventInsert,
  MatchLineupInsert,
  MatchInsert,
  MatchStatisticInsert,
  TeamInsert,
} from "@/types/db/tables";

function verifyProductionDbClientUniqueKeys(
  db: DbClient,
  team: TeamInsert,
  match: MatchInsert,
  event: MatchEventInsert,
  statistic: MatchStatisticInsert,
  lineup: MatchLineupInsert,
): void {
  // Valid production-boundary calls must compile.
  void db.upsert("teams", team, "id");
  void db.bulkUpsert("match_events", [event], "id");

  // @ts-expect-error "not_a_real_column" is not a teams key.
  void db.upsert("teams", team, "not_a_real_column");

  // @ts-expect-error "invalid" is not a matches key.
  void db.upsert("matches", match, "invalid");

  // @ts-expect-error "fake_key" is not a match_events key.
  void db.bulkUpsert("match_events", [event], "fake_key");

  // @ts-expect-error "bogus" is not a match_lineups key.
  void db.bulkUpsert("match_lineups", [lineup], "bogus");

  // Keep representative production insert types in this contract check.
  void statistic;
}

void verifyProductionDbClientUniqueKeys;
