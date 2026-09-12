import type { Match, Team, Player } from "@/types/db/tables";
import type { SoccerStandingsRow } from "@/types/core/stats";

export function buildSoccerMatchAnalysisPrompt(params: {
  match: Match;
  home: Team;
  away: Team;
  homePlayers: {
    player: Player;
    goals: number;
    assists: number;
    minutes: number;
    rating: number;
  }[];
  awayPlayers: {
    player: Player;
    goals: number;
    assists: number;
    minutes: number;
    rating: number;
  }[];
  recentHomeForm: ("W" | "D" | "L")[];
  recentAwayForm: ("W" | "D" | "L")[];
}): {
  system: string;
  user: string;
} {
  const {
    match,
    home,
    away,
    homePlayers,
    awayPlayers,
    recentHomeForm,
    recentAwayForm,
  } = params;

  const sys =
    "Eres un analista de datos deportivos especializado en fútbol. Tu tarea es producir un análisis TÁCTICO y OBJETIVO del partido basado ÚNICAMENTE en los datos crudos que te paso. Devuelve EXCLUSIVAMENTE JSON con estructura: { summary: string, keyInsights: string[], narrative: string }. No agregues texto fuera del JSON.";

  const hs = match.home_score ?? 0;
  const as = match.away_score ?? 0;
  const fmtPlayers = (
    arr: typeof homePlayers,
  ) =>
    arr
      .slice(0, 8)
      .map(
        (p) =>
          `- ${p.player.full_name} [${p.player.position}] ${p.minutes}min | G${p.goals} A${p.assists} rating=${p.rating.toFixed(2)}`,
      )
      .join("\n");

  const user = `=== ANÁLISIS DEL PARTIDO ===
Partido ID: ${match.id}
Fecha: ${match.match_date}
Resultado FINAL: ${home.name} ${hs} - ${as} ${away.name}
Estado: ${match.status}

FORMA RECIENTE (últimos 5):
${home.name}: ${recentHomeForm.join("")}
${away.name}: ${recentAwayForm.join("")}

JUGADORES DESTACADOS LOCAL (${home.name}):
${fmtPlayers(homePlayers)}

JUGADORES DESTACADOS VISITA (${away.name}):
${fmtPlayers(awayPlayers)}

DATOS ESPECÍFICOS DEL PARTIDO (sport_specific):
${JSON.stringify(match.sport_specific, null, 2)}

Genera tu análisis en JSON ahora.`;

  return { system: sys, user };
}

export function buildSoccerMatchPredictionPrompt(params: {
  match: {
    id: string;
    home_team_id: string;
    away_team_id: string;
    match_date: string;
    status: string;
  };
  home: Team;
  away: Team;
  standings: SoccerStandingsRow[];
  h2hLast5: Array<{
    date: string;
    homeName: string;
    awayName: string;
    hs: number;
    as: number;
  }>;
  last5Home: ("W" | "D" | "L")[];
  last5Away: ("W" | "D" | "L")[];
}): { system: string; user: string } {
  const sys =
    "Eres un pronosticador deportivo objetivo especializado en fútbol. Tu salida DEBE ser JSON estricto con keys: predictedHomeScore:number, predictedAwayScore:number, homeWinProbability:number (0-100), drawProbability:number (0-100), awayWinProbability:number (0-100), explanation:string. Las probabilidades deben sumar ~100. No agregues texto fuera del JSON.";
  const { match, home, away, standings, h2hLast5, last5Home, last5Away } = params;
  const hRow = standings.find((s) => s.teamId === home.id);
  const aRow = standings.find((s) => s.teamId === away.id);
  const fmtH2h = h2hLast5
    .map(
      (m) =>
        `- ${m.date}  ${m.homeName} ${m.hs}-${m.as} ${m.awayName}`,
    )
    .join("\n");

  const user = `=== PRONÓSTICO DE FÚTBOL ===
Partido ID: ${match.id} | Fecha: ${match.match_date}
LOCAL: ${home.name} (${home.short_name})
VISITA: ${away.name} (${away.short_name})

TABLA ACTUAL:
${home.name}: posición #${
    standings.findIndex((s) => s.teamId === home.id) + 1
  } | PJ=${hRow?.played ?? 0} PTS=${hRow?.points ?? 0} FORMA=${last5Home.join("")}
${away.name}: posición #${
    standings.findIndex((s) => s.teamId === away.id) + 1
  } | PJ=${aRow?.played ?? 0} PTS=${aRow?.points ?? 0} FORMA=${last5Away.join("")}

H2H ÚLTIMOS 5 ENTRE ELLOS:
${fmtH2h}

Retorna JSON con el pronóstico ahora.`;

  return { system: sys, user };
}

export function buildSoccerPlayerReportPrompt(params: {
  player: Player;
  team: Team;
  seasonAgg: {
    matchesPlayed: number;
    totalMinutes: number;
    goals: number;
    assists: number;
    yellowCards: number;
    redCards: number;
    avgPassAccuracyPct: number;
  };
  perMatch: Array<{
    date: string;
    opponent: string;
    minutes: number;
    goals: number;
    assists: number;
    rating: number;
  }>;
}): { system: string; user: string } {
  const sys =
    "Eres un ojeador/scout de fútbol profesional. Tu salida DEBE ser JSON estricto con keys: strengths:string[], weaknesses:string[], performanceSummary:string, outlook:string. Max 6 items por strengths/weaknesses. No agregues texto fuera del JSON.";
  const { player, team, seasonAgg, perMatch } = params;
  const last5 = perMatch
    .slice(0, 5)
    .map(
      (m) =>
        `- ${m.date} vs ${m.opponent}: ${m.minutes}min G${m.goals} A${m.assists} rt=${m.rating.toFixed(2)}`,
    )
    .join("\n");

  const user = `=== REPORTE DE JUGADOR ===
Jugador: ${player.full_name} (${player.short_name ?? "-"})
Posición: ${player.position} | Dorsal: ${player.jersey_number ?? "-"}
Nacionalidad: ${player.nationality ?? "N/A"}
Equipo actual: ${team.name} (${team.short_name})

ACUMULADO TEMPORADA:
PJ=${seasonAgg.matchesPlayed} | Minutos=${seasonAgg.totalMinutes} | Goles=${seasonAgg.goals} | Asistencias=${seasonAgg.assists}
Tarjetas: A=${seasonAgg.yellowCards} R=${seasonAgg.redCards} | Precisión pase avg=${seasonAgg.avgPassAccuracyPct.toFixed(1)}%

ÚLTIMOS 5 PARTIDOS:
${last5}

Devuelve el JSON de scouting ahora.`;

  return { system: sys, user };
}
