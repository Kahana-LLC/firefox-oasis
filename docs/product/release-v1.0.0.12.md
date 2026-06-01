# Oasis release notes — v1.0.0.12

**Tag:** `v1.0.0.12`  
**Commit:** `8ecad89e5020`  
**Previous tag:** `v1.0.0.11` (`251353062942`)  
**Scope:** Product inventory for marketing and engineering; not end-user release notes.

---

## Summary

v1.0.0.12 ships the **enhanced telemetry** stack, **meta-prompting clarification**, **privacy-controlled assistant data collection** (anonymous by default), **training privacy modes**, **theme/design-token UI** for the assistant, and supporting Supabase migrations. CI publish-script fixes are included from the merge path but are not user-facing.

---

## Commits since v1.0.0.11

| Commit | Theme |
|--------|--------|
| `8ecad89` | Default `datareporting.healthreport.uploadEnabled` to **false** in `firefox.js` |
| `bab04ea` | Theme / design-token refactor (Preact UI components + bundles) |
| `e65d747` | Wire privacy pref to assistant telemetry; Oasis-only Data Collection UI |
| `b41fa560` | Meta-prompting: clarification classifier + modal |
| `bea8c634` | Merge `upstream/v1.0.0.11-fixes` into enhanced_telemetry branch |
| `bef4728cb70c` | Training privacy modes, token bar fixes, theme sync |
| `5c39c26e5b72` | Merge upstream/main into enhanced_telemetry |
| `7bad246ed85b` | **Enhanced Telemetry** (interaction_data, stream tool_trace, migrations) |
| `251353062942` | CI: register canary updates without rebuild |
| `fd6cd6e61cf3` | CI: canary-signing environment on publish job |

---

## User-visible themes

### 1. Enhanced interaction telemetry (Oasis)

- Per-assist rows in `llm_usage` with `interaction_id` and JSON `interaction_data` (prompt, response, tab context, tool trace, timing).
- Feedback can attach to the same interaction via `attach_feedback_to_interaction`.
- See [privacy-data-and-telemetry.md](privacy-data-and-telemetry.md).

### 2. Privacy — Personalize Oasis Assistant with my account

- Privacy & Security → **Oasis Data Collection and Use** shows a single Oasis-focused toggle when Mozilla Toolkit telemetry is not compiled in.
- **Unchecked (default):** anonymous telemetry (`user_id` null, no `user` block in JSON).
- **Checked:** identifiable telemetry linked to account for personalization.
- Pref: `datareporting.healthreport.uploadEnabled` (default `false` in [`browser/app/profile/firefox.js`](../../browser/app/profile/firefox.js)).

### 3. Meta-prompting / clarification

- Ambiguous user requests can trigger a **clarification modal** with 2–3 candidate interpretations before the assistant acts.
- Implementation: [`clarificationClassifier.ts`](../../browser/base/content/assistant/build/src/assistant/clarificationClassifier.ts), [`ClarificationModal.tsx`](../../browser/base/content/assistant/ui-preact/src/components/ClarificationModal.tsx).

### 4. Training and feedback privacy

- Thumbs up/down training supports **anonymous** vs **personalized** modes on `feedback_events`.
- Token grants for qualifying personalized training submissions.
- See [training-and-feedback.md](training-and-feedback.md).

### 5. Assistant UI theme

- Design-token styling for voice aura, confirmation modal, chat history popover, settings menu, and related CSS.
- Does not change assistant command surface area.

### 6. Browser privacy (inherited Firefox)

- No new Oasis-authored ad-blocking code in this tag; Oasis builds on Firefox **Enhanced Tracking Protection** and strict cookie defaults already in profile.
- See [browser-privacy-security.md](browser-privacy-security.md).

---

## Supabase migrations (new in this release path)

| Migration | Purpose |
|-----------|---------|
| `20260512120000_interaction_telemetry.sql` | `interaction_id`, `interaction_data` on `llm_usage`; link on `feedback_events` |
| `20260514120000_attach_feedback_function.sql` | RPC to merge feedback into `interaction_data` |
| `20260517120000_user_personalized_training_pref.sql` | `users.opt_in_personalized_training` (legacy column; UI now uses browser pref) |
| `20260517130000_grant_users_select.sql` | Grants for user profile reads |
| `20260518120000_feedback_training_mode.sql` | `training_mode` on `feedback_events`; anonymous inserts |
| `20260518120000_get_opt_in_function.sql` | RPC `get_personalized_training_opt_in` (superseded by browser pref for telemetry) |
| `20260518130000_feedback_anonymous_token_grants.sql` | Anonymous training token grant rules |
| `20260519120000_llm_usage_anonymous_telemetry.sql` | Nullable `user_id`; RLS for anonymous inserts |

Deploy all migrations before relying on anonymous `llm_usage` inserts in production.

---

## Files changed (high level)

~54 files, +2573 / −415 lines vs `v1.0.0.11`. Largest areas:

- `browser/base/content/assistant/` (core, UI, bundles)
- `browser/components/preferences/` (privacy UI)
- `supabase/migrations/`
- `browser/app/profile/firefox.js` (default pref)

---

## Related docs

- [oasis-capability-index.md](oasis-capability-index.md)
- [../marketing/b2c-magical-gifts-mapping.md](../marketing/b2c-magical-gifts-mapping.md)
- [../../b2c-narrative-spine.md](../../b2c-narrative-spine.md) (story; §4 gifts)
