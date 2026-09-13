-- ============================================================================
-- Sports AI Platform - 005: Rollback (NO destructivo)
-- ============================================================================
-- Revierte migration 005_prediction_without_odds_and_model_parameters.sql.
-- NO toca migraciones 001-004. NO borra predicciones. NO inventa datos.
--
-- Reglas de seguridad:
-- 1. Antes de volver a SET NOT NULL, comprueba que NO existan predictions
--    con NULL en odds_used / odds_snapshot_id / bookmaker_id. Si existen,
--    ABORTA con mensaje claro (no borra, no inventa bookmakers/odds).
-- 2. Los parameters anteriores solo se restauran si NINGUNA prediction
--    referencia a v1-dixon-coles-2026-01; si existe historial, se conservan
--    los parámetros corregidos y se emite NOTICE (restaurarlos desincronizaría
--    la metadata del historial producido).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Guardia: no reimponer NOT NULL si hay predicciones sin odds.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM predictions
  WHERE odds_used IS NULL OR odds_snapshot_id IS NULL OR bookmaker_id IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION
      'Rollback 005 bloqueado: existen % predictions con odds NULL. No se reimpone NOT NULL ni se borra historial.',
      null_count;
  END IF;
END $$;

-- Elimina SOLO la constraint creada por 005. Nunca borra predictions.
ALTER TABLE predictions DROP CONSTRAINT IF EXISTS uq_predictions_match_market_model;

ALTER TABLE predictions ALTER COLUMN odds_used SET NOT NULL;
ALTER TABLE predictions ALTER COLUMN odds_snapshot_id SET NOT NULL;
ALTER TABLE predictions ALTER COLUMN bookmaker_id SET NOT NULL;

-- ----------------------------------------------------------------------------
-- 1. Restaurar parameters anteriores SOLO si es seguro (sin historial).
--    Estado anterior (migration 004): homeAdvFactor 1.25, sin min/maxLambda.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  history_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO history_count
  FROM predictions
  WHERE model_version_id = 'v1-dixon-coles-2026-01';
  IF history_count = 0 THEN
    UPDATE model_versions
    SET parameters = '{
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
        "notes": "DEFAULTS EXPERIMENTALES NO VALIDADOS - estado previo a migration 005 (restaurado por rollback)"
    }'::jsonb
    WHERE id = 'v1-dixon-coles-2026-01';
  ELSE
    RAISE NOTICE 'Rollback 005: parameters de v1-dixon-coles-2026-01 conservados porque existen % predictions asociadas.',
      history_count;
  END IF;
END $$;

COMMIT;
