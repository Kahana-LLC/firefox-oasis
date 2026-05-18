-- Allow qualifying anonymous feedback to earn token grants for the submitting user (JWT sub).
-- feedback_events.user_id stays NULL for anonymous; grants use coalesce(user_id, jwt sub).

CREATE OR REPLACE FUNCTION public.try_grant_feedback_tokens_from_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comment text;
  v_badges jsonb;
  v_grant_user_id uuid;
BEGIN
  v_grant_user_id := coalesce(
    NEW.user_id,
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  );

  IF v_grant_user_id IS NULL THEN
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
    v_grant_user_id,
    NEW.id,
    (timezone('utc', NEW.reported_at))::date,
    1000
  )
  ON CONFLICT (feedback_event_id) DO NOTHING;

  RETURN NEW;
END;
$$;
