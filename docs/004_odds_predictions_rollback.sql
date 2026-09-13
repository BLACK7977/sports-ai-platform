-- ============================================================================
-- Sports AI Platform - 004: Rollback Script
-- ============================================================================
-- Revierte exclusivamente Phase 4A (migración 004).
-- NO toca migraciones 001, 002, 003.
-- Ejecutar en orden inverso respetando FKs.
-- ============================================================================

BEGIN;

-- 1. Eliminar datos insertados por 004
DELETE FROM model_versions WHERE id = 'v1-dixon-coles-2026-01';
DELETE FROM markets WHERE id = '1x2';

-- 2. Eliminar policies (RLS)
DROP POLICY IF EXISTS model_eval_select_public ON model_evaluations;
DROP POLICY IF EXISTS pred_eval_select_public ON prediction_evaluations;
DROP POLICY IF EXISTS predictions_select_public ON predictions;
DROP POLICY IF EXISTS odds_snapshots_select_public ON odds_snapshots;
DROP POLICY IF EXISTS model_versions_select_public ON model_versions;
DROP POLICY IF EXISTS markets_select_public ON markets;
DROP POLICY IF EXISTS bookmakers_select_public ON bookmakers;

-- 3. Eliminar tablas (orden: hijas → padres por FKs)
DROP TABLE IF EXISTS model_evaluations;
DROP TABLE IF EXISTS prediction_evaluations;
DROP TABLE IF EXISTS predictions;
DROP TABLE IF EXISTS odds_snapshots;
DROP TABLE IF EXISTS model_versions;
DROP TABLE IF EXISTS markets;
DROP TABLE IF EXISTS bookmakers;

COMMIT;