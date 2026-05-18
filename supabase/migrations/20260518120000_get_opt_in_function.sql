-- Returns the calling user's opt_in_personalized_training flag.
-- SECURITY DEFINER bypasses table-level GRANT complexity; the WHERE clause
-- enforces that only the calling user's row is read.

CREATE OR REPLACE FUNCTION public.get_personalized_training_opt_in()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(
    (SELECT opt_in_personalized_training FROM public.users WHERE user_id = auth.uid()),
    false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_personalized_training_opt_in() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_personalized_training_opt_in() TO authenticated;
