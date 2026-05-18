-- The authenticated role was supposed to receive SELECT, INSERT, UPDATE on
-- public.users in 20260412100000, but the remote project is missing the grant.
-- This migration re-applies it idempotently.

GRANT SELECT, INSERT, UPDATE ON public.users TO authenticated;
