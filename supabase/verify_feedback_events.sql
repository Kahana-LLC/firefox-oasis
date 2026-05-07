-- Run in Supabase SQL editor after applying 20260414120000_feedback_events.sql
-- and reloading the API schema (Settings → API → Reload schema).

SELECT EXISTS (
  SELECT 1
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'feedback_events'
) AS feedback_events_exists;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'feedback_events'
ORDER BY ordinal_position;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'feedback_events';
