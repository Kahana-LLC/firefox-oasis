-- Structured interaction telemetry: interaction_id + interaction_data JSONB on llm_usage,
-- and interaction_id linkage on feedback_events.
-- Client: browser/base/content/assistant/build/src/services/subscription.ts
-- See: browser/base/content/assistant/TELEMETRY_ROADMAP.md (Phase 1)
--
-- interaction_data shape (populated when RICH_TELEMETRY_ENABLED = true):
-- {
--   interaction_id, session_id, timestamp, app_version,
--   client:  { browser_name, browser_version, os, platform },
--   context: { active_tab_url, active_tab_title, org_tier },
--   prompt, response, tool_trace,
--   user: { user_id, email, role, locale, opt_in_data_collection_use }  -- only when
--     datareporting.healthreport.uploadEnabled is true (Privacy > Data Collection)
-- }
-- llm_usage.user_id is NULL for anonymous telemetry rows; auth.uid() when identified.

-- -----------------------------------------------------------------------------
-- llm_usage: add interaction_id + interaction_data
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.llm_usage') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.llm_usage ADD COLUMN IF NOT EXISTS interaction_id uuid;
  ALTER TABLE public.llm_usage ADD COLUMN IF NOT EXISTS interaction_data jsonb;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_usage_interaction_id
  ON public.llm_usage (interaction_id)
  WHERE interaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_llm_usage_interaction_data
  ON public.llm_usage USING gin (interaction_data)
  WHERE interaction_data IS NOT NULL;

-- -----------------------------------------------------------------------------
-- feedback_events: link to llm_usage via interaction_id
-- No FK constraint: trackUsage is fire-and-forget so feedback may arrive before
-- the llm_usage row is committed. The index is enough for joins.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.feedback_events') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.feedback_events ADD COLUMN IF NOT EXISTS interaction_id uuid;
END $$;

CREATE INDEX IF NOT EXISTS idx_feedback_events_interaction_id
  ON public.feedback_events (interaction_id)
  WHERE interaction_id IS NOT NULL;
