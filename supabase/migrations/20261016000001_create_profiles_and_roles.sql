-- M0: user profiles and roles.
--
-- Every auth user gets one profile row with a role. The role (and a
-- sub-admin's capabilities) is mirrored into auth.users.raw_app_meta_data so
-- the app reads it from user.app_metadata without an extra query. Users
-- cannot change app_metadata themselves; only this table (written with the
-- service role or from the SQL editor) can.
--
-- Roles: admin, sub_admin, teacher, museum, parent, guest.
-- Only admin and sub_admin may enter /admin (see lib/auth/roles.ts).
--
-- BACKFILL: every user that exists when this runs becomes 'admin'. Today
-- only staff have auth accounts (classroom registration creates viewers, not
-- users), so this keeps everyone's current access. Review the list after
-- applying (query at the bottom) and downgrade any account that should not
-- be admin. New sign-ups get 'parent' and cannot open /admin.
--
-- Unlike older migrations in this repo, this table has RLS on from the start.

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'parent'
    CHECK (role IN ('admin', 'sub_admin', 'teacher', 'museum', 'parent', 'guest')),
  capabilities TEXT[] NOT NULL DEFAULT '{}'
    CHECK (capabilities <@ ARRAY['orders', 'print', 'moderation']::TEXT[]),
  display_name TEXT,
  organisation_id UUID, -- FK to organisations is added in M2
  brand_id TEXT,        -- brand the account signed up on; FK added with brands
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Reuses update_updated_at_column() from 20241112000000_create_viewer_tables.sql
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS: a signed-in user can read their own profile and nothing else.
-- No insert/update/delete policies: role changes go through the service
-- role (server code) or the SQL editor, so nobody can promote themselves.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Mirror role + capabilities into auth.users.raw_app_meta_data.
CREATE OR REPLACE FUNCTION public.sync_profile_role_to_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
         'role', NEW.role,
         'capabilities', to_jsonb(NEW.capabilities)
       )
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_role_to_auth ON public.profiles;
CREATE TRIGGER sync_profile_role_to_auth
  AFTER INSERT OR UPDATE OF role, capabilities ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_role_to_auth();

-- Create a 'parent' profile for every new auth user.
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'parent')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();

-- Backfill existing users as admin (see note at the top).
INSERT INTO public.profiles (id, role)
SELECT id, 'admin' FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Review after applying:
--   SELECT u.email, p.role, p.capabilities
--   FROM auth.users u JOIN public.profiles p ON p.id = u.id
--   ORDER BY p.role, u.email;
-- Downgrade an account:
--   UPDATE public.profiles SET role = 'parent' WHERE id = '<user id>';
-- Make a sub-admin who sees orders and the print list:
--   UPDATE public.profiles SET role = 'sub_admin', capabilities = '{orders,print}'
--   WHERE id = '<user id>';
