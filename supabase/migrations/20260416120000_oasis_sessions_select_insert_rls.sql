-- Client inserts new rows in public.sessions on sign-in (see supabase.ts createSession).
-- Prior migration only added UPDATE; without INSERT/SELECT policies, RLS blocks session tracking.

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own sessions" ON public.sessions;
CREATE POLICY "Users can insert own sessions"
  ON public.sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can select own sessions" ON public.sessions;
CREATE POLICY "Users can select own sessions"
  ON public.sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
