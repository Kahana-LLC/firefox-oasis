-- Read-only diagnostics for assist / users / llm_usage / sessions (run in Supabase SQL editor).
-- Replace :'user_id' with a real auth user UUID (JWT sub) when testing one account.

-- 1) public.users row
-- SELECT * FROM public.users WHERE user_id = '00000000-0000-0000-0000-000000000000';

-- 2) auth.users row
-- SELECT id, email FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000000';

-- 3) RLS policies on public.users
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('users', 'sessions', 'llm_usage')
ORDER BY tablename, policyname;

-- 4) Table privileges for authenticated
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('users', 'sessions', 'llm_usage')
  AND grantee IN ('authenticated', 'anon', 'service_role')
ORDER BY table_name, grantee, privilege_type;

-- 5) Trigger on auth.users (profile sync)
SELECT t.tgname AS trigger_name, c.relname AS on_table, n.nspname AS schema_name
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'auth'
  AND c.relname = 'users'
  AND NOT t.tgisinternal
ORDER BY t.tgname;

-- 6) Count auth users missing public.users (should be 0 after backfill)
SELECT count(*) AS auth_users_without_profile
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users pu WHERE pu.user_id = au.id
);
