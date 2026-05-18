-- Writes a feedback block into llm_usage.interaction_data for the matching
-- interaction_id row. Called from Feedback.tsx after a successful
-- feedback_events insert.
--
-- SECURITY DEFINER so the function can UPDATE llm_usage regardless of the
-- caller's RLS policies. The WHERE clause enforces that only the row owned by
-- the calling user is updated.

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
    AND user_id = auth.uid();
END;
$$;
