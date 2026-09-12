-- Sports AI Platform - Core Tables Migration
-- Compatible with Supabase/Postgres. Generic schema with JSONB for sport-specific extensions.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. SPORTS
-- ============================================================
CREATE TABLE IF NOT EXISTS sports (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sport_specific JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- ============================================================
-- 2. LEAGUES
-- ============================================================
CREATE TABLE IF NOT EXISTS leagues (
    id TEXT PRIMARY KEY,
    sport_id TEXT NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    external_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sport_specific JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_leagues_sport_id ON leagues(sport_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leagues_external_id ON leagues(external_id) WHERE external_id IS NOT NULL;

-- ============================================================
-- 3. SEASONS
-- ============================================================
CREATE TABLE IF NOT EXISTS seasons (
    id TEXT PRIMARY KEY,
    league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_current BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sport_specific JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_seasons_league_id ON seasons(league_id);
CREATE INDEX IF NOT EXISTS idx_seasons_is_current ON seasons(is_current);

-- ============================================================
-- 4. TEAMS
-- ============================================================
CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    sport_id TEXT NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
    league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    logo_url TEXT,
    external_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sport_specific JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_teams_sport_id ON teams(sport_id);
CREATE INDEX IF NOT EXISTS idx_teams_league_id ON teams(league_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_external_id ON teams(external_id) WHERE external_id IS NOT NULL;

-- ============================================================
-- 5. PLAYERS
-- ============================================================
CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    sport_id TEXT NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    short_name TEXT,
    position TEXT NOT NULL,
    jersey_number INTEGER,
    nationality TEXT,
    date_of_birth DATE,
    external_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sport_specific JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_players_sport_id ON players(sport_id);
CREATE INDEX IF NOT EXISTS idx_players_team_id ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_players_position ON players(position);
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_external_id ON players(external_id) WHERE external_id IS NOT NULL;

-- ============================================================
-- 6. MATCHES
-- ============================================================
CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    sport_id TEXT NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
    league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    home_team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    away_team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    match_date TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('scheduled','in_progress','finished','postponed','cancelled')),
    home_score INTEGER,
    away_score INTEGER,
    external_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sport_specific JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT matches_teams_diff CHECK (home_team_id <> away_team_id)
);
CREATE INDEX IF NOT EXISTS idx_matches_sport_id ON matches(sport_id);
CREATE INDEX IF NOT EXISTS idx_matches_league_season ON matches(league_id, season_id);
CREATE INDEX IF NOT EXISTS idx_matches_match_date ON matches(match_date);
CREATE INDEX IF NOT EXISTS idx_matches_teams ON matches(home_team_id, away_team_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_external_sport ON matches(external_id, sport_id) WHERE external_id IS NOT NULL;

-- ============================================================
-- 7. PLAYER_MATCH_STATS
-- ============================================================
CREATE TABLE IF NOT EXISTS player_match_stats (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    minutes_played INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sport_specific JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_pms_match_id ON player_match_stats(match_id);
CREATE INDEX IF NOT EXISTS idx_pms_player_id ON player_match_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_pms_team_match ON player_match_stats(team_id, match_id);

-- ============================================================
-- Trigger: auto updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sports','leagues','seasons','teams','players','matches','player_match_stats'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trigger_set_updated_at_%I ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trigger_set_updated_at_%I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;
