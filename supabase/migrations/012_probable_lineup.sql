BEGIN;

-- ============================================================================
-- Sports AI Platform - 012: Probable Lineup (immutable/canonical, V0)
-- ============================================================================
-- Separate predictive storage from official match_lineups.
-- Official lineups (migration 008) are source data; probable lineups are
-- SPORTS AI outputs. They must never be mixed and never written to
-- match_lineups.
--
-- Canonical/immutable for Beta:
--  - one probable lineup per (match, team, model_version): UNIQUE index.
--  - one player per (run, slot): UNIQUE index on formation_field.
--  - append-only from the app (INSERT only; no UPDATE/DELETE).
-- ============================================================================

-- ============================================================
-- 1. PROBABLE_LINEUP_RUNS — one canonical run per team per match
-- ============================================================
CREATE TABLE IF NOT EXISTS probable_lineup_runs (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  model_version TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  input_cutoff_at TIMESTAMPTZ NOT NULL,
  formation TEXT NOT NULL,
  evidence_coverage NUMERIC(5,2) NOT NULL CHECK (evidence_coverage >= 0 AND evidence_coverage <= 100),
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','NOT_AVAILABLE','FAILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_probable_lineup_canonical
  ON probable_lineup_runs(match_id, team_id, model_version);
CREATE INDEX IF NOT EXISTS idx_probable_lineup_runs_match
  ON probable_lineup_runs(match_id);

-- ============================================================
-- 2. PROBABLE_LINEUP_PLAYERS — one row per slot of a run
-- ============================================================
CREATE TABLE IF NOT EXISTS probable_lineup_players (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES probable_lineup_runs(id) ON DELETE CASCADE,
  player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
  player_name TEXT NOT NULL,
  formation_field TEXT NOT NULL,
  evidence_score NUMERIC(5,2) NOT NULL CHECK (evidence_score >= 0 AND evidence_score <= 100),
  deterministic_order INTEGER NOT NULL CHECK (deterministic_order >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_probable_lineup_slot
  ON probable_lineup_players(run_id, formation_field);
CREATE INDEX IF NOT EXISTS idx_probable_lineup_players_run
  ON probable_lineup_players(run_id);

-- ============================================================
-- 3. RLS — public read, server-only write (matches existing pattern)
-- ============================================================
ALTER TABLE probable_lineup_runs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE probable_lineup_players ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE probable_lineup_runs    FROM anon, authenticated;
REVOKE ALL ON TABLE probable_lineup_players FROM anon, authenticated;

GRANT SELECT ON TABLE probable_lineup_runs    TO anon, authenticated;
GRANT SELECT ON TABLE probable_lineup_players TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE probable_lineup_runs    TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE probable_lineup_players TO service_role;

DROP POLICY IF EXISTS "probable_lineup_runs public read" ON probable_lineup_runs;
CREATE POLICY "probable_lineup_runs public read"
  ON probable_lineup_runs FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "probable_lineup_players public read" ON probable_lineup_players;
CREATE POLICY "probable_lineup_players public read"
  ON probable_lineup_players FOR SELECT TO anon, authenticated USING (true);

COMMIT;