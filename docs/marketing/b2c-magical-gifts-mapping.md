# B2C magical gifts — product mapping (v1.0.0.12)

**Purpose:** Fill [b2c-narrative-spine.md](../../b2c-narrative-spine.md) §4 gap table with honest **obstacle → capability → old world → new world** pairs.

**Product evidence:** [docs/product/oasis-capability-index.md](../product/oasis-capability-index.md)

**Rules (from spine):** One gift removes one obstacle. Observable contrast. Legal review before production ads.

---

## Summary table

| # | Obstacle | Status | Product capability | Legal review |
|---|----------|--------|-------------------|--------------|
| 1 | Contacts/payments in profile | **partial** | Firefox ETP + strict cookies (not a dedicated fix) | Yes |
| 2 | Linked AI telemetry | **shipped** | Oasis data collection toggle + anonymous default | Yes |
| 3 | Follow-you ads | **partial** | Firefox Enhanced Tracking Protection | Yes |
| 4 | Tab chaos / calm browse | **shipped** | Oasis Assistant tools + sidebar UI | Moderate |
| 5 | Deep work stolen | **partial** | Summarize, search, clarification, voice | Moderate |
| 6 | Research-to-draft / copy-paste tax | **planned** | Research brief from tab group (MVP spec) | Yes |

---

## Gift 1 — Contacts / payments pulled into browser profile

**Emotional job:** “I can work without feeding my address book to ads.”

**Status:** `partial` — reduces cross-site tracking; does **not** prove contacts never enter a browser-linked profile.

**Product capability:**

- [browser-privacy-security.md](../product/browser-privacy-security.md) — ETP, `network.cookie.cookieBehavior` tracker rejection, fingerprinting protection
- No Oasis v1.0.0.12 feature that specifically prevents contact/financial autofill from being used for ad profiling

**Old world → new world:**

> *Old:* Every site and tracker can stitch your browsing to identity crumbs until ads feel like they read your contacts.  
> *New:* Oasis builds on Firefox protections that block many trackers and tighten third-party cookies—so less of your browsing leaks into the ad swarm (not a guarantee your address book stays out of every profile).

**Evidence for §5:** Firefox ETP settings screenshot; third-party cookie stat (must be sourced); avoid unsourced “contacts safe” claims.

**Checklist hooks:** `mn-winners-chrome-02`, `mn-gifts-chrome-01`

**Gap note:** Do not market as fully solved until a dedicated product story exists or legal approves narrow claim.

---

## Gift 2 — Linked AI telemetry (Gemini-in-Chrome class trap)

**Emotional job:** “AI helps without the default pipeline.”

**Status:** `shipped` (Oasis assistant telemetry; not third-party Chrome)

**Product capability:**

- [privacy-data-and-telemetry.md](../product/privacy-data-and-telemetry.md)
- Privacy → **Personalize Oasis Assistant with my account** (`datareporting.healthreport.uploadEnabled`)
- Default **unchecked:** anonymous `llm_usage` (no `user_id`, no email in JSON)
- Opt-in **checked:** identifiable rows for personalization

**Old world → new world:**

> *Old:* The assistant sends every prompt and tab context tied to your account by default.  
> *New:* Oasis logs interaction data to improve the product—but **you choose**: anonymous by default, or link it to your account when you want deeper personalization.

**Evidence for §5:** Privacy settings screenshot (unchecked default); Supabase row sample redacted (anonymous vs identified); in-app copy under toggle. User-facing narrative source: [oasis-your-data-and-training.md](../product/oasis-your-data-and-training.md).

**Checklist hooks:** `mn-change-chrome-03`, `mn-gifts-chrome-02`

**Legal:** Disclose that anonymous mode still uploads prompt/response/tab context without account linkage. Do not claim “no data collected.”

---

## Gift 3 — Ads follow you after a private search

**Emotional job:** “My browser stops watching me.”

**Status:** `partial` — Firefox ETP; not full retargeting elimination

**Product capability:**

- [browser-privacy-security.md](../product/browser-privacy-security.md) — Enhanced Tracking Protection (Standard/Strict/Custom)
- Tracker cookie behavior in Oasis Firefox profile

**Old world → new world:**

> *Old:* You search once in private, then ads chase you across the web.  
> *New:* Oasis uses Firefox’s built-in tracking protection to block many cross-site trackers—so fewer ads can follow the trail you leave (site breakage possible on Strict).

