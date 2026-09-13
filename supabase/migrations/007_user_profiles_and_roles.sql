-- ============================================================================
-- Sports AI Platform - 007: Perfiles de usuario y roles Free/Premium
-- ============================================================================
-- Sprint 3 (Auth email/password). NO toca tablas/migraciones 001-006.
-- NO aplicar automáticamente: revisión humana + aplicación manual.
--
-- Diseño:
-- - profiles.user_id PK/FK a auth.users(id) ON DELETE CASCADE.
-- - role TEXT CHECK (free/premium), DEFAULT free. El trigger lo fuerza a
--   'free' literal: ningún dato del cliente puede crear un premium.
-- - Trigger SECURITY DEFINER crea el perfil al registrarse (cualquier vía).
-- - RLS: authenticated solo SELECT de SU propia fila. Sin INSERT/UPDATE/
--   DELETE para anon/authenticated. service_role administra server-side
--   (bypassa RLS; grants explícitos por claridad).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Tabla profiles
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'free' CHECK (role IN ('free', 'premium')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- updated_at automático (función propia, sin depender de migraciones previas).
CREATE OR REPLACE FUNCTION set_profiles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON profiles;
CREATE TRIGGER trigger_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_profiles_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Trigger de creación automática al registrarse (role siempre 'free').
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, role)
  VALUES (NEW.id, 'free')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Endurecimiento: nadie puede invocar la función definer directamente.
-- (El disparo del trigger NO requiere privilegio EXECUTE, sigue funcionando.)
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. RLS + policies (lectura propia solamente).
-- ----------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE profiles FROM anon, authenticated;
GRANT SELECT ON TABLE profiles TO authenticated;
GRANT ALL ON TABLE profiles TO service_role;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Sin policies INSERT/UPDATE/DELETE para anon/authenticated:
-- el trigger (definer) crea la fila; los cambios de role son SOLO
-- service_role server-side. Un cliente nunca puede promoverse.

COMMIT;
