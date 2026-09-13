-- ============================================================================
-- SPORTS AI - ROLLBACK MANUAL de la migración
--   supabase/migrations/003_enable_rls_and_public_read_policies.sql
--
--   >>> NO AUTO-EJECUTABLE. ESTE ARCHIVO NO SE EJECUTA POR NINGÚN TOOLING. <<<
--   >>> SÓLO LO EJECUTA UN HUMANO CONSCIENTEMENTE, SI ES NECESARIO. <<<
--
--   REGLAS DEL ROLLBACK SEGURO:
--   1) NUNCA conceder INSERT / UPDATE / DELETE a anon o authenticated.
--   2) Máximo permiso para anon/authenticated: SELECT.
--   3) Preferir eliminar SOLO las políticas (Fase A) y mantener RLS activo.
--   4) Deshabilitar RLS (Fase B) únicamente si hubiera una rotura real que lo
--      exija, y tras hacer backup. Con RLS deshabilitado y estos grants,
--      anon/authenticated conservan como máximo lectura.
--   5) service_role no se menciona: conserva sus privilegios intactos.
--
--   El orden es seguro para ejecutar de una única pasada (tras COMMIT,
--   anon/authenticated quedan con SELECT como máximo).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- FASE A (RECOMENDADA): eliminar las políticas de lectura pública creadas.
--   Resultado con RLS ACTIVO: anon/authenticated quedan DENEGADOS (ni lectura),
--   el estado más restrictivo. No requiere deshabilitar RLS.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "sports_select_public" ON sports;
DROP POLICY IF EXISTS "leagues_select_public" ON leagues;
DROP POLICY IF EXISTS "seasons_select_public" ON seasons;
DROP POLICY IF EXISTS "teams_select_public" ON teams;
DROP POLICY IF EXISTS "players_select_public" ON players;
DROP POLICY IF EXISTS "matches_select_public" ON matches;
DROP POLICY IF EXISTS "player_match_stats_select_public" ON player_match_stats;

-- ----------------------------------------------------------------------------
-- FASE B (SOLO SI ES REALMENTE NECESARIO): deshabilitar RLS.
--   Ejecutar este bloque SOLO ante una rotura real de acceso (por ejemplo si
--   migrases lecturas a la anon key SIN políticas). Tras esto, anon conserva
--   únicamente el grant SELECT (no hay políticas de escritura ni grants).
--   NUNCA usar esto como vía para "volver a dejar escribir" a la app web.
-- ----------------------------------------------------------------------------
ALTER TABLE sports             DISABLE ROW LEVEL SECURITY;
ALTER TABLE leagues            DISABLE ROW LEVEL SECURITY;
ALTER TABLE seasons            DISABLE ROW LEVEL SECURITY;
ALTER TABLE teams              DISABLE ROW LEVEL SECURITY;
ALTER TABLE players            DISABLE ROW LEVEL SECURITY;
ALTER TABLE matches            DISABLE ROW LEVEL SECURITY;
ALTER TABLE player_match_stats DISABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- FASE C (IDEMPOTENTE Y OPCIONAL): asegurar que los grants de anon/authenticated
--   NO se hayan degradado durante el cambio. SOLO SELECT. NUNCA INSERT/UPDATE/
--   DELETE. No hace falta si Fase A fue la única aplicada.
-- ----------------------------------------------------------------------------
GRANT SELECT ON TABLE sports             TO anon, authenticated;
GRANT SELECT ON TABLE leagues            TO anon, authenticated;
GRANT SELECT ON TABLE seasons            TO anon, authenticated;
GRANT SELECT ON TABLE teams              TO anon, authenticated;
GRANT SELECT ON TABLE players            TO anon, authenticated;
GRANT SELECT ON TABLE matches            TO anon, authenticated;
GRANT SELECT ON TABLE player_match_stats TO anon, authenticated;

COMMIT;

-- ============================================================================
-- NOTA: este rollback NO restaura la situación original previa a 003 en lo que
-- respecta a escritura: elimina que anon/authenticated puedan escribir datos.
-- Si se decidiera volver a una exposición de escritura pública, eso sería una
-- DECISIÓN EXPLÍCITA y debería hacerse en una migración 00X nueva y revisada,
-- nunca mediante GRANT ALL.
-- ============================================================================