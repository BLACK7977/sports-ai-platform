-- ============================================================================
-- Sports AI Platform - 006: valid_odds_used_1x2 tolerante a NULL
-- ============================================================================
-- Phase: Launch Sprint 1 (fix post-005, detectado en primer write controlado).
--
-- Causa: predictions.odds_used admite NULL desde 005 ("predicción sin mercado
-- asociado"), pero el CHECK valid_odds_used_1x2 de 004 contiene cláusulas
-- `(odds_used->>'x')::numeric IS NOT NULL que evalúan a FALSE (no UNKNOWN)
-- con odds_used NULL, rechazando la fila. Los CHECK simples pasan con NULL;
-- los IS NOT NULL explícitos, no.
--
-- Fix: envolver la validación original en `odds_used IS NULL OR (...)`,
-- preservando intactas todas las reglas para valores no nulos.
-- NO toca columnas, FKs, RLS, policies ni otras constraints.
-- NO aplicar en Cloud sin revisión humana. Transacción única.
-- ============================================================================

BEGIN;

ALTER TABLE predictions DROP CONSTRAINT IF EXISTS valid_odds_used_1x2;

ALTER TABLE predictions ADD CONSTRAINT valid_odds_used_1x2 CHECK (
  odds_used IS NULL OR (
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

COMMIT;
