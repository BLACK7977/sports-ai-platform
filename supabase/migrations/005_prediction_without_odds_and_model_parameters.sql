-- ============================================================================
-- Sports AI Platform - 005: predictions sin odds + parámetros reales 4B
-- ============================================================================
-- Phase: Launch Sprint 1 (bloqueos).
-- Depends on: 004 (odds/predictions/model evaluation).
--
-- 1. Permite predicciones del modelo SIN mercado de cuotas asociado:
--    predictions.odds_used / odds_snapshot_id / bookmaker_id pasan a NULLables.
--    NO elimina FKs, NO elimina CHECKs (los CHECK JSONB pasan con NULL),
--    NO toca edge/EV, NO toca RLS.
-- 2. Corrige model_versions.parameters de v1-dixon-coles-2026-01 para que
--    describa EXACTAMENTE el comportamiento real de Phase 4B/4B.1.
--
-- PROTECCIÓN: si ya existen predictions asociadas a v1-dixon-coles-2026-01,
-- esta migration FALLA sin modificar nada (habría que crear una versión nueva).
-- Todo el archivo se ejecuta en UNA transacción: si cualquier guardia falla,
-- nada se aplica. NO aplicar en Cloud sin revisión humana ni fuera de transacción.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Guardia: no corregir metadata si ya existe historial de esa versión.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  existing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO existing_count
  FROM predictions
  WHERE model_version_id = 'v1-dixon-coles-2026-01';
  IF existing_count > 0 THEN
    RAISE EXCEPTION
      'Migration 005 bloqueada: existen % predictions con model_version_id=v1-dixon-coles-2026-01. No se modifica metadata con historial asociado; crear un model_version nuevo en su lugar.',
      existing_count;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 0b. Guardia: no imponer la UNIQUE canónica si ya existen duplicados.
--     NO borra ni consolida historial automáticamente.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT match_id, market_id, model_version_id
    FROM predictions
    GROUP BY match_id, market_id, model_version_id
    HAVING COUNT(*) > 1
  ) dupes;
  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'Migration 005 bloqueada: existen % grupos (match,market,model) con más de una prediction. Resolver manualmente antes de imponer la UNIQUE canónica.',
      dup_count;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. Predicciones sin odds: NULL explícito permitido.
--    NULL = "predicción del modelo sin mercado de cuotas asociado", NO odds sintéticas.
-- ----------------------------------------------------------------------------
ALTER TABLE predictions ALTER COLUMN odds_used DROP NOT NULL;
ALTER TABLE predictions ALTER COLUMN odds_snapshot_id DROP NOT NULL;
ALTER TABLE predictions ALTER COLUMN bookmaker_id DROP NOT NULL;

-- ----------------------------------------------------------------------------
-- 1b. UNIQUE canónica: UNA predicción por (match, market, model version).
--     Es la garantía de DB para la política de idempotencia del servicio:
--     findExisting()+insert() no basta bajo concurrencia; ante violación
--     de esta constraint por carrera, el servicio re-lee y reutiliza.
-- ----------------------------------------------------------------------------
ALTER TABLE predictions
  ADD CONSTRAINT uq_predictions_match_market_model
  UNIQUE (match_id, market_id, model_version_id);

-- ----------------------------------------------------------------------------
-- 2. Parámetros reales de Phase 4B/4B.1 para v1-dixon-coles-2026-01.
--    Comportamiento efectivo verificado contra src/lib/ai/probability-model.ts:
--    - lookbackMatches=20, minMatchesRequired=6, recencyHalfLife=7
--    - homeAdvFactor=1.0 EFECTIVO: el código NO aplica multiplicador adicional;
--      leagueAvgHomeGoals/leagueAvgAwayGoals ya capturan la ventaja local.
--      (El valor 1.25 anterior correspondía a un diseño descartado en 4B.1.)
--    - dcEnabled=true, dcRho=-0.13, maxGoals=10
--    - minLambda=0.05, maxLambda=5.0 (safeguards numéricos, añadidos en 4B.1)
--    - fallbackMethod=league_average, normalizeToUnity=true
-- ----------------------------------------------------------------------------
UPDATE model_versions
SET parameters = '{
    "lookbackMatches": 20,
    "minMatchesRequired": 6,
    "recencyHalfLife": 7,
    "homeAdvFactor": 1.0,
    "homeAdvEstimation": "fixed",
    "dcEnabled": true,
    "dcRho": -0.13,
    "maxGoals": 10,
    "minLambda": 0.05,
    "maxLambda": 5.0,
    "fallbackMethod": "league_average",
    "normalizeToUnity": true,
    "notes": "Comportamiento efectivo real de Phase 4B/4B.1. homeAdvFactor=1.0 significa SIN multiplicador adicional: la ventaja local proviene de leagueAvgHomeGoals/leagueAvgAwayGoals. homeAdvEstimation=fixed es metadata de compatibilidad retenida (no leida por el computo V1). minLambda/maxLambda son safeguards numericos experimentales, no calibracion estadistica."
}'::jsonb
WHERE id = 'v1-dixon-coles-2026-01';

COMMIT;
