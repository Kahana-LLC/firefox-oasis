-- Anonymous vs personalized training on feedback_events.
-- Client: Feedback.tsx (signed-in only; anonymous uses user_id NULL).

ALTER TABLE public.feedback_events
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.feedback_events
  ADD COLUMN IF NOT EXISTS training_mode text NOT NULL DEFAULT 'personalized';

ALTER TABLE public.feedback_events
  DROP CONSTRAINT IF EXISTS feedback_events_training_mode_check;

ALTER TABLE public.feedback_events
  ADD CONSTRAINT feedback_events_training_mode_check
  CHECK (training_mode IN ('anonymous', 'personalized'));

ALTER TABLE public.feedback_events
  DROP CONSTRAINT IF EXISTS feedback_events_training_mode_user_consistency;

ALTER TABLE public.feedback_events
  ADD CONSTRAINT feedback_events_training_mode_user_consistency
  CHECK (
    (training_mode = 'anonymous' AND user_id IS NULL)
    OR (training_mode = 'personalized' AND user_id IS NOT NULL)
  );

UPDATE public.feedback_events
SET training_mode = 'personalized'
WHERE training_mode IS NULL OR training_mode NOT IN ('anonymous', 'personalized');

DROP INDEX IF EXISTS idx_feedback_events_user_reported;

CREATE INDEX IF NOT EXISTS idx_feedback_events_user_reported
  ON public.feedback_events (user_id, reported_at DESC)
  WHERE user_id IS NOT NULL;

DROP POLICY IF EXISTS "Users can insert own feedback" ON public.feedback_events;

CREATE POLICY "Users can insert personalized feedback"
  ON public.feedback_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    training_mode = 'personalized'
    AND user_id = auth.uid()
  );

CREATE POLICY "Users can insert anonymous feedback"
  ON public.feedback_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    training_mode = 'anonymous'
    AND user_id IS NULL
  );

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
  IF NEW.user_id IS NULL OR NEW.training_mode = 'anonymous' THEN
    RETURN NEW;
  END IF;

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
