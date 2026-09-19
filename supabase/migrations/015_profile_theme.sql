-- ============================================================================
-- Sports AI Platform - 015: Tema de interfaz por perfil (premium themes)
-- ============================================================================
-- Entitlement de temas de interfaz. NO toca tablas/migraciones previas.
-- NO aplicar automáticamente: revisión humana + aplicación manual.
--
-- Diseño:
-- - profiles.theme TEXT CHECK (cyan/gold/pink/green/red), DEFAULT 'cyan'.
-- - La columna solo se deja persistir tal cual a usuarios premium vía
--   service_role (setProfileTheme). El trigger refuerza fail-closed a nivel
--   de datos: cualquier usuario NO premium queda SIEMPRE en theme 'cyan',
--   sin importar qué escriba el service role / RLS.
-- - No cambia RLS: authenticated sigue leyendo únicamente SU propia fila
--   (migración 007); service_role administra escrituras server-side.
-- - Versiones previas del código ignora la columna si no existe.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Columna theme + check constraint.
-- ----------------------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'cyan'
  CHECK (theme IN ('cyan', 'gold', 'pink', 'green', 'red'));

-- ----------------------------------------------------------------------------
-- 2. Trigger fail-closed: no-premium SIEMPRE theme 'cyan'.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_profile_theme_for_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM 'premium' THEN
    NEW.theme := 'cyan';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trigger_profiles_enforce_premium_theme ON profiles;
CREATE TRIGGER trigger_profiles_enforce_premium_theme
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_theme_for_role();

REVOKE ALL ON FUNCTION public.enforce_profile_theme_for_role() FROM PUBLIC, anon, authenticated;

COMMIT;