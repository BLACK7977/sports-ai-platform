BEGIN;

CREATE TABLE IF NOT EXISTS match_preparation_state (
  match_id TEXT PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
  venue_state TEXT NOT NULL DEFAULT 'NOT_CHECKED' CHECK (venue_state IN ('NOT_CHECKED','AVAILABLE','NOT_AVAILABLE','FAILED')),
  prediction_state TEXT NOT NULL DEFAULT 'NOT_CHECKED' CHECK (prediction_state IN ('NOT_CHECKED','AVAILABLE','NOT_AVAILABLE','FAILED')),
  probable_lineup_state TEXT NOT NULL DEFAULT 'NOT_CHECKED' CHECK (probable_lineup_state IN ('NOT_CHECKED','AVAILABLE','NOT_AVAILABLE','FAILED')),
  provider TEXT,
  model_version_id TEXT REFERENCES model_versions(id) ON DELETE SET NULL,
  last_attempt_at TIMESTAMPTZ,
  prepared_at TIMESTAMPTZ,
  error_code TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE match_preparation_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON match_preparation_state FROM anon, authenticated;
GRANT SELECT ON match_preparation_state TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON match_preparation_state TO service_role;
CREATE POLICY "match_preparation_state public read" ON match_preparation_state FOR SELECT TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_match_preparation_prediction_state ON match_preparation_state(prediction_state, last_attempt_at);

COMMIT;
