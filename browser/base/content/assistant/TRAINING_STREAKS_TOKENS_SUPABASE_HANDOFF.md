# Training streaks and token rewards: Supabase handoff

Engineering brief for moving training streaks, badge progression, and training-linked token grants off the client and onto Supabase (and any billing / usage service).

## Current client behavior (Firefox assistant UI)

- **Training submit:** Successful insert into `feedback_events` (existing table) triggers `recordTrainingSubmission()` in [`ui-preact/src/utils/trainingProgress.ts`](ui-preact/src/utils/trainingProgress.ts).
- **Persistence today:** Progress is stored in **browser `localStorage`** under key `oasis_training_progress_v1` via `TrainingProgressStore` (`load` / `save`). The module is written so a **Supabase-backed store** can replace `localTrainingProgressStore` without changing milestone math in the UI layer.
- **State surfaced in UI:** `App.tsx` keeps `trainingProgress` in React state, updated from `onTrainingSubmitted` after each successful training. **Training gallery** (mascot) calls `loadTrainingProgress()` when opened, so it can look stale if local writes fail, caches differ, or multiple profiles/devices are used.
- **Token messaging:** Copy references a configurable bonus (`TRAINING_BONUS_COMMANDS` in [`ui-preact/src/utils/trainingRewards.ts`](ui-preact/src/utils/trainingRewards.ts)) and opens [Oasis pricing](https://kahana.co/oasis-pricing). **No server credit is applied yet**; messaging is product-facing only until an API exists.

## Why Supabase

- Streaks and token balances should be **authoritative on the server**, tied to `user_id`, resilient across devices, and auditable.
- **Tokens** (AI command allowance) should reconcile with subscription / entitlements and daily or monthly caps as product defines them.

## Product rules (reference)

- **Streak:** At least one saved training per **local calendar day** counts toward the streak; missing a day resets current streak. Multiple trainings the same day increase **total trainings** but do not increase streak length for that day.
- **Training bonus:** Each qualifying training grants a small **bonus** toward the user’s **daily** AI command allowance (exact amount and cap TBD with billing).
- **Badges:** Milestone-based levels (streak and submission tracks) as in `TRAINING_BADGES` / `STREAK_MILESTONES` / `SUBMISSION_MILESTONES` in `trainingProgress.ts` (tunable server-side).

## Suggested data model (draft for discussion)

Design is intentionally minimal; adjust to your existing auth and usage tables.

### Option A: Dedicated profile row per user

Table e.g. `user_training_profile`:

| Column | Notes |
|--------|--------|
| `user_id` | PK, FK to auth.users |
| `total_trainings` | Count of credited training events |
| `current_streak_days` | Derived or updated on each event |
| `longest_streak_days` | Max of historical streak |
| `last_training_date` | Date key `YYYY-MM-DD` in user’s timezone or UTC policy |
| `badge_levels` | JSONB mirroring `badgeLevels` or normalized child table |
| `updated_at` | |

### Option B: Event log + materialized view

- Append-only `training_credit_events` (or extend `feedback_events` with server-side triggers): `user_id`, `feedback_event_id`, `credited_at`, `bonus_commands_granted`, `date_key` used for streak.
- Nightly or on-write aggregation into `user_training_profile` for fast reads.

### Token / usage

- Prefer **one source of truth** for “commands remaining today” (existing usage service if any).
- Training bonus should **increment** a balance or reduce “consumed today” via a single transactional RPC, e.g. `apply_training_bonus(user_id, feedback_event_id)` to avoid double-credit.

## Server integration points

1. **On successful `feedback_events` insert:** Edge function, DB trigger, or app server validates the row and calls logic to update streak profile and grant bonus commands (idempotent on `feedback_event_id`).
2. **Client read:** Gallery and post-submit UI should fetch profile (and optional “trainings today”) from Supabase instead of `localStorage`, or merge server state as canonical.
3. **Client write:** Stop treating `localStorage` as authoritative; optionally keep a **cache** for offline UX with explicit “syncing” state.

## Client changes (follow-up PR)

- Implement `TrainingProgressStore` (or parallel loader) that reads/writes via Supabase.
- After training success, use **server-returned** streak and balance in `onTrainingSubmitted` payload where possible.
- Call `subscriptionService?.forceRefresh` (or equivalent) when the backend returns an updated allowance.
- Align copy with actual policy (daily vs monthly caps) from API.

## Telemetry (already in client)

Non-breaking events: `training_progress_updated`, `training_badge_unlocked`, `training_gallery_opened`, plus existing `feedback_*`. Consider server-side events for `training_bonus_applied` and streak transitions when Supabase owns state.

## Open questions for tomorrow’s session

1. Timezone for `date_key`: user locale, account setting, or UTC only?
2. Idempotency: one bonus per `feedback_event_id`?
3. Relationship between **pricing page** tiers and daily command caps vs training bonus caps.
4. Whether badge definitions live in code, remote config, or DB.