**Evidence for §5:** ETP on screenshot; before/after tracker count (Firefox marketing assets or licensed stat); PH video narrative `mn-ph-chrome-07`.

**Legal:** Do not promise “no follow-you ads.” Use “fewer trackers” / “blocks known trackers.”

---

## Gift 4 — Noisy default vs calm, attention-protecting browse

**Emotional job:** “I can think in the tab bar again.”

**Status:** `shipped` (assistant + organization tools; calm UI)

**Product capability:**

- [ai-assistant.md](../product/ai-assistant.md) — tab groups, organize windows, split view, semantic search, clarification
- Theme/design-token sidebar UI (v1.0.0.12)
- Plain-English commands instead of manual tab hunting

**Old world → new world:**

> *Old:* You hunt through noisy tabs and guess what the browser heard.  
> *New:* You tell Oasis what you want in plain English—it clarifies when needed, groups and finds tabs for you, and keeps the assistant surface calm while you stay in flow.

**Evidence for §5:** PH header / screenshots `mn-ph-chrome-06`; screen recording of tab group + clarify flow; side-by-side default browser tab strip vs organized.

**Legal:** Moderate — demo actual features shown.

---

## Gift 5 — Deep work stolen (§1 consequence)

**Emotional job:** “I can finish what I came to do.”

**Status:** `partial` — workflow aid, not guaranteed focus mode

**Product capability:**

- `summarize_page`, `search_memory`, `search_history` — [ai-assistant.md](../product/ai-assistant.md)
- Clarification reduces wrong turns
- Voice for hands-busy workflows
- ETP reduces distraction (weaker link)

**Old world → new world:**

> *Old:* You open the browser to finish one thing and leave with ten tabs and nothing done.  
> *New:* Oasis helps you stay on intent—summarize the page you’re on, find what you already had open, and confirm what you meant before it runs the wrong action.

**Evidence for §5:** User story / Lena arc; timed task demo (optional); softer than gifts 2–4.

**Legal:** Avoid “guaranteed deep work” or productivity % claims.

---

## Gift 6 — Research-to-draft without copy-paste (planned)

**Emotional job:** “I can turn my open research into a draft spine without feeding every tab to a separate AI.”

**Status:** `planned` — MVP spec only; not shipped in v1.0.0.12

**Product capability:**

- [research-brief-mvp.md](../product/research-brief-mvp.md) — tab-group-scoped **Research Brief**: outline, themes, sourced quotes
- Builds on local PageExtractor read + remote Oasis synthesis (`build_research_brief` command, phased delivery)
- Complements Gift 5 (`summarize_page` is single-tab; this is multi-tab writer workflow)

**Old world → new world:**

> *Old:* You open ten articles, copy snippets into a doc, and paste URLs into ChatGPT one by one—hoping nothing sensitive leaks.  
> *New:* You group your research tabs, ask Oasis for a **research brief**, and get an outline with quotes and links—pages read on your device, synthesis under assistant privacy controls you already chose.

**Evidence for §5:** Screen recording: tab group → “Build research brief” → Markdown outline with blockquotes; privacy disclosure screenshot (local read vs network synthesis). Ship only after P2 UX exists.

**Legal:** Do not claim “nothing leaves your machine” or “fully local AI.” Disclose network synthesis and anonymous-by-default logging per [oasis-your-data-and-training.md](../product/oasis-your-data-and-training.md). Legal review required before ads.

**Gap note:** Keep in REFUGE tease until P2 ships; update capability index row from `planned` to `shipped` or `partial` when code lands.

**Other Gift 6 candidates (deferred):** Railroad / long-session memory; on-device history embeddings story; VPN / Kahana products.

---

## Alignment with spine §4 prompts

1. **Each obstacle** has a capability pointer and status.  
2. **§5 evidence** ideas listed per gift.  
3. **Gift 2** is the primary Oasis-differentiated telemetry story for v1.0.0.12.  
4. **Gifts 1 and 3** lean on Firefox-inherited protections—label honestly in launch copy.  
5. Update checklist task instructions (`mn-gifts-chrome-*`) in a follow-up PR; this file is the source of truth until then.

---

## What stays in §3 REFUGE (tease only)

Marketing-only lines without a shipped gift stay in REFUGE tease until product truth exists—per spine rules. Do not move “browser works only for you” into §4 without legal + product sign-off ([product-hunt-brief-01](../../product-hunt-brief-01-privacy-angle.md) is launch-asset voice).
