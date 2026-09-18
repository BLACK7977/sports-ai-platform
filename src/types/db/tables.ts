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
  home_score?: number | null;
  away_score?: number | null;
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

/** Fila de prediction_explanations (migration 014). Append-only. */
export interface PredictionExplanation {
  id: number;
  prediction_id: number;
  provider: string;
  model_name: string;
  prompt_schema: string;
  prompt_version: number;
  language: string;
  payload: Jsonb | null;
  status: "generated" | "failed";
  input_fingerprint: string | null;
  error_class: string | null;
  generated_at: string;
}
export type PredictionExplanationInsert = {
  prediction_id: number;
  provider: string;
  model_name: string;
  prompt_schema: string;
  prompt_version: number;
  language: string;
  payload: Jsonb | null;
  status: "generated" | "failed";
  input_fingerprint?: string | null;
  error_class?: string | null;
};

// ============================================================================
// Match Enrichment (migration 008)
// ============================================================================

export interface MatchMetadata {
  match_id: string;
  venue_provider_id?: string | null;
  venue_name?: string | null;
  venue_city?: string | null;
  venue_capacity?: number | null;
  venue_address?: string | null;
  venue_latitude?: number | null;
  venue_longitude?: number | null;
  venue_surface?: string | null;
  round_provider_id?: string | null;
  round_name?: string | null;
  main_referee_provider_id?: string | null;
  main_referee_name?: string | null;
  home_formation?: string | null;
  away_formation?: string | null;
  provider?: string | null;
  provider_fixture_id?: string | null;
  last_synced_at?: string | null;
  created_at: string;
  updated_at: string;
}
export type MatchMetadataInsert = Partial<Pick<MatchMetadata, "created_at" | "updated_at">> &
  Omit<MatchMetadata, "created_at" | "updated_at">;

export interface MatchStatistic {
  id: string;
  match_id: string;
  team_id?: string | null;
  provider_participant_id?: string | null;
  provider_stat_type_id?: string | null;
  stat_name?: string | null;
  stat_value?: number | null;
  stat_value_json?: Jsonb | null;
  location?: string | null;
  provider: string;
  sport_specific: Jsonb;
  created_at: string;
  updated_at: string;
}
export type MatchStatisticInsert = Partial<Pick<MatchStatistic, "id" | "created_at" | "updated_at">> &
  Omit<MatchStatistic, "id" | "created_at" | "updated_at">;

export interface MatchEvent {
  id: string;
  match_id: string;
  team_id?: string | null;
  player_id?: string | null;
  assist_player_id?: string | null;
  provider_player_id?: string | null;
  provider_team_id?: string | null;
  provider_event_id?: string | null;
  provider_event_type_id?: string | null;
  event_type?: string | null;
  minute?: number | null;
  extra_minute?: number | null;
  result?: string | null;
  event_detail?: string | null;
  provider: string;
  sport_specific: Jsonb;
  created_at: string;
  updated_at: string;
}
export type MatchEventInsert = Partial<Pick<MatchEvent, "id" | "created_at" | "updated_at">> &
  Omit<MatchEvent, "id" | "created_at" | "updated_at">;

export interface MatchLineup {
  id: string;
  match_id: string;
  team_id?: string | null;
  player_id?: string | null;
  provider_player_id?: string | null;
  provider_team_id?: string | null;
  is_starter?: boolean | null;
  /** Nombre recibido de la fuente para poder mostrar alineaciones sin inventarlo. */
  player_name?: string | null;
  position_id?: string | null;
  detailed_position_id?: string | null;
  position_name?: string | null;
  provider_type_id?: string | null;
  jersey_number?: number | null;
  formation_position?: number | null;
  formation_field?: string | null;
  provider: string;
  sport_specific: Jsonb;
  created_at: string;
  updated_at: string;
}
export type MatchLineupInsert = Partial<Pick<MatchLineup, "id" | "created_at" | "updated_at">> &
  Omit<MatchLineup, "id" | "created_at" | "updated_at">;

// ============================================================================
// Probable Lineup (migration 012) — SPORTS AI predictive storage.
// Immutable/canonical. Never mixed with official match_lineups.
// ============================================================================

export interface ProbableLineupRun {
  id: string;
  match_id: string;
  team_id: string;
  model_version: string;
  generated_at: string;
  input_cutoff_at: string;
  formation: string;
  evidence_coverage: number;
  status: "AVAILABLE" | "NOT_AVAILABLE" | "FAILED";
  created_at: string;
}
export type ProbableLineupRunInsert = Omit<ProbableLineupRun, "created_at"> & {
  created_at?: string;
};

export interface ProbableLineupPlayer {
  id: string;
  run_id: string;
  player_id: string | null;
  player_name: string;
  formation_field: string;
  evidence_score: number;
  deterministic_order: number;
  created_at: string;
}
export type ProbableLineupPlayerInsert = Omit<ProbableLineupPlayer, "created_at"> & {
  created_at?: string;
};
