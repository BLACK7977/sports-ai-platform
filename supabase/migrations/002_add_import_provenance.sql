-- Proposed additive migration for provider-backed imports.
-- REVIEW ONLY: do not apply until the preflight queries below return no rows.
-- It neither deletes nor rewrites demo rows and intentionally provides no defaults.

-- Preflight: any returned row must be reconciled before creating the unique index.
-- SELECT match_id, player_id, COUNT(*)
-- FROM player_match_stats
-- GROUP BY match_id, player_id
-- HAVING COUNT(*) > 1;

BEGIN;

ALTER TABLE seasons ADD COLUMN IF NOT EXISTS external_id TEXT;

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE player_match_stats ADD COLUMN IF NOT EXISTS provider TEXT;

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE players ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE player_match_stats ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_seasons_provider_external
  ON seasons (provider, external_id)
  WHERE provider IS NOT NULL AND external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_player_match_stats_match_player
  ON player_match_stats (match_id, player_id);

COMMIT;
