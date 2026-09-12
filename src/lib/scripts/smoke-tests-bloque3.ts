process.env.ENABLE_OFFLINE_MODE = "true";
process.env.NEXT_PUBLIC_SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.OPENAI_API_KEY = "";

import { ensureDbReady } from "@/lib/db/client";
import { runIngestionJob } from "@/lib/services/ingestion-service";
import {
  getTeamStandings,
  getPlayerSeasonRanking,
  getMatchWithStats,
  getPlayerCareerStats,
  getTeamSquadRanking,
} from "@/lib/services/statistics-service";
import { InMemoryStore } from "@/lib/db/in-memory-store";

const SPORT_ID = "soccer";
const LEAGUE1_ID = "demo-liga-1";
const SEASON1_ID = "season-2026-1";
const LEAGUE2_ID = "demo-liga-2";
const SEASON2_ID = "season-2026-2";
const INGESTION_LEAGUE_ID = "demo-ingestion-liga";
const INGESTION_SEASON_ID = "demo-ingestion-season";

let okAll = true;
function check(name: string, cond: boolean, detail?: string) {
  const ok = !!cond;
  if (!ok) okAll = false;
  console.log(`[${name}] ${ok ? "PASS ✅" : "FAIL ❌"} ${detail ?? ""}`);
  return ok;
}

async function main() {
  console.log("=".repeat(70));
  console.log("  SMOKE TESTS — Bloque 3 (ingestion + statistics services)");
  console.log("=".repeat(70));

  const db = await ensureDbReady();
  console.log("[DB] offline =", db.isOffline());

  // ====== PREP BLOQUE 3 ======
  // Asegurar que INGESTION_LEAGUE_ID exista (mock source no crea leagues/teams por si mismo,
  // sólo asume que los id vienen por parametro; upsertamos 2 leagues + seasons para mock).
  const now = new Date().toISOString();
  InMemoryStore.upsert("leagues", {
    id: INGESTION_LEAGUE_ID,
    sport_id: SPORT_ID,
    name: "Liga Ingestion Demo",
    country: "DemoLand",
    created_at: now,
    updated_at: now,
    sport_specific: {},
  });
  InMemoryStore.upsert("seasons", {
    id: INGESTION_SEASON_ID,
    league_id: INGESTION_LEAGUE_ID,
    name: "Temporada Ingestion 2026",
    start_date: "2026-02-01",
    end_date: "2026-12-31",
    is_current: true,
    created_at: now,
    updated_at: now,
    sport_specific: {},
  });
  void LEAGUE2_ID;
  void SEASON2_ID;

  // ====== PASO 3.1: runIngestionJob idempotente (liga/season propia para no contaminar AC-3) ======
  console.log("\n--- 3.1 runIngestionJob (1ª ejecución) ---");
  const r1 = await runIngestionJob(SPORT_ID, "mock", {
    leagueId: INGESTION_LEAGUE_ID,
    seasonId: INGESTION_SEASON_ID,
    limit: 5,
  });
  console.log(
    `ingesta r1: fetched=${r1.fetched} matches_in/upd=${r1.insertedMatches}/${r1.updatedMatches} teams=${r1.insertedTeams} players=${r1.insertedPlayers} stats=${r1.insertedStats} errors=${r1.errors.length}`,
  );
  check(
    "3.1a",
    r1.fetched === 5,
    `fetched=5, got ${r1.fetched}`,
  );
  check(
    "3.1b",
    r1.insertedMatches + r1.updatedMatches > 0,
    "al menos 1 match persistido",
  );
  check(
    "3.1c",
    r1.errors.length === 0,
    `sin errores, got ${r1.errors.length}`,
  );

  console.log("\n--- 3.1 runIngestionJob (2ª ejecución: IDEMPOTENCIA) ---");
  const r2 = await runIngestionJob(SPORT_ID, "mock", {
    leagueId: INGESTION_LEAGUE_ID,
    seasonId: INGESTION_SEASON_ID,
    limit: 5,
  });
  console.log(
    `ingesta r2: fetched=${r2.fetched} matches_in/upd=${r2.insertedMatches}/${r2.updatedMatches} errors=${r2.errors.length}`,
  );
  // Idempotencia: upsertMatchByExternalId debe usar id existente -> updatedMatches > 0
  check(
    "3.1d idempotencia",
    r2.updatedMatches >= r2.insertedMatches,
    `la mayoría deben ser UPDATES, got ins=${r2.insertedMatches} upd=${r2.updatedMatches}`,
  );
  check(
    "3.1e",
    r2.errors.length === 0,
    `sin errores, got ${r2.errors.length}`,
  );

  // ====== PASO 3.2: getTeamStandings ======
  console.log("\n--- 3.2a getTeamStandings ---");
  const standings = await getTeamStandings(SPORT_ID, LEAGUE1_ID, SEASON1_ID);
  console.log(
    `standings rows=${standings.length}, 1°=${standings[0]?.teamName} pts=${standings[0]?.points}`,
  );
  check(
    "3.2a",
    standings.length >= 5,
    `>=5 equipos (liga1 demo). Got ${standings.length}`,
  );
  check(
    "3.2b AC-3",
    !!standings[0] &&
      standings[0].teamId === "aguilas-fc" &&
      standings[0].points === 9 &&
      standings[0].won === 3,
    `1°=Águilas FC 9pts 3W. Got ${standings[0]?.teamName}(${standings[0]?.teamId}) pts=${standings[0]?.points} W=${standings[0]?.won}`,
  );

  // ====== PASO 3.2: getPlayerSeasonRanking ======
  console.log("\n--- 3.2b getPlayerSeasonRanking + getTeamSquadRanking ---");
  const ranking = await getPlayerSeasonRanking(
    SPORT_ID,
    LEAGUE1_ID,
    SEASON1_ID,
  );
  const squad = await getTeamSquadRanking(SPORT_ID, LEAGUE1_ID, SEASON1_ID);
  console.log(`player ranking len=${ranking.length}, squad len=${squad.length}`);
  check(
    "3.2c",
    ranking.length > 0,
    `ranking no vacío, got ${ranking.length}`,
  );
  check(
    "3.2d",
    squad.length === ranking.length && squad.every((s) => !!s.teamName),
    `squad len ${squad.length} == ranking len ${ranking.length} y todos con teamName`,
  );

  // ====== PASO 3.2: getMatchWithStats ======
  console.log("\n--- 3.2c getMatchWithStats ---");
  const matches = await import("@/lib/db/repositories/matches-repo").then(
    (m) => m.getMatchesByLeagueSeason(LEAGUE1_ID, SEASON1_ID),
  );
  const mid = matches.find((m) => m.status === "finished")?.id;
  if (mid) {
    const mws = await getMatchWithStats(SPORT_ID, mid);
    console.log(
      `match id=${mid} home=${mws?.home.players.length} away=${mws?.away.players.length}`,
    );
    check("3.2e", !!mws, "match + stats encontrado");
    check(
      "3.2f",
      !!mws && mws.home.teamId === mws.match.home_team_id,
      "home team coincide",
    );
  } else {
    check("3.2e", false, "no hay matches finished para getMatchWithStats");
  }

  // ====== PASO 3.2: getPlayerCareerStats ======
  console.log("\n--- 3.2d getPlayerCareerStats ---");
  const firstPlayer = ranking[0]?.playerId;
  if (firstPlayer) {
    const career = await getPlayerCareerStats(SPORT_ID, firstPlayer);
    console.log(
      `career player=${firstPlayer} matchesPlayed=${career.matchesPlayed} goals=${career.goals} assists=${career.assists}`,
    );
    check("3.2g", career.matchesPlayed >= 0, "retorna objeto career");
    check(
      "3.2h",
      typeof career.ratingAvg === "number",
      `ratingAvg numérico=${career.ratingAvg}`,
    );
  } else {
    check("3.2g", false, "sin jugadores para career");
  }

  console.log("-".repeat(70));
  console.log(
    okAll
      ? "RESULTADO FINAL BLOQUE 3: TODOS LOS TESTS PASARON ✅✅✅"
      : "RESULTADO FINAL BLOQUE 3: ALGUNOS TESTS FALLARON ❌",
  );
  console.log("=".repeat(70));
  if (!okAll) process.exit(1);
}

main().catch((e) => {
  console.error("ERROR en smoke tests bloque 3:", e);
  process.exit(1);
});
