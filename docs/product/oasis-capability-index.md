# Oasis capability index — v1.0.0.12

**Tag:** `v1.0.0.12` · **Commit:** `8ecad89e5020`  
**Purpose:** Hub for product, marketing, and engineering. Evidence-based inventory tied to the codebase.

---

## Document map

| Document | Contents |
|----------|----------|
| [release-v1.0.0.12.md](release-v1.0.0.12.md) | Commits, migrations, release themes |
| [oasis-your-data-and-training.md](oasis-your-data-and-training.md) | User-facing: local browsing, anonymous assistant data, training tokens |
| [privacy-data-and-telemetry.md](privacy-data-and-telemetry.md) | Data collection toggle, anonymous vs identified `llm_usage` |
| [ai-assistant.md](ai-assistant.md) | 52 tools, clarification, voice, limits, UI |
| [training-and-feedback.md](training-and-feedback.md) | Thumbs training, modes, token grants |
| [browser-privacy-security.md](browser-privacy-security.md) | Firefox ETP, cookies, inherited protections |
| [research-brief-mvp.md](research-brief-mvp.md) | Research brief from tab group (draft MVP spec) |
| [../marketing/b2c-magical-gifts-mapping.md](../marketing/b2c-magical-gifts-mapping.md) | §4 obstacles → gifts (marketing crosswalk) |
| [../../b2c-narrative-spine.md](../../b2c-narrative-spine.md) | Emotional B2C story (no feature dump) |

---

## Capability matrix

| Capability | Status | Provenance | Doc |
|------------|--------|------------|-----|
| Sidebar AI assistant (52 tools) | shipped | Oasis | [ai-assistant](ai-assistant.md) |
| Meta-prompting clarification modal | shipped | Oasis | [ai-assistant](ai-assistant.md) |
| Voice input (push-to-talk) | shipped | Oasis | [ai-assistant](ai-assistant.md) |
| Semantic / memory search | shipped | Oasis | [ai-assistant](ai-assistant.md) |
| Interaction telemetry (`interaction_data`) | shipped | Oasis | [privacy-data](privacy-data-and-telemetry.md) |
| User data & training overview | shipped | Oasis | [oasis-your-data-and-training](oasis-your-data-and-training.md) |
| Anonymous telemetry (default off opt-in) | shipped | Oasis | [privacy-data](privacy-data-and-telemetry.md) |
| Identified telemetry (opt-in) | shipped | Oasis | [privacy-data](privacy-data-and-telemetry.md) |
| Training thumbs + anonymous/personalized modes | shipped | Oasis | [training-and-feedback](training-and-feedback.md) |
| Feedback token grants | shipped | Oasis | [training-and-feedback](training-and-feedback.md) |
| Theme / design-token assistant UI | shipped | Oasis | [ai-assistant](ai-assistant.md) |
| Enhanced Tracking Protection | shipped | Firefox | [browser-privacy](browser-privacy-security.md) |
| Strict cookie / tracker defaults | shipped | Firefox (profile) | [browser-privacy](browser-privacy-security.md) |
| Fingerprinting / cryptomining blockers | shipped | Firefox | [browser-privacy](browser-privacy-security.md) |
| Contacts kept out of browser profile | **gap** | — | [gift mapping](../marketing/b2c-magical-gifts-mapping.md) |
| Block all retargeting ads | partial | Firefox ETP | [gift mapping](../marketing/b2c-magical-gifts-mapping.md) |
| Research brief from tab group | **planned** | Oasis (spec) | [research-brief-mvp](research-brief-mvp.md) |
| Mozilla Toolkit telemetry | N/A in build | — | Privacy UI hidden when `!MOZ_TELEMETRY_REPORTING` |

**Legend:** `shipped` = in v1.0.0.12 code path · `partial` = helps but does not fully solve obstacle · `gap` = not productized · `planned` = spec only, not in build

---

## Quick reference — user settings

| User question | Answer |
|---------------|--------|
| Where do I control assistant data? | Privacy → **Personalize Oasis Assistant with my account** |
| Default for new users? | **Unchecked** (anonymous telemetry) |
| Where is ad blocking? | Firefox **Enhanced Tracking Protection** (not a separate Oasis ad blocker) |
| How do I train the assistant? | Thumbs on replies; optional anonymous vs personalized training |
| How many browser actions can AI run? | **52** tool commands (see ai-assistant doc) |

---

## Validation checklist (docs)

- [x] Version stamped v1.0.0.12 / `8ecad89`
- [x] Oasis vs Firefox provenance separated
- [x] Anonymous telemetry still sends prompt/response/tab context (disclosed)
- [x] §4 obstacles mapped in marketing doc
- [x] Command count matches `commandsRegistry.ts` (52)

---

## Maintainers

When shipping v1.0.0.13+:

1. Update [release-v1.0.0.12.md](release-v1.0.0.12.md) or add `release-v1.0.0.13.md`
2. Patch domain docs and matrix rows
3. Reconcile [b2c-magical-gifts-mapping.md](../marketing/b2c-magical-gifts-mapping.md) statuses
