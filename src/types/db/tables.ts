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
