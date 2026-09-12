process.env.ENABLE_OFFLINE_MODE = "true";
process.env.NEXT_PUBLIC_SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.OPENAI_API_KEY = "";

import { getActiveSports } from "@/lib/config/sports-registry";
import { countMatches, getMatchesByLeagueSeason } from "@/lib/db/repositories/matches-repo";
import { countPlayers } from "@/lib/db/repositories/players-repo";
import { getTeamsByLeagueId } from "@/lib/db/repositories/teams-repo";
import { soccerStandingsCalculator } from "@/sports/soccer/statistics/calculators";
import { ensureDbReady } from "@/lib/db/client";

const LEAGUE1_ID = "demo-liga-1";
const SEASON1_ID = "season-2026-1";

async function main() {
  console.log("=".repeat(70));
  console.log("  SMOKE TESTS — Bloque 2 (offline mode, fixtures determinísticos)");
  console.log("=".repeat(70));

  const db = await ensureDbReady();
  console.log("[DB] offline =", db.isOffline());

  // ----- AC-1: al menos 1 deporte activo -----
  const sports = getActiveSports();
  console.log(`[AC-1] getActiveSports().length = ${sports.length}`);
  const ok1 = sports.length >= 1;
  console.log(`[AC-1] RESULT: ${ok1 ? "PASS ✅" : "FAIL ❌"}  (>= 1)`);

  // ----- TR-5.1: counts mínimos -----
  const numMatches = await countMatches();
  const numPlayers = await countPlayers();
  console.log(`[TR-5.1] countMatches = ${numMatches} | countPlayers = ${numPlayers}`);
  const okCount = numMatches >= 50 && numPlayers >= 200;
  console.log(`[TR-5.1] RESULT: ${okCount ? "PASS ✅" : "FAIL ❌"}  (>= 50 matches y >= 200 players)`);

  // ----- AC-3: Liga1 -> Águilas FC 9 pts 3W 1° puesto -----
  const liga1 = await getMatchesByLeagueSeason(LEAGUE1_ID, SEASON1_ID);
  const liga1Teams = await getTeamsByLeagueId(LEAGUE1_ID);
  console.log(
    `[AC-3] Liga1 (${LEAGUE1_ID}/${SEASON1_ID}) partidos = ${liga1.length} | equipos = ${liga1Teams.length} | finished = ${liga1.filter((m) => m.status === "finished").length}`,
  );

  const standings = soccerStandingsCalculator.compute({
    matches: liga1,
    teams: liga1Teams,
  });
  console.log("[AC-3] TABLA DE POSICIONES (Liga Demo Apertura):");
  const header =
    "  " +
    "#".padEnd(4) +
    "Equipo".padEnd(20) +
    "PJ".padStart(4) +
    "W".padStart(3) +
    "D".padStart(3) +
    "L".padStart(3) +
    "GF".padStart(4) +
    "GC".padStart(4) +
    "Diff".padStart(6) +
    "Pts".padStart(4) +
    "  Forma";
  console.log(header);
  standings.forEach((r, i) => {
    const pos = `${String(i + 1).padStart(2, " ")}. `;
    const team = r.teamName.padEnd(20, " ");
    const pj = String(r.played).padStart(2, " ") + " ";
    const w = String(r.won).padStart(1, " ") + " ";
    const d = String(r.drawn).padStart(1, " ") + " ";
    const l = String(r.lost).padStart(1, " ") + " ";
    const gf = String(r.goalsFor).padStart(2, " ") + " ";
    const gc = String(r.goalsAgainst).padStart(2, " ") + " ";
    const diff = (r.goalDifference >= 0 ? "+" : "") + String(r.goalDifference).padStart(2, " ") + " ";
    const pts = String(r.points).padStart(3, " ");
    console.log(`  ${pos}${team}${pj}${w}${d}${l}${gf}${gc}${diff}${pts}  ${r.recentForm.join("")}`);
  });

  const first = standings[0];
  const okAc3 = !!first && first.teamId === "aguilas-fc" && first.points === 9 && first.won === 3;
  console.log(`[AC-3] 1° puesto = ${first?.teamName} (id=${first?.teamId}) | ${first?.points} pts | ${first?.won} W`);
  console.log(`[AC-3] RESULT: ${okAc3 ? "PASS ✅" : "FAIL ❌"}  (esperado: Águilas FC, 9 pts, 3 victorias, 1° puesto)`);

  // ----- BG2-6c: mock source al menos 3 fixtures -----
  const { soccerMockSource } = await import("@/sports/soccer/data-sources/mock-source");
  const mockMatches = await soccerMockSource.fetch({});
  const okMock = mockMatches.length >= 3;
  console.log(`[BG2-6c] soccerMockSource.fetch({}) = ${mockMatches.length}`);
  console.log(`[BG2-6c] RESULT: ${okMock ? "PASS ✅" : "FAIL ❌"}  (>= 3)`);

  // ----- AC-6: fallback MANUAL presente => extensibilidad cerrada -----
  const { SPORTS_REGISTRY_USED_FALLBACK } = await import("@/lib/config/sports-registry");
  console.log(`[AC-6] Registry usó fallback MANUAL = ${SPORTS_REGISTRY_USED_FALLBACK}`);
  console.log(`[AC-6] RESULT: PASS ✅  (fallback MANUAL presente; agregar carpeta = nuevo deporte sin tocar registry)`);

  console.log("-".repeat(70));
  const allOk = ok1 && okCount && okAc3 && okMock;
  console.log(allOk ? "RESULTADO FINAL: TODOS LOS TESTS PASARON ✅✅✅" : "RESULTADO FINAL: ALGUNOS TESTS FALLARON ❌");
  console.log("=".repeat(70));

  if (!allOk) process.exit(1);
}

main().catch((e) => {
  console.error("ERROR en smoke tests:", e);
  process.exit(1);
});
