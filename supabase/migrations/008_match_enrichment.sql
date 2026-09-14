-- ============================================================================
-- Sports AI Platform - 008: Match Enrichment (venue, stats, events, lineups)
-- ============================================================================
-- Adds normalized enrichment tables for match detail data from Sportmonks.
-- Depends on: 001 (core), 002 (provider columns), 003 (RLS)
-- ============================================================================

BEGIN;

-- ============================================================
-- 1. MATCH_METADATA — one row per match (venue, referee, round, formations)
-- ============================================================
CREATE TABLE IF NOT EXISTS match_metadata (
    match_id TEXT PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,

    venue_provider_id TEXT,
    venue_name TEXT,
    venue_city TEXT,
    venue_capacity INTEGER,
    venue_address TEXT,
    venue_latitude DOUBLE PRECISION,
    venue_longitude DOUBLE PRECISION,
    venue_surface TEXT,

    round_provider_id TEXT,
    round_name TEXT,

    main_referee_provider_id TEXT,
    main_referee_name TEXT,

    home_formation TEXT,
    away_formation TEXT,

    provider TEXT,
    provider_fixture_id TEXT,
    last_synced_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. MATCH_STATISTICS — one row per match + team + stat type
-- ============================================================
CREATE TABLE IF NOT EXISTS match_statistics (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
    provider_participant_id TEXT,
    provider_stat_type_id TEXT,
    stat_name TEXT,
    stat_value DOUBLE PRECISION,
    stat_value_json JSONB,
    location TEXT,
    provider TEXT NOT NULL DEFAULT 'sportmonks',
    sport_specific JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_match_stats_match_id ON match_statistics(match_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_match_stats_snapshot
    ON match_statistics (match_id, provider, provider_participant_id, provider_stat_type_id)
    WHERE provider_participant_id IS NOT NULL AND provider_stat_type_id IS NOT NULL;

-- ============================================================
-- 3. MATCH_EVENTS — one row per provider event
-- ============================================================
CREATE TABLE IF NOT EXISTS match_events (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
    player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
    assist_player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
    provider_player_id TEXT,
    provider_team_id TEXT,
    provider_event_id TEXT,
    provider_event_type_id TEXT,
    event_type TEXT,
    minute INTEGER,
    extra_minute INTEGER,
    result TEXT,
    event_detail TEXT,
    provider TEXT NOT NULL DEFAULT 'sportmonks',
    sport_specific JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_match_events_match_id ON match_events(match_id);
CREATE INDEX IF NOT EXISTS idx_match_events_minute ON match_events(match_id, minute);
CREATE UNIQUE INDEX IF NOT EXISTS idx_match_events_snapshot
    ON match_events (match_id, provider, provider_event_id)
    WHERE provider_event_id IS NOT NULL;

-- ============================================================
-- 4. MATCH_LINEUPS — one row per match + player
-- ============================================================
CREATE TABLE IF NOT EXISTS match_lineups (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
    player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
    provider_player_id TEXT,
    provider_team_id TEXT,
    is_starter BOOLEAN,
    position_id TEXT,
    position_name TEXT,
    jersey_number INTEGER,
    formation_position INTEGER,
    formation_field TEXT,
    provider TEXT NOT NULL DEFAULT 'sportmonks',
    sport_specific JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_match_lineups_match_id ON match_lineups(match_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_match_lineups_snapshot
    ON match_lineups (match_id, provider, provider_player_id)
    WHERE provider_player_id IS NOT NULL;

-- ============================================================
-- 5. RLS — public read, server-only write (matches existing pattern)
-- ============================================================
ALTER TABLE match_metadata    ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_statistics  ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_lineups     ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE match_metadata   FROM anon, authenticated;
REVOKE ALL ON TABLE match_statistics FROM anon, authenticated;
REVOKE ALL ON TABLE match_events     FROM anon, authenticated;
REVOKE ALL ON TABLE match_lineups    FROM anon, authenticated;

GRANT SELECT ON TABLE match_metadata   TO anon, authenticated;
GRANT SELECT ON TABLE match_statistics TO anon, authenticated;
GRANT SELECT ON TABLE match_events     TO anon, authenticated;
GRANT SELECT ON TABLE match_lineups    TO anon, authenticated;

DROP POLICY IF EXISTS "match_metadata_select_public" ON match_metadata;
CREATE POLICY "match_metadata_select_public"
  ON match_metadata FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "match_statistics_select_public" ON match_statistics;
CREATE POLICY "match_statistics_select_public"
  ON match_statistics FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "match_events_select_public" ON match_events;
CREATE POLICY "match_events_select_public"
  ON match_events FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "match_lineups_select_public" ON match_lineups;
CREATE POLICY "match_lineups_select_public"
  ON match_lineups FOR SELECT TO anon, authenticated USING (true);

COMMIT;
