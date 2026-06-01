# Training and feedback

**Version:** v1.0.0.12 (`8ecad89`)  
**Provenance:** Oasis-shipped (assistant UI + Supabase)

**See also (user-facing):** [oasis-your-data-and-training.md](oasis-your-data-and-training.md)

---

## Overview

Users can improve Oasis by submitting **training** from assistant replies (thumbs up/down + optional comment and badges). Training is separate from but **linkable** to interaction telemetry via `interaction_id`.

---

## User-facing flows

| Flow | Where | What happens |
|------|-------|----------------|
| Thumbs on reply | Chat timeline | Opens feedback modal; ties to `interaction_id` when available |
| General feedback | Composer / settings | Tally form link (`https://tally.so/r/3jkNN6`) |
| Training gallery | Assistant UI | Progress, badges, token bonus messaging |
| Capabilities overview | In-chat digest | Links to Kahana features page + feedback |

---

## Training modes

Type: [`TrainingMode`](../../browser/base/content/assistant/ui-preact/src/utils/trainingMode.ts) = `"anonymous"` | `"personalized"`

| Mode | `feedback_events.user_id` | Typical use |
|------|---------------------------|-------------|
| **personalized** | authenticated user ID | Signed-in training; eligible for token grants |
| **anonymous** | `NULL` | Training without account linkage on the event row |

Controlled in [`Feedback.tsx`](../../browser/base/content/assistant/ui-preact/src/components/Feedback.tsx); DB constraint in [`20260518120000_feedback_training_mode.sql`](../../supabase/migrations/20260518120000_feedback_training_mode.sql).

**Do not conflate** with interaction telemetry anonymous/identified — same words, different tables:

- **Interaction telemetry:** `llm_usage` + `datareporting.healthreport.uploadEnabled`
- **Training submit:** `feedback_events.training_mode`

A user can have anonymous telemetry but personalized training (or vice versa) depending on each control.

---

## Link to interaction telemetry

When `interaction_id` is present on a feedback submit:

1. Row inserted into `feedback_events`
2. RPC `attach_feedback_to_interaction` merges a `feedback` block into `llm_usage.interaction_data`

Works for identified rows (`user_id = auth.uid()`) and anonymous telemetry rows (`user_id IS NULL`) per updated RPC.

---

## Token grants (personalized)

Qualifying personalized training can trigger **`feedback_token_grants`** (UTC day, Supabase).

Requirements (server trigger, see migration): signed-in user, personalized mode, category + badges + minimum comment length.

Client also tracks optimistic daily bonus in [`subscription.ts`](../../browser/base/content/assistant/build/src/services/subscription.ts) for the usage bar.

Handoff doc: [`supabase/FEEDBACK_TOKEN_GRANTS_HANDOFF.md`](../../supabase/FEEDBACK_TOKEN_GRANTS_HANDOFF.md)

---

## Related migrations

| Migration | Purpose |
|-----------|---------|
| `20260514120000_attach_feedback_function.sql` | Feedback → `interaction_data` |
| `20260518120000_feedback_training_mode.sql` | Anonymous vs personalized feedback |
| `20260518130000_feedback_anonymous_token_grants.sql` | Grant rules for anonymous path |

---

## Marketing guardrails

- Training improves the product; it is not the same as “selling data.”
- Anonymous training does not include email on `feedback_events`; personalized training does.
- Token bonus copy is product-facing; confirm grant rules before promising specific amounts in ads.
