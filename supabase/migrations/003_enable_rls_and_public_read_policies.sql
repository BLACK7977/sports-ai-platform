-- ============================================================================
-- Sports AI Platform - 003: Enable RLS + Public-Read-Only policies
-- ============================================================================
-- Fase 1 de seguridad. OBJETIVO:
--   * Evitar que las tablas queden abiertas (leer/escribir) para el rol `anon`
--     cuando en el futuro se configure NEXT_PUBLIC_SUPABASE_ANON_KEY.
--   * Mantener la app actual funcionando: HOY todas las lecturas/escrituras de
--     la app usan SUPABASE_SERVICE_ROLE_KEY (rol service_role en Postgres),
--     que tiene BYPASSRLS y NO se ve afectada por RLS.
--   * NO crear ninguna política pública de INSERT / UPDATE / DELETE.
--
-- ALCANCE: SOLO las 7 tablas deportivas actuales.
--   * NO toca ALTER DEFAULT PRIVILEGES: cada tabla FUTURA (profiles,
--     subscriptions, premium_entitlements, usage_counters, history,
--     preferencias, etc.) deberá definir EXPLÍCITAMENTE sus grants y políticas
--     RLS al crearse. No recibirán SELECT por defecto.
--
-- PROPIEDADES:
--   * Idempotente (DROP POLICY IF EXISTS + CREATE POLICY, enable RLS repetido).
--   * Se puede ejecutar una única vez o re-ejecutar sin errores.
--   * No modifica datos ni borra filas.
--   * No fuerza RLS para el owner (no se usa FORCE ROW LEVEL SECURITY).
--
-- ADVERTENCIA: revisar antes de aplicar en producción.
-- ROLLBACK: ver docs/003_rls_rollback.sql (manual, NO auto-ejecutable).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. ENABLE ROW LEVEL SECURITY en las 7 tablas deportivas
--    (idempotente: repetir el enable no es error).
-- ----------------------------------------------------------------------------
ALTER TABLE sports            ENABLE ROW LEVEL SECURITY;
ALTER TABLE leagues           ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons           ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams             ENABLE ROW LEVEL SECURITY;
ALTER TABLE players           ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches           ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_match_stats ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. Defense in depth sobre GRANTS de las 7 tablas.
--    Supabase otorga por defecto GRANT ALL a anon/authenticated sobre todas
--    las tablas. Al habilitar RLS las filas quedan filtradas POR POLITICA,
--    pero además retiramos explícitamente los permisos de escritura para que
--    ningún bypass futuro (tabla sin política, etc.) permita cambios.
--    service_role conserva sus privilegios originales (no se menciona).
-- ----------------------------------------------------------------------------
REVOKE ALL ON TABLE sports             FROM anon, authenticated;
REVOKE ALL ON TABLE leagues            FROM anon, authenticated;
REVOKE ALL ON TABLE seasons            FROM anon, authenticated;
REVOKE ALL ON TABLE teams              FROM anon, authenticated;
REVOKE ALL ON TABLE players            FROM anon, authenticated;
REVOKE ALL ON TABLE matches            FROM anon, authenticated;
REVOKE ALL ON TABLE player_match_stats FROM anon, authenticated;

-- Lectura pública explícita para futuros accesos con anon key y para el rol
-- authenticated (auth futura). Máximo permiso concedido: SELECT.
GRANT SELECT ON TABLE sports             TO anon, authenticated;
GRANT SELECT ON TABLE leagues            TO anon, authenticated;
GRANT SELECT ON TABLE seasons            TO anon, authenticated;
GRANT SELECT ON TABLE teams              TO anon, authenticated;
GRANT SELECT ON TABLE players            TO anon, authenticated;
GRANT SELECT ON TABLE matches            TO anon, authenticated;
GRANT SELECT ON TABLE player_match_stats TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Políticas de LECTURA PÚBLICA.
--    Solo SELECT (USING). Sin WITH CHECK (no hay escritura pública).
--    Role-based: aplican tanto a `anon` como a futuros `authenticated`.
--    Ninguna política INSERT / UPDATE / DELETE.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "sports_select_public" ON sports;
CREATE POLICY "sports_select_public"
  ON sports
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "leagues_select_public" ON leagues;
CREATE POLICY "leagues_select_public"
  ON leagues
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "seasons_select_public" ON seasons;
CREATE POLICY "seasons_select_public"
  ON seasons
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "teams_select_public" ON teams;
CREATE POLICY "teams_select_public"
  ON teams
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "players_select_public" ON players;
CREATE POLICY "players_select_public"
  ON players
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "matches_select_public" ON matches;
CREATE POLICY "matches_select_public"
  ON matches
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "player_match_stats_select_public" ON player_match_stats;
CREATE POLICY "player_match_stats_select_public"
  ON player_match_stats
  FOR SELECT
  TO anon, authenticated
  USING (true);

COMMIT;