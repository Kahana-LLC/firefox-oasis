-- Assistant UI feedback (thumbs, categories) into Supabase.
-- Client: browser/base/content/assistant/ui-preact/src/components/Feedback.tsx
-- message_id is nullable: hydrated chat uses synthetic ids (e.g. hist-3-msg); UUID only for live turns.

CREATE TABLE IF NOT EXISTS public.feedback_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  session_id uuid,
  message_id uuid,
  reported_at timestamptz NOT NULL DEFAULT now(),
  negative_rating boolean NOT NULL DEFAULT false,
  category text NOT NULL DEFAULT '',
  additional_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_events_user_reported
  ON public.feedback_events (user_id, reported_at DESC);

DO $$
BEGIN
  ALTER TABLE public.feedback_events
    ALTER COLUMN message_id DROP NOT NULL;
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;

-- session_id is optional and not FK-enforced here (public.sessions shape may differ between projects).

ALTER TABLE public.feedback_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own feedback" ON public.feedback_events;
CREATE POLICY "Users can insert own feedback"
  ON public.feedback_events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can select own feedback" ON public.feedback_events;
CREATE POLICY "Users can select own feedback"
  ON public.feedback_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT ON public.feedback_events TO authenticated;
