# Supabase: feedback token grants (handoff)

This document describes the database changes for **training feedback bonuses**: each **qualifying** row in `feedback_events` earns **+1000 tokens** toward the user’s **effective daily token ceiling** for the **UTC calendar day** of `reported_at`. Unused bonus does **not** roll over to the next day.

The browser assistant implements the UI and reads grants for the usage bar; **your quota / Lambda layer** should use the same totals when enforcing daily limits (see [Quota API](#quota-api-lambda)).

## Source of truth in this repo

- Migration: [`migrations/20260506120000_feedback_token_grants.sql`](migrations/20260506120000_feedback_token_grants.sql)
- Depends on: [`migrations/20260414120000_feedback_events.sql`](migrations/20260414120000_feedback_events.sql) (table `public.feedback_events`)

## Deploy

1. Ensure `feedback_events` exists and matches the migration (notably `id`, `user_id`, `reported_at`, `category`, `additional_info`).
2. Apply new migrations in order (e.g. Supabase CLI `supabase db push`, or run the SQL file in the SQL editor on the target project).
3. Confirm the trigger and RPC exist (see [Verification](#verification)).

## What gets created

### Table: `public.feedback_token_grants`

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | Primary key, default `gen_random_uuid()` |
| `user_id` | uuid | FK → `auth.users(id)`, `ON DELETE CASCADE` |
| `feedback_event_id` | uuid | FK → `public.feedback_events(id)`, **`UNIQUE`** (idempotent grants) |
| `grant_date_utc` | date | UTC date derived from `feedback_events.reported_at` |
| `tokens` | int | Default **1000** per grant |
| `created_at` | timestamptz | Default `now()` |

Index: `(user_id, grant_date_utc)` for daily sums.

### Row Level Security (RLS)

- RLS is **enabled** on `feedback_token_grants`.
- **`authenticated`** users may **`SELECT`** rows where `auth.uid() = user_id`.
- There is **no** `INSERT`/`UPDATE`/`DELETE` policy for `authenticated`. Rows are inserted only by the **trigger** (runs as **`SECURITY DEFINER`**), so clients cannot mint grants directly.

### Trigger: grant on `feedback_events` insert

- **Name:** `feedback_events_grant_tokens`
- **When:** `AFTER INSERT` on `public.feedback_events`
- **Function:** `public.try_grant_feedback_tokens_from_event()`

**Server-side eligibility** (all must pass or **no** grant row is created; `feedback_events` insert still succeeds):

0. A grant recipient is resolved: `feedback_events.user_id` for personalized rows, or the submitting user from JWT (`request.jwt.claim.sub`) for anonymous rows where `user_id` is null (see [`migrations/20260518130000_feedback_anonymous_token_grants.sql`](migrations/20260518130000_feedback_anonymous_token_grants.sql)). Anonymous feedback is not linked to your account on `feedback_events`, but qualifying anonymous submissions still credit bonus tokens to the signed-in submitter.
1. `trim(category)` is non-empty.
2. `additional_info->'badges'` is a JSON **array** with **length ≥ 1**.
3. `trim(additional_info->>'comment')` has length **≥ 30** characters.

**Grant row:**

- `tokens` = **1000**
- `grant_date_utc` = `(timezone('utc', NEW.reported_at))::date`
- **Idempotency:** `ON CONFLICT (feedback_event_id) DO NOTHING`

**Important:** The browser enforces the same rules in [`Feedback.tsx`](../browser/base/content/assistant/ui-preact/src/components/Feedback.tsx) via `FEEDBACK_MIN_DETAIL_CHARS` (**30**) in [`trainingRewards.ts`](../browser/base/content/assistant/ui-preact/src/utils/trainingRewards.ts). If you change the minimum length or token amount **in SQL**, update those constants (and user copy) in the same change.

### RPC: `public.sum_feedback_bonus_tokens_for_user(p_user_id uuid) → bigint`

- **`STABLE`**, **`SECURITY DEFINER`**, `search_path = public`
- Returns **`coalesce(sum(tokens), 0)`** for `p_user_id` where `grant_date_utc = (timezone('utc', now()))::date` (today UTC).
- **Privileges:** `EXECUTE` granted to **`service_role` only** (not `authenticated`), so only trusted backends should call it with an explicit user id.

Use this from **Lambda / Edge / service role** when computing the user’s **effective daily token cap**:

`effective_daily_token_limit = base_daily_token_limit + sum_feedback_bonus_tokens_for_user(user_id)`

(and the same idea for **remaining**, using your existing usage counters).

## Quota API (Lambda)

The assistant client **adds** today’s bonus sum to the displayed daily cap in [`subscription.ts`](../browser/base/content/assistant/build/src/services/subscription.ts). If your API still enforces **only** the base plan limit, users will see extra headroom in the UI but may still hit **`daily_limit_exceeded`** from the backend.

**Action:** When checking or returning `quota.daily_limit` / `quota.daily_remaining`, include the same bonus total as Supabase (via `sum_feedback_bonus_tokens_for_user` or equivalent SQL against `feedback_token_grants`).

See also the JSDoc on `QuotaResult` in [`proxyClient.ts`](../browser/base/content/assistant/build/src/proxyClient.ts).

## Verification

After deploy:

```sql
-- Table and policies exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'feedback_token_grants';

-- Trigger on feedback_events
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.feedback_events'::regclass AND NOT tgisinternal;

-- Function callable as service_role (from app, not anon key)
-- SELECT public.sum_feedback_bonus_tokens_for_user('<user_uuid>'::uuid);
```

**Functional test (staging):**

1. Insert a row into `feedback_events` as an authenticated user (via the app) with valid `category`, `badges` array, and comment length ≥ 30.
2. Expect one row in `feedback_token_grants` for that `feedback_event_id` with `tokens = 1000` and `grant_date_utc` = today UTC.
3. Repeat insert attempt with the same event id (should not happen in normal flow); unique constraint / `ON CONFLICT` prevents double grant.
4. Submit feedback with short comment via API bypassing UI: **no** grant row.

## Changing bonus amount or rules

- **Token amount (1000):** update the `INSERT` in `try_grant_feedback_tokens_from_event` and the default on the table if desired; keep **`FEEDBACK_BONUS_TOKENS`** in the client aligned.
- **Minimum comment length (30):** update both the trigger and **`FEEDBACK_MIN_DETAIL_CHARS`**.
- **Eligibility rules:** keep trigger and `Feedback.tsx` validation in sync to avoid user confusion (saved feedback but no grant).
