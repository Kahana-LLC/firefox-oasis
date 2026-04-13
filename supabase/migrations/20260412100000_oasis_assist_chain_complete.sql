-- Completes assist chain: users RLS + grants, sessions UPDATE policy, profile RPC,
-- auth.users -> public.users backfill, llm_usage column parity with browser client.
-- Apply after 20260412000000_oasis_auth_users_sync.sql (or merge deploy both).

-- -----------------------------------------------------------------------------
-- public.users: RLS policies (SELECT/UPDATE; INSERT is in prior migration)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE
  USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- Grants (fixes "permission denied for table users" when role lacks privileges)
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sessions TO authenticated;
GRANT SELECT, INSERT ON public.llm_usage TO authenticated;

-- -----------------------------------------------------------------------------
-- public.sessions: UPDATE for sign-out / endSession (client updates ended_at)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update own sessions" ON public.sessions;
CREATE POLICY "Users can update own sessions" ON public.sessions
  FOR UPDATE
  USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- RPC: ensure row in public.users using JWT (no direct read of auth.users)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_user_profile(
  p_email text DEFAULT NULL,
  p_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  v_email text;
  v_name text;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RETURN;
  END IF;

  v_email := COALESCE(NULLIF(BTRIM(p_email), ''), '');
  v_name := COALESCE(
    NULLIF(BTRIM(p_name), ''),
    NULLIF(BTRIM(SPLIT_PART(v_email, '@', 1)), '')
  );

  INSERT INTO public.users (user_id, email, name, password_hash, status)
  VALUES (uid, v_email, COALESCE(v_name, ''), '', 'active')
  ON CONFLICT (user_id) DO UPDATE SET
    email = CASE
      WHEN EXCLUDED.email IS NOT NULL AND BTRIM(EXCLUDED.email) <> '' THEN EXCLUDED.email
      ELSE public.users.email
    END,
    name = COALESCE(
      NULLIF(BTRIM(EXCLUDED.name), ''),
      public.users.name
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_user_profile(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_user_profile(text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- One-time backfill: every auth user gets a public.users row (idempotent)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- llm_usage: align with browser/base/content/assistant subscription.ts
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.llm_usage') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.llm_usage ADD COLUMN IF NOT EXISTS command_type text;
  ALTER TABLE public.llm_usage ADD COLUMN IF NOT EXISTS user_intent text;
  ALTER TABLE public.llm_usage ADD COLUMN IF NOT EXISTS input_tokens integer;
  ALTER TABLE public.llm_usage ADD COLUMN IF NOT EXISTS output_tokens integer;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'llm_usage' AND column_name = 'tokens_used'
  ) THEN
    ALTER TABLE public.llm_usage ADD COLUMN tokens_used integer NOT NULL DEFAULT 0;
  ELSE
    ALTER TABLE public.llm_usage ALTER COLUMN tokens_used SET DEFAULT 0;
    UPDATE public.llm_usage SET tokens_used = 0 WHERE tokens_used IS NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'llm_usage' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.llm_usage ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;
