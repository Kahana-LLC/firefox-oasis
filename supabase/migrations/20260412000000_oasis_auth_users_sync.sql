-- Ensures a public.users row exists for each auth.users signup so foreign keys
-- (e.g. llm_usage.user_id -> users.user_id) and client profile reads succeed.
-- Apply to projects that define public.users per SUPABASE_AUTH_IMPLEMENTATION_GUIDE.md.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.users du
  WHERE du.user_id IS DISTINCT FROM NEW.id
    AND NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = du.user_id)
    AND NULLIF(BTRIM(COALESCE(du.email, '')), '') IS NOT NULL
    AND NULLIF(BTRIM(COALESCE(NEW.email, '')), '') IS NOT NULL
    AND LOWER(BTRIM(du.email)) = LOWER(BTRIM(NEW.email));

  INSERT INTO public.users (user_id, email, name, password_hash, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      NULLIF(BTRIM(SPLIT_PART(COALESCE(NEW.email, ''), '@', 1)), '')
    ),
    '',
    'active'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    name = COALESCE(EXCLUDED.name, public.users.name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_auth_user();

DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
CREATE POLICY "Users can insert own profile" ON public.users
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
