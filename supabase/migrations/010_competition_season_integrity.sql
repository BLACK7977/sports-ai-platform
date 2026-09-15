-- ============================================================================
-- Sports AI Platform - Competition/Season Integrity (Phase 1 additive)
-- ============================================================================
-- Adds composite FK to ensure season_id belongs to competition_id
-- Migration 009 was already applied remotely; this is additive migration 010.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Ensure seasons has composite unique on (league_id, id) for FK target
-- ============================================================================
-- seasons.id is PK, so (league_id, id) is naturally unique.
-- Add explicit unique index for clarity and FK target.
CREATE UNIQUE INDEX IF NOT EXISTS idx_seasons_league_id_id
  ON seasons (league_id, id);

-- ============================================================================
-- 2. Add composite FK to competition_formats
-- ============================================================================
-- Drops the individual FKs and replaces with composite FK
-- to ensure season_id belongs to competition_id (league_id).
ALTER TABLE competition_formats
  DROP CONSTRAINT IF EXISTS competition_formats_competition_id_fkey,
  DROP CONSTRAINT IF EXISTS competition_formats_season_id_fkey;

ALTER TABLE competition_formats
  ADD CONSTRAINT competition_formats_competition_season_fkey
  FOREIGN KEY (competition_id, season_id)
  REFERENCES seasons (league_id, id)
  ON DELETE CASCADE;

-- ============================================================================
-- 3. Add composite FK to competition_qualification_zones
-- ============================================================================
ALTER TABLE competition_qualification_zones
  DROP CONSTRAINT IF EXISTS competition_qualification_zones_competition_id_fkey,
  DROP CONSTRAINT IF EXISTS competition_qualification_zones_season_id_fkey;

ALTER TABLE competition_qualification_zones
  ADD CONSTRAINT competition_qualification_zones_competition_season_fkey
  FOREIGN KEY (competition_id, season_id)
  REFERENCES seasons (league_id, id)
  ON DELETE CASCADE;

COMMIT;