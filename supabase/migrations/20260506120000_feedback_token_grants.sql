-- Bonus daily token allowance from qualifying training feedback (UTC day).
-- Client: Feedback.tsx, subscription.ts. Eligibility must match FEEDBACK_MIN_DETAIL_CHARS (30) in UI.
-- Quota API: use sum_feedback_bonus_tokens_for_user(user_id) and add to base daily_limit / remaining.

CREATE TABLE IF NOT EXISTS public.feedback_token_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  feedback_event_id uuid NOT NULL REFERENCES public.feedback_events (id) ON DELETE CASCADE,
  grant_date_utc date NOT NULL,
  tokens int NOT NULL DEFAULT 1000,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_token_grants_feedback_unique UNIQUE (feedback_event_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_token_grants_user_grant_date
  ON public.feedback_token_grants (user_id, grant_date_utc);

ALTER TABLE public.feedback_token_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own feedback token grants"
  ON public.feedback_token_grants;
CREATE POLICY "Users can select own feedback token grants"
  ON public.feedback_token_grants
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON public.feedback_token_grants TO authenticated;

CREATE OR REPLACE FUNCTION public.try_grant_feedback_tokens_from_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comment text;
  v_badges jsonb;
BEGIN
  v_comment := coalesce(trim(NEW.additional_info->>'comment'), '');
  v_badges := NEW.additional_info->'badges';

  IF length(trim(coalesce(NEW.category, ''))) = 0 THEN
    RETURN NEW;
  END IF;

  IF v_badges IS NULL OR jsonb_typeof(v_badges) <> 'array' OR jsonb_array_length(v_badges) < 1 THEN
    RETURN NEW;
  END IF;

  IF length(v_comment) < 30 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.feedback_token_grants (user_id, feedback_event_id, grant_date_utc, tokens)
  VALUES (
    NEW.user_id,
    NEW.id,
    (timezone('utc', NEW.reported_at))::date,
    1000
  )
  ON CONFLICT (feedback_event_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feedback_events_grant_tokens ON public.feedback_events;
CREATE TRIGGER feedback_events_grant_tokens
  AFTER INSERT ON public.feedback_events
  FOR EACH ROW
  EXECUTE FUNCTION public.try_grant_feedback_tokens_from_event();

CREATE OR REPLACE FUNCTION public.sum_feedback_bonus_tokens_for_user(p_user_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(sum(tokens), 0)::bigint
  FROM public.feedback_token_grants
  WHERE user_id = p_user_id
    AND grant_date_utc = (timezone('utc', now()))::date;
$$;

REVOKE ALL ON FUNCTION public.sum_feedback_bonus_tokens_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sum_feedback_bonus_tokens_for_user(uuid) TO service_role;
