-- ============================================================================
-- Sports AI Platform - 006: Rollback (NO destructivo)
-- ============================================================================
-- Restaura el CHECK valid_odds_used_1x2 a su forma 004 (no tolerante a NULL).
-- Regla de seguridad: si existe ALGUNA prediction con odds_used NULL, ABORTA
-- sin tocar nada (restaurar el CHECK viejo las volvería inválidas).
-- NO borra predicciones. NO inventa odds.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM predictions
  WHERE odds_used IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION
      'Rollback 006 bloqueado: existen % predictions con odds_used NULL.',
      null_count;
  END IF;
END $$;

ALTER TABLE predictions DROP CONSTRAINT IF EXISTS valid_odds_used_1x2;

ALTER TABLE predictions ADD CONSTRAINT valid_odds_used_1x2 CHECK (
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
);

COMMIT;
