-- ============================================================================
-- Sports AI Platform - 007: Rollback (NO destructivo con usuarios)
-- ============================================================================
-- Revierte migration 007_user_profiles_and_roles.sql.
-- NO toca migraciones 001-006. NO toca auth.users.
--
-- ADVERTENCIA: elimina la tabla profiles (roles). Solo ejecutarlo si NO hay
-- perfiles que conservar. Verificar antes:
--   SELECT COUNT(*) FROM profiles;
--   SELECT role, COUNT(*) FROM profiles GROUP BY role;
-- Si existen premiums otorgados, respaldar primero:
--   CREATE TABLE profiles_backup_007 AS TABLE profiles;
-- ============================================================================

BEGIN;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON profiles;
DROP FUNCTION IF EXISTS set_profiles_updated_at();
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP TABLE IF EXISTS profiles;

COMMIT;
