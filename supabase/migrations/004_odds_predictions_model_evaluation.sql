-- ============================================================================
-- Sports AI Platform - 004: Odds, Predictions, Model Evaluation
-- ============================================================================
-- Phase 4A: Schema + Versionado + Inmutabilidad
-- Depends on: 001 (core), 002 (provider columns), 003 (RLS)
-- ============================================================================

BEGIN;

-- ============================================================
-- 1. BOOKMAKERS
-- ============================================================
CREATE TABLE bookmakers (
    id TEXT PRIMARY KEY,              -- ej. 'bet365', 'pinnacle', 'william_hill'
    name TEXT NOT NULL,
    country TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. MARKETS
-- ============================================================
CREATE TABLE markets (
    id TEXT PRIMARY KEY,              -- ej. '1x2', 'ou25', 'btts'
    name TEXT NOT NULL,
    description TEXT,
    sport_id TEXT NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
    outcomes JSONB NOT NULL,          -- ej. ['home','draw','away'] para 1X2
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_markets_sport_id ON markets(sport_id);

-- ============================================================
-- 3. MODEL VERSIONS
-- ============================================================
CREATE TABLE model_versions (
    id TEXT PRIMARY KEY,              -- ej. 'v1-dixon-coles-2026-01'
    name TEXT NOT NULL,
    description TEXT,
    parameters JSONB NOT NULL,        -- hiperparámetros versionados
    score_version TEXT,               -- ej. 'v1-experimental-2026-01'
    score_formula JSONB,              -- fórmula exacta del score (NULL = no definida)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT false
);

-- ============================================================
-- 4. ODDS SNAPSHOTS
-- ============================================================
CREATE TABLE odds_snapshots (
    id BIGSERIAL PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    bookmaker_id TEXT NOT NULL REFERENCES bookmakers(id),
    market_id TEXT NOT NULL REFERENCES markets(id),
    odds JSONB NOT NULL,              -- ej. {"home":2.10,"draw":3.40,"away":3.60}
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source TEXT NOT NULL,             -- 'sportmonks', 'api_football', 'manual'
    UNIQUE (match_id, bookmaker_id, market_id, captured_at)
);
CREATE INDEX IF NOT EXISTS idx_odds_snapshots_match ON odds_snapshots(match_id, captured_at DESC);

-- ============================================================
-- 5. PREDICTIONS — 100% APPEND-ONLY / INMUTABLE
-- ============================================================
CREATE TABLE predictions (
    id BIGSERIAL PRIMARY KEY,
    
    -- Identificación inmutable
    match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    market_id TEXT NOT NULL REFERENCES markets(id),
    model_version_id TEXT NOT NULL REFERENCES model_versions(id),
    
    -- Probabilidades del modelo (JSONB validado por CHECK)
    model_probabilities JSONB NOT NULL,
    
    -- Odds del bookmaker usadas (JSONB validado por CHECK)
    odds_used JSONB NOT NULL,
    odds_snapshot_id BIGINT NOT NULL REFERENCES odds_snapshots(id),
    bookmaker_id TEXT NOT NULL REFERENCES bookmakers(id),
    
    -- Edge & EV — COLUMNAS EXPLÍCITAS para queries/índices
    edge_home NUMERIC(6,4),
    edge_draw NUMERIC(6,4),
    edge_away NUMERIC(6,4),
    ev_home NUMERIC(6,4),
    ev_draw NUMERIC(6,4),
    ev_away NUMERIC(6,4),
    
    -- Sports AI Score — COLUMNA EXPLÍCITA + versionado
    sports_ai_score SMALLINT,         -- 0-100, NULL si no calculado
    score_version TEXT,               -- copiado de model_versions.score_version
    score_components JSONB,           -- breakdown: {"edge":80,"ev":50,...}
    
    -- Metadata de la predicción (inmutable)
    data_snapshot JSONB NOT NULL,     -- features exactas usadas
    predicted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    kickoff_at TIMESTAMPTZ NOT NULL,  -- copiado de matches.match_date al crear
    
    -- Constraints
    UNIQUE (match_id, market_id, model_version_id, predicted_at),
    CONSTRAINT valid_score CHECK (sports_ai_score IS NULL OR (sports_ai_score BETWEEN 0 AND 100)),
    
    -- CHECK: model_probabilities estructura 1X2 (MVP)
    -- Valida: objeto con keys home/draw/away, valores numéricos 0-1, suma ≈ 1
    CONSTRAINT valid_model_probabilities_1x2 CHECK (
        jsonb_typeof(model_probabilities) = 'object'
        AND model_probabilities ? 'home'
        AND model_probabilities ? 'draw'
        AND model_probabilities ? 'away'
        AND (model_probabilities->>'home')::numeric BETWEEN 0 AND 1
        AND (model_probabilities->>'draw')::numeric BETWEEN 0 AND 1
        AND (model_probabilities->>'away')::numeric BETWEEN 0 AND 1
        AND ABS(
            (model_probabilities->>'home')::numeric +
            (model_probabilities->>'draw')::numeric +
            (model_probabilities->>'away')::numeric - 1.0
        ) <= 0.0001
    ),
    
    -- CHECK: odds_used estructura 1X2 (MVP)
    -- Valida: objeto con keys home/draw/away, valores numéricos finitos > 1
    CONSTRAINT valid_odds_used_1x2 CHECK (
        jsonb_typeof(odds_used) = 'object'
        AND odds_used ? 'home'
        AND odds_used ? 'draw'
        AND odds_used ? 'away'
        AND (odds_used->>'home')::numeric > 1
        AND (odds_used->>'draw')::numeric > 1
        AND (odds_used->>'away')::numeric > 1
        AND (odds_used->>'home')::numeric IS NOT NULL
        AND (odds_used->>'draw')::numeric IS NOT NULL
        AND (odds_used->>'away')::numeric IS NOT NULL
    )
);

-- Índices predictions
CREATE INDEX IF NOT EXISTS idx_predictions_match ON predictions(match_id);
CREATE INDEX IF NOT EXISTS idx_predictions_kickoff ON predictions(kickoff_at);
CREATE INDEX IF NOT EXISTS idx_predictions_model_version ON predictions(model_version_id);
CREATE INDEX IF NOT EXISTS idx_predictions_edge_home ON predictions(edge_home) WHERE edge_home IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_predictions_sports_ai_score ON predictions(sports_ai_score) WHERE sports_ai_score IS NOT NULL;

-- ============================================================
-- 6. PREDICTION EVALUATIONS — tabla separada, append-only
-- ============================================================
CREATE TABLE prediction_evaluations (
    id BIGSERIAL PRIMARY KEY,
    prediction_id BIGINT NOT NULL REFERENCES predictions(id) ON DELETE RESTRICT,
    actual_outcome TEXT NOT NULL CHECK (actual_outcome IN ('home','draw','away')),
    is_correct BOOLEAN NOT NULL,
    match_result JSONB NOT NULL,      -- {"home_score":2,"away_score":1,"status":"finished"}
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    evaluator TEXT NOT NULL DEFAULT 'auto',  -- 'auto', 'manual', 'correction'
    evaluation_version INTEGER NOT NULL DEFAULT 1,
    UNIQUE (prediction_id, evaluation_version)
);
CREATE INDEX IF NOT EXISTS idx_pred_eval_prediction ON prediction_evaluations(prediction_id);
CREATE INDEX IF NOT EXISTS idx_pred_eval_evaluated_at ON prediction_evaluations(evaluated_at);

-- Historial de correcciones: cada corrección inserta nueva fila con evaluation_version incrementado.
-- Flujo: auto (v1) → correction (v2) → correction (v3)...
-- Nunca se hace UPDATE ni DELETE sobre evaluaciones históricas.

-- ============================================================
-- 7. MODEL EVALUATIONS (agregadas, para dashboard)
-- ============================================================
CREATE TABLE model_evaluations (
    id BIGSERIAL PRIMARY KEY,
    model_version_id TEXT NOT NULL REFERENCES model_versions(id),
    market_id TEXT NOT NULL REFERENCES markets(id),
    evaluation_period DATERANGE NOT NULL,
    n_predictions INTEGER NOT NULL,
    accuracy NUMERIC(6,4),
    brier_score NUMERIC(6,4),
    log_loss NUMERIC(6,4),
    ece NUMERIC(6,4),                 -- Expected Calibration Error
    roi_top1 NUMERIC(6,4),
    roi_edge_positive NUMERIC(6,4),
    roi_ev_positive NUMERIC(6,4),
    calibration_data JSONB,           -- bins para reliability diagram
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_model_eval_version ON model_evaluations(model_version_id);
CREATE INDEX IF NOT EXISTS idx_model_eval_period ON model_evaluations(evaluation_period);

-- Secuencias BIGSERIAL creadas por 004: service_role necesita USAGE, SELECT para INSERT
GRANT USAGE, SELECT ON SEQUENCE odds_snapshots_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE predictions_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE prediction_evaluations_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE model_evaluations_id_seq TO service_role;

-- ============================================================
-- RLS: ENABLE ROW LEVEL SECURITY EN TODAS LAS TABLAS NUEVAS
-- ============================================================
ALTER TABLE bookmakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE odds_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_evaluations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- GRANTS + POLICIES
-- Filosofía Phase 1: anon/authenticated = SELECT only
-- service_role = INSERT (y bypass RLS por defecto en Supabase)
-- NO GRANT UPDATE/DELETE a anon/authenticated
-- ============================================================

-- BOOKMAKERS
REVOKE ALL ON TABLE bookmakers FROM anon, authenticated;
GRANT SELECT ON TABLE bookmakers TO anon, authenticated;
GRANT INSERT ON TABLE bookmakers TO service_role;
CREATE POLICY bookmakers_select_public ON bookmakers
    FOR SELECT TO anon, authenticated USING (true);

-- MARKETS
REVOKE ALL ON TABLE markets FROM anon, authenticated;
GRANT SELECT ON TABLE markets TO anon, authenticated;
GRANT INSERT ON TABLE markets TO service_role;
CREATE POLICY markets_select_public ON markets
    FOR SELECT TO anon, authenticated USING (true);

-- MODEL VERSIONS
REVOKE ALL ON TABLE model_versions FROM anon, authenticated;
GRANT SELECT ON TABLE model_versions TO anon, authenticated;
GRANT INSERT ON TABLE model_versions TO service_role;
CREATE POLICY model_versions_select_public ON model_versions
    FOR SELECT TO anon, authenticated USING (true);

-- ODDS SNAPSHOTS
REVOKE ALL ON TABLE odds_snapshots FROM anon, authenticated;
GRANT SELECT ON TABLE odds_snapshots TO anon, authenticated;
GRANT INSERT ON TABLE odds_snapshots TO service_role;
CREATE POLICY odds_snapshots_select_public ON odds_snapshots
    FOR SELECT TO anon, authenticated USING (true);

-- PREDICTIONS — APPEND-ONLY
-- service_role bypassa RLS en Supabase; privileges PostgreSQL efectivos:
-- anon/authenticated: SELECT only
-- service_role: SELECT + INSERT (NO UPDATE, NO DELETE)
REVOKE ALL ON TABLE predictions FROM anon, authenticated;
GRANT SELECT ON TABLE predictions TO anon, authenticated;
GRANT INSERT ON TABLE predictions TO service_role;
REVOKE UPDATE, DELETE ON TABLE predictions FROM service_role;
CREATE POLICY predictions_select_public ON predictions
    FOR SELECT TO anon, authenticated USING (true);
-- NO POLICY INSERT/UPDATE/DELETE para anon/authenticated

-- PREDICTION EVALUATIONS — APPEND-ONLY
-- service_role bypassa RLS en Supabase; privileges PostgreSQL efectivos:
-- anon/authenticated: SELECT only
-- service_role: SELECT + INSERT (NO UPDATE, NO DELETE)
REVOKE ALL ON TABLE prediction_evaluations FROM anon, authenticated;
GRANT SELECT ON TABLE prediction_evaluations TO anon, authenticated;
GRANT INSERT ON TABLE prediction_evaluations TO service_role;
REVOKE UPDATE, DELETE ON TABLE prediction_evaluations FROM service_role;
CREATE POLICY pred_eval_select_public ON prediction_evaluations
    FOR SELECT TO anon, authenticated USING (true);
-- NO POLICY INSERT/UPDATE/DELETE para anon/authenticated

-- MODEL EVALUATIONS
REVOKE ALL ON TABLE model_evaluations FROM anon, authenticated;
GRANT SELECT ON TABLE model_evaluations TO anon, authenticated;
GRANT INSERT ON TABLE model_evaluations TO service_role;
CREATE POLICY model_eval_select_public ON model_evaluations
    FOR SELECT TO anon, authenticated USING (true);

-- ============================================================
-- DATOS INICIALES MVP
-- ============================================================

-- Market 1X2 para soccer
INSERT INTO markets (id, name, description, sport_id, outcomes)
VALUES (
    '1x2',
    '1X2 (Resultado final)',
    'Local / Empate / Visitante',
    'soccer',
    '["home","draw","away"]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Model Version V1 Experimental
INSERT INTO model_versions (id, name, description, parameters, score_version, score_formula, is_active)
VALUES (
    'v1-dixon-coles-2026-01',
    'Dixon-Coles Poisson V1 (Experimental)',
    'Modelo V1 experimental con defaults no validados. Requiere calibración con datos reales.',
    '{
        "lookbackMatches": 20,
        "minMatchesRequired": 6,
        "recencyHalfLife": 7,
        "homeAdvFactor": 1.25,
        "homeAdvEstimation": "fixed",
        "dcEnabled": true,
        "dcRho": -0.13,
        "maxGoals": 10,
        "fallbackMethod": "league_average",
        "normalizeToUnity": true,
        "notes": "DEFAULTS EXPERIMENTALES NO VALIDADOS — no afirmar que son óptimos"
    }'::jsonb,
    'v1-experimental-2026-01',
    NULL,  -- score_formula NULL inicialmente (se definirá en 4F)
    true
)
ON CONFLICT (id) DO NOTHING;

COMMIT;