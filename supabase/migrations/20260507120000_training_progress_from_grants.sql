-- Streak and totals for Training gallery from qualifying feedback (token grants), UTC calendar days.

CREATE OR REPLACE FUNCTION public.training_progress_from_grants()
RETURNS TABLE (
  total_qualifying bigint,
  current_streak int,
  longest_streak int,
  last_grant_date date
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  tot bigint;
  last_d date;
  today_d date;
  anchor date;
  streak int := 0;
  d date;
  lng int;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RETURN QUERY SELECT 0::bigint, 0, 0, NULL::date;
    RETURN;
  END IF;

  SELECT COUNT(*)::bigint, MAX(g.grant_date_utc)
  INTO tot, last_d
  FROM public.feedback_token_grants g
  WHERE g.user_id = uid;

  IF tot IS NULL OR tot = 0 THEN
    RETURN QUERY SELECT 0::bigint, 0, 0, NULL::date;
    RETURN;
  END IF;

  WITH days AS (
    SELECT DISTINCT g2.grant_date_utc AS dt
    FROM public.feedback_token_grants g2
    WHERE g2.user_id = uid
  ),
  ordered AS (
    SELECT
      dt,
      (dt - (ROW_NUMBER() OVER (ORDER BY dt))::integer) AS grp
    FROM days
  ),
  runs AS (
    SELECT COUNT(*)::int AS run_len
    FROM ordered
    GROUP BY grp
  )
  SELECT COALESCE(MAX(r.run_len), 0) INTO lng FROM runs r;

  today_d := (timezone('utc', now()))::date;
  IF EXISTS (
    SELECT 1
    FROM public.feedback_token_grants g3
    WHERE g3.user_id = uid AND g3.grant_date_utc = today_d
    LIMIT 1
  ) THEN
    anchor := today_d;
  ELSIF EXISTS (
    SELECT 1
    FROM public.feedback_token_grants g4
    WHERE g4.user_id = uid AND g4.grant_date_utc = today_d - 1
    LIMIT 1
  ) THEN
    anchor := today_d - 1;
  ELSE
    anchor := NULL;
  END IF;

  IF anchor IS NULL THEN
    streak := 0;
  ELSE
    d := anchor;
    LOOP
      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM public.feedback_token_grants g5
        WHERE g5.user_id = uid AND g5.grant_date_utc = d
        LIMIT 1
      );
      streak := streak + 1;
      d := d - 1;
    END LOOP;
  END IF;

  RETURN QUERY SELECT tot, streak, lng, last_d;
END;
$$;

GRANT EXECUTE ON FUNCTION public.training_progress_from_grants() TO authenticated;
