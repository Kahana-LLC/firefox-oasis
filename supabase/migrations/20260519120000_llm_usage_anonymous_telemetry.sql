-- Anonymous rich telemetry: llm_usage.user_id may be NULL when the client
-- has not opted in via datareporting.healthreport.uploadEnabled.
-- Identified rows keep user_id = auth.uid() and may include a user block in interaction_data.

DO $$
BEGIN
  IF to_regclass('public.llm_usage') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.llm_usage ALTER COLUMN user_id DROP NOT NULL;
END $$;

DROP POLICY IF EXISTS "Users can insert anonymous telemetry" ON public.llm_usage;

CREATE POLICY "Users can insert anonymous telemetry"
  ON public.llm_usage
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL);

CREATE OR REPLACE FUNCTION public.attach_feedback_to_interaction(
  p_interaction_id uuid,
  p_feedback       jsonb
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  UPDATE public.llm_usage
  SET interaction_data = jsonb_set(
    COALESCE(interaction_data, '{}'::jsonb),
    '{feedback}',
    p_feedback
  )
  WHERE interaction_id = p_interaction_id
    AND (user_id = auth.uid() OR user_id IS NULL);
END;
$$;
