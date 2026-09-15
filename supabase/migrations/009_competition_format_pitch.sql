-- ============================================================================
-- Sports AI Platform - Competition Format + Tactical Pitch UX (Phase 1)
-- ============================================================================
-- Adds: competition formats, qualification zones, lineup field enrichment
-- Does NOT seed any competition rules — creates capability only.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. COMPETITION FORMATS
-- Single row per competition+season. Phases array in config JSONB.
-- ============================================================================
CREATE TABLE IF NOT EXISTS competition_formats (
    id TEXT PRIMARY KEY,
    competition_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    format_type TEXT NOT NULL,
    -- 'round_robin' | 'groups' | 'apertura_clausura' | 'knockout' | 'playoffs' | 'championship_relegation_groups'
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Example future structure:
    -- {
    --   "phases": [
    --     { "type": "regular_season", "teams": 12 },
    --     { "type": "championship_group", "teams": 6 },
    --     { "type": "relegation_group", "teams": 6 }
    --   ]
    -- }
    source_type TEXT NOT NULL DEFAULT 'manual',
    -- 'provider' | 'official' | 'manual'
    source_url TEXT,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (competition_id, season_id)
);
CREATE INDEX IF NOT EXISTS idx_competition_formats_comp_season
  ON competition_formats (competition_id, season_id);

-- ============================================================================
-- 2. QUALIFICATION / RELEGATION ZONES
-- No color persisted. UI maps zone_type -> visual treatment.
-- ============================================================================
CREATE TABLE IF NOT EXISTS competition_qualification_zones (
    id TEXT PRIMARY KEY,
    competition_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    start_position INTEGER NOT NULL,
    end_position INTEGER NOT NULL,
    zone_type TEXT NOT NULL,
    -- 'continental' | 'champions_league' | 'europa_league' | 'conference_league'
    -- | 'playoff' | 'relegation_playoff' | 'direct_relegation'
    label TEXT NOT NULL,
    -- e.g. 'Clasifica a Copa Libertadores', 'Playoff descenso', 'Descenso directo'
    destination_competition_id TEXT REFERENCES leagues(id) ON DELETE SET NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    source_type TEXT NOT NULL DEFAULT 'manual',
    -- 'provider' | 'official' | 'manual'
    source_url TEXT,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (start_position >= 1),
    CHECK (end_position >= start_position),
    UNIQUE (competition_id, season_id, zone_type, start_position, end_position)
);
CREATE INDEX IF NOT EXISTS idx_qual_zones_comp_season
  ON competition_qualification_zones (competition_id, season_id);

-- ============================================================================
-- 3. MATCH_LINEUPS — enrich with provider fields we actually receive
-- ============================================================================
ALTER TABLE match_lineups ADD COLUMN IF NOT EXISTS player_name TEXT;
ALTER TABLE match_lineups ADD COLUMN IF NOT EXISTS detailed_position_id TEXT;
ALTER TABLE match_lineups ADD COLUMN IF NOT EXISTS provider_type_id TEXT; -- raw type_id (11=starter, 12=sub)

-- ============================================================================
-- 4. RLS for new tables (public read, server-only write)
-- ============================================================================
ALTER TABLE competition_formats       ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_qualification_zones ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE competition_formats FROM anon, authenticated;
REVOKE ALL ON TABLE competition_qualification_zones FROM anon, authenticated;

GRANT SELECT ON TABLE competition_formats TO anon, authenticated;
GRANT SELECT ON TABLE competition_qualification_zones TO anon, authenticated;

DROP POLICY IF EXISTS "competition_formats_select_public" ON competition_formats;
CREATE POLICY "competition_formats_select_public"
  ON competition_formats FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "competition_qualification_zones_select_public" ON competition_qualification_zones;
CREATE POLICY "competition_qualification_zones_select_public"
  ON competition_qualification_zones FOR SELECT TO anon, authenticated USING (true);

COMMIT;