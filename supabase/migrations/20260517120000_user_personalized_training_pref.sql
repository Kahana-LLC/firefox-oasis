-- Adds opt-in flag for personalized training data collection.
-- Defaults to false — no PII is included in interaction_data unless the user
-- explicitly opts in via the training settings toggle.
-- The existing "Users can update own profile" UPDATE policy covers this column.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS opt_in_personalized_training boolean NOT NULL DEFAULT false;
