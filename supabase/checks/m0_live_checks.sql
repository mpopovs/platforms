-- M0 live checks: run in the SQL editor of the self-hosted Supabase
-- (production and staging). Read-only. Paste the results into the M0 PR.

-- 1. Which public tables have RLS off? (Expect: everything except profiles
--    and brands, until M2 adds policies.)
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relrowsecurity, c.relname;

-- 2. Storage buckets and whether they are public.
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY public DESC, id;

-- 3. RLS on storage.objects and its policies.
SELECT relrowsecurity AS objects_rls_enabled
FROM pg_class WHERE oid = 'storage.objects'::regclass;
SELECT policyname, cmd, roles, qual
FROM pg_policies WHERE schemaname = 'storage';

-- 4. Who has an account today (all become admin when the profiles
--    migration runs; downgrade anyone who should not be).
SELECT id, email, created_at, last_sign_in_at
FROM auth.users ORDER BY created_at;

-- 5. After applying 20261016000001/2: roles mirrored into app_metadata.
SELECT u.email, p.role, p.capabilities, u.raw_app_meta_data ->> 'role' AS jwt_role
FROM auth.users u JOIN public.profiles p ON p.id = u.id
ORDER BY p.role, u.email;

-- Sign-up is not a SQL setting. On the server, check the Supabase docker .env:
--   grep -E '^(DISABLE_SIGNUP|ENABLE_EMAIL_SIGNUP|ENABLE_ANONYMOUS_USERS)=' .env
-- DISABLE_SIGNUP=true is recommended until M2: the navbar hides sign-up,
-- but the API accepts it with the public anon key if it is enabled.
