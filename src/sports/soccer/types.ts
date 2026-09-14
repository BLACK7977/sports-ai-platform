import type { Jsonb, PlayerInsert, TeamInsert } from "@/types/db/tables";

export interface SoccerMatchSpecific extends Jsonb {
  attendance?: number;
  referee?: string;
  round?: number;
  ballPossession?: {
    home: number;
    away: number;
  };
  shots?: {
    home: number;
    away: number;
  };
  shotsOnTarget?: {
    home: number;
    away: number;
  };
  corners?: {
    home: number;
    away: number;
  };
  fouls?: {
    home: number;
    away: number;
  };
}

export interface SoccerPlayerStatsSpecific extends Jsonb {
  side: "home" | "away";
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  shots: number;
  shotsOnTarget?: number;
  passes: number;
  pass_accuracy_pct: number;
  tackles?: number;
  interceptions?: number;
  saves?: number;
  rating?: number;
}

export interface SoccerStandingsRow {
  teamId: string;
  teamName: string;
  shortName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  recentForm: ("W" | "D" | "L")[];
}

export interface SoccerPlayerSeasonAggregate {
  playerId: string;
  teamId: string;
  fullName: string;
  position: string;
  matchesPlayed: number;
  totalMinutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  avgPassAccuracyPct: number;
}

export type SoccerMatchPayload = {
  external_id: string;
  provider?: string;
  last_synced_at?: string;
  league_id: string;
  season_id: string;
  home_team_id: string;
  away_team_id: string;
  match_date: string;
  status: "scheduled" | "in_progress" | "finished" | "postponed" | "cancelled";
  home_score?: number | null;
  away_score?: number | null;
  specific?: SoccerMatchSpecific;
  playerStats?: Array<{
    player_id: string;
    team_id: string;
    minutes_played: number;
    specific: SoccerPlayerStatsSpecific;
  }>;
  teams?: TeamInsert[];
  players?: PlayerInsert[];
};

export function isSoccerMatchSpecific(s: Jsonb): s is SoccerMatchSpecific {
  return typeof s === "object" && s !== null;
}

export function isSoccerPlayerStatsSpecific(
  s: Jsonb,
): s is SoccerPlayerStatsSpecific {
  return typeof s === "object" && s !== null && "goals" in s && "side" in s;
}
