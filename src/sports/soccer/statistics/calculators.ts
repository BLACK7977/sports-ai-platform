import type { StatCalculator } from "@/types/core/data-source";
import type { Match, Team } from "@/types/db/tables";
import { soccerConfig } from "../config";
import type { SoccerStandingsRow, SoccerPlayerSeasonAggregate } from "../types";

export interface StandingsInput {
  matches: Match[];
  teams: Team[];
}

export interface PlayerAggregateInput {
  matches: Match[];
  playerStats: Array<{
    match_id: string;
    player_id: string;
    team_id: string;
    full_name: string;
    position: string;
    minutes_played: number;
    sport_specific: Record<string, unknown>;
  }>;
}

export const soccerStandingsCalculator: StatCalculator<
  StandingsInput,
  SoccerStandingsRow[]
> = {
  id: "soccer-standings",
  name: "Tabla de posiciones de Fútbol (3 pts por victoria)",
  compute(input) {
    void input;
    const rows = new Map<string, SoccerStandingsRow>();

    for (const t of input.teams) {
      rows.set(t.id, {
        teamId: t.id,
        teamName: t.name,
        shortName: t.short_name,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
        recentForm: [],
      });
    }

    const sortedMatches = [...input.matches].sort(
      (a, b) => (a.match_date < b.match_date ? -1 : 1),
    );

    for (const m of sortedMatches) {
      if (m.status !== "finished") continue;
      const hs = m.home_score ?? 0;
      const as = m.away_score ?? 0;
      const home = rows.get(m.home_team_id);
      const away = rows.get(m.away_team_id);
      if (!home || !away) continue;

      home.played++;
      away.played++;
      home.goalsFor += hs;
      home.goalsAgainst += as;
      away.goalsFor += as;
      away.goalsAgainst += hs;

      let homeRes: "W" | "D" | "L" = "D";
      let awayRes: "W" | "D" | "L" = "D";
      if (hs > as) {
        home.won++;
        away.lost++;
        home.points += soccerConfig.pointsPerWin;
        away.points += soccerConfig.pointsPerLoss;
        homeRes = "W";
        awayRes = "L";
      } else if (hs < as) {
        away.won++;
        home.lost++;
        away.points += soccerConfig.pointsPerWin;
        home.points += soccerConfig.pointsPerLoss;
        homeRes = "L";
        awayRes = "W";
      } else {
        home.drawn++;
        away.drawn++;
        home.points += soccerConfig.pointsPerDraw;
        away.points += soccerConfig.pointsPerDraw;
      }
      home.recentForm = [...home.recentForm.slice(-4), homeRes];
      away.recentForm = [...away.recentForm.slice(-4), awayRes];
    }

    const arr = [...rows.values()];
    for (const r of arr) r.goalDifference = r.goalsFor - r.goalsAgainst;
    arr.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference)
        return b.goalDifference - a.goalDifference;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.teamName.localeCompare(b.teamName);
    });
    return arr;
  },
};

export const soccerPlayerAggregateCalculator: StatCalculator<
  PlayerAggregateInput,
  SoccerPlayerSeasonAggregate[]
> = {
  id: "soccer-player-aggregate",
  name: "Agregado de temporada por jugador de Fútbol",
  compute(input) {
    const finished = new Set(
      input.matches.filter((m) => m.status === "finished").map((m) => m.id),
    );
    const byPlayer = new Map<string, SoccerPlayerSeasonAggregate>();

    for (const ps of input.playerStats) {
      if (!finished.has(ps.match_id)) continue;
      const existing = byPlayer.get(ps.player_id);
      const goals = Number(ps.sport_specific.goals ?? 0) || 0;
      const assists = Number(ps.sport_specific.assists ?? 0) || 0;
      const yc = Number(ps.sport_specific.yellow_cards ?? 0) || 0;
      const rc = Number(ps.sport_specific.red_cards ?? 0) || 0;
      const passAcc = Number(ps.sport_specific.pass_accuracy_pct ?? 0) || 0;
      if (!existing) {
        byPlayer.set(ps.player_id, {
          playerId: ps.player_id,
          teamId: ps.team_id,
          fullName: ps.full_name,
          position: ps.position,
          matchesPlayed: 1,
          totalMinutes: ps.minutes_played,
          goals,
          assists,
          yellowCards: yc,
          redCards: rc,
          avgPassAccuracyPct: passAcc,
        });
      } else {
        existing.matchesPlayed++;
        existing.totalMinutes += ps.minutes_played;
        existing.goals += goals;
        existing.assists += assists;
        existing.yellowCards += yc;
        existing.redCards += rc;
        const n = existing.matchesPlayed;
        existing.avgPassAccuracyPct =
          (existing.avgPassAccuracyPct * (n - 1) + passAcc) / n;
      }
    }
    return [...byPlayer.values()].sort(
      (a, b) => b.goals + b.assists - (a.goals + a.assists),
    );
  },
};
