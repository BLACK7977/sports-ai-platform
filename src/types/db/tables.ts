export type Jsonb = Record<string, unknown>;

export type MatchStatus =
  | "scheduled"
  | "in_progress"
  | "finished"
  | "postponed"
  | "cancelled";

export interface Sport {
  id: string;
  name: string;
  display_name: string;
  emoji: string;
  created_at: string;
  updated_at: string;
  sport_specific: Jsonb;
}
export type SportInsert = Partial<Pick<Sport, "id" | "created_at" | "updated_at">> &
  Omit<Sport, "id" | "created_at" | "updated_at">;

export interface League {
  id: string;
  sport_id: string;
  name: string;
  country: string;
  external_id?: string;
  provider?: string;
  last_synced_at?: string;
  created_at: string;
  updated_at: string;
  sport_specific: Jsonb;
}
export type LeagueInsert = Partial<Pick<League, "id" | "created_at" | "updated_at">> &
  Omit<League, "id" | "created_at" | "updated_at">;

export interface Season {
  id: string;
  league_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  external_id?: string;
  provider?: string;
  last_synced_at?: string;
  created_at: string;
  updated_at: string;
  sport_specific: Jsonb;
}
export type SeasonInsert = Partial<Pick<Season, "id" | "created_at" | "updated_at">> &
  Omit<Season, "id" | "created_at" | "updated_at">;

export interface Team {
  id: string;
  sport_id: string;
  league_id: string;
  name: string;
  short_name: string;
  logo_url?: string;
  external_id?: string;
  provider?: string;
  last_synced_at?: string;
  created_at: string;
  updated_at: string;
  sport_specific: Jsonb;
}
export type TeamInsert = Partial<Pick<Team, "id" | "created_at" | "updated_at">> &
  Omit<Team, "id" | "created_at" | "updated_at">;

export interface Player {
  id: string;
  sport_id: string;
  team_id: string;
  full_name: string;
  short_name?: string;
  position: string;
  jersey_number?: number;
  nationality?: string;
  date_of_birth?: string;
  external_id?: string;
  provider?: string;
  last_synced_at?: string;
  created_at: string;
  updated_at: string;
  sport_specific: Jsonb;
}
export type PlayerInsert = Partial<Pick<Player, "id" | "created_at" | "updated_at">> &
  Omit<Player, "id" | "created_at" | "updated_at">;

export interface Match {
  id: string;
  sport_id: string;
  league_id: string;
  season_id: string;
  home_team_id: string;
  away_team_id: string;
  match_date: string;
  status: MatchStatus;
  home_score?: number;
  away_score?: number;
  external_id?: string;
  provider?: string;
  last_synced_at?: string;
  created_at: string;
  updated_at: string;
  sport_specific: Jsonb;
}
export type MatchInsert = Partial<Pick<Match, "id" | "created_at" | "updated_at">> &
  Omit<Match, "id" | "created_at" | "updated_at">;

export interface PlayerMatchStats {
  id: string;
  match_id: string;
  player_id: string;
  team_id: string;
  minutes_played: number;
  provider?: string;
  last_synced_at?: string;
  created_at: string;
  updated_at: string;
  sport_specific: Jsonb;
}
export type PlayerMatchStatsInsert = Partial<
  Pick<PlayerMatchStats, "id" | "created_at" | "updated_at">
> &
  Omit<PlayerMatchStats, "id" | "created_at" | "updated_at">;

/** Fila de predictions (migration 004/005/006). Solo lectura desde la app. */
export interface Prediction {
  id: number;
  match_id: string;
  market_id: string;
  model_version_id: string;
  model_probabilities: Jsonb;
  odds_used: Jsonb | null;
  odds_snapshot_id: number | null;
  bookmaker_id: string | null;
  edge_home: number | null;
  edge_draw: number | null;
  edge_away: number | null;
  ev_home: number | null;
  ev_draw: number | null;
  ev_away: number | null;
  sports_ai_score: number | null;
  score_version: string | null;
  score_components: Jsonb | null;
  data_snapshot: Jsonb;
  predicted_at: string;
  kickoff_at: string;
}

/** Fila de prediction_evaluations (migration 004). Solo lectura desde la app. */
export interface PredictionEvaluation {
  id: number;
  prediction_id: number;
  actual_outcome: string;
  is_correct: boolean;
  match_result: Jsonb;
  evaluated_at: string;
  evaluator: string;
  evaluation_version: number;
}
