-- Run in Supabase SQL editor if assist-chain migration failed with:
--   duplicate key value violates unique constraint "users_email_key"
-- Then re-apply updated handle_new_auth_user / ensure_user_profile from repo migrations
-- (20260412000000, 20260412100000) and NOTIFY pgrst, 'reload schema'.

DELETE FROM public.users pu
WHERE NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = pu.user_id)
  AND NULLIF(BTRIM(COALESCE(pu.email, '')), '') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM auth.users au2
    WHERE NULLIF(BTRIM(COALESCE(au2.email, '')), '') IS NOT NULL
      AND LOWER(BTRIM(au2.email)) = LOWER(BTRIM(pu.email))
  );

INSERT INTO public.users (user_id, email, name, password_hash, status)
SELECT
  au.id,
  COALESCE(au.email, ''),
  COALESCE(
    NULLIF(BTRIM(au.raw_user_meta_data->>'full_name'), ''),
    NULLIF(BTRIM(au.raw_user_meta_data->>'name'), ''),
    NULLIF(BTRIM(SPLIT_PART(COALESCE(au.email, ''), '@', 1)), '')
  ),
  '',
  'active'
FROM auth.users au
ON CONFLICT (user_id) DO UPDATE SET
  email = CASE
    WHEN EXCLUDED.email IS NOT NULL AND BTRIM(EXCLUDED.email) <> '' THEN EXCLUDED.email
    ELSE public.users.email
  END,
  name = COALESCE(
    NULLIF(BTRIM(EXCLUDED.name), ''),
    public.users.name
  );
