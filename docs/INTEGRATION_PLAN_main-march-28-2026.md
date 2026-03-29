# Integration plan: `main-march-28-2026`

Step-by-step plan to integrate feature branches into a single integration branch before a future merge to `main`. Execute phases in order; complete verification checkpoints before moving on.

## Goal

Produce branch **`main-march-28-2026`** (based on **`origin/main`**) that combines:

| Branch | Purpose |
|--------|---------|
| **`semantic-search-history`** | Semantic history search (assistant + embeddings + Orama, urlbar-related work as on branch) |
| **`oauth-login-integration`** | OAuth / assistant auth handoff, onboarding, sidebar and related UI |
| **`fix/llm-usage-classification-metadata`** | Command classification analytics + stream fix so `llm_usage` gets `command_type` / `user_intent` |

Later, other branches can merge into the same integration branch; final merge to **`main`** is out of scope for the initial integration work.

---

## Context: how these branches relate to `main`

- **`semantic-search-history`** and **`fix/llm-usage-classification-metadata`** (via **`analytics_classification`**) share merge-base **`7ca1251c820e`** with current **`origin/main`** — they forked from the same tip.
- **`oauth-login-integration`** has merge-base **`a0e8a021…`** with **`main`** — it diverged earlier; merging it brings OAuth work **and** requires reconciling with everything on **`main`** since that point.

### High-overlap files (expect merge conflicts)

**`oauth-login-integration` and `semantic-search-history`** both touch (vs `main`):

- `browser/base/content/assistant/assistant.bundle.js`
- `browser/base/content/assistant/assistant.ui.js`
- `browser/base/content/assistant/build/src/assistant.ts`
- `browser/base/content/assistant/build/src/services/localMemory.ts`
- `browser/base/content/assistant/build/src/services/supabase.ts`

**Classification / stream fix** also overlaps **`assistant.ts`**, **`assistant.bundle.js`**, and (with semantic branch) **`graph.ts`**, **`stream.ts`**, **`messageUtils.ts`**, **`chatPrompt.ts`**, **`subscription.ts`**, **`proxyClient.ts`**, **`routingUtils.ts`**, etc.

---

## Recommended merge order

1. **`semantic-search-history`** first — largest assistant feature delta; establishes baseline on current `main`.
2. **`oauth-login-integration`** second — layer OAuth/onboarding; resolve assistant overlaps in favor of **both** behaviors where possible.
3. **`fix/llm-usage-classification-metadata`** last — thin analytics + **stream consumer** fix on top; resolve **`graph` / `stream` / prompts** while keeping semantic search + OAuth.

---

## Phase 0 — Preconditions

- [ ] Working tree clean on the branch you use for fixes (`git status`).
- [ ] **`fix/llm-usage-classification-metadata`**: any **stream / bundle** work is **committed** (not only stashed). If you used stash `WIP stream fix before integration branch`, run:
  - `git checkout fix/llm-usage-classification-metadata`
  - `git stash list` → `git stash pop` if needed
  - Rebuild assistant bundle (`cd browser/base/content/assistant/build && npm run build`)
  - Commit with a clear message (e.g. `fix(stream): preserve usage meta for llm_usage classification`).
- [x] **`origin/main`** fetched: `git fetch origin main`.

**Checkpoint:** `fix/llm-usage-classification-metadata` has the stream fix as at least one commit ahead of `analytics_classification` / `main` as appropriate.

---

## Phase 1 — Integration branch present and checked out

- [ ] `git checkout main-march-28-2026`
- [ ] Confirm tip matches integration intent: `git log -1 --oneline` should be the same as **`origin/main`** until merges start (e.g. `7ca1251c820e` or newer if `main` moved).
- [x] Optional: push the branch to remote when ready:
  - `git push -u origin main-march-28-2026`

**Checkpoint:** On `main-march-28-2026`, clean `git status` (except intentional untracked files).

---

## Phase 2 — Merge `semantic-search-history`

- [x] `git merge semantic-search-history`  
  (use `git merge origin/semantic-search-history` if you only track remote.)
- [x] Resolve conflicts (expect assistant + possibly jar/build files).
- [x] Rebuild assistant: `cd browser/base/content/assistant/build && npm install && npm run build`
- [x] Full browser build: `./mach build`
- [ ] Smoke: `./mach run --temp-profile` — open assistant, exercise a flow that touches **semantic history** if applicable.

**Checkpoint:** Build succeeds; semantic search behavior still plausible in a quick manual pass.

---

## Phase 3 — Merge `oauth-login-integration`

- [x] `git merge oauth-login-integration`
- [x] Resolve conflicts, prioritizing:
  - Keep **OAuth / session / onboarding** flows from OAuth branch.
  - Keep **semantic search** wiring from Phase 2 (commands, services, bundle imports).
- [x] Rebuild assistant bundle after resolving `assistant` sources.
- [x] `./mach build`
- [ ] Smoke: sign-in, onboarding if applicable, assistant opens, basic chat.

**Checkpoint:** Auth and onboarding acceptable; assistant still runs; no obvious regressions from Phase 2.

---

## Phase 4 — Merge `fix/llm-usage-classification-metadata`

- [x] `git merge fix/llm-usage-classification-metadata`
- [x] Resolve conflicts in **`graph.ts`**, **`stream.ts`**, **`messageUtils.ts`**, **`chatPrompt.ts`**, **`subscription.ts`**, etc.:
  - Preserve **structured `command_type` / `user_intent`** from classification work.
  - Preserve **`getMessagesAndStepFromStreamState`** / **`oasisUsageMeta`** handling from the stream fix.
  - Preserve **semantic-search** and **OAuth** behavior from Phases 2–3.
- [x] `cd browser/base/content/assistant/build && npm run build`
- [x] `./mach build`
- [ ] Smoke: signed-in user sends a chat turn; confirm **`llm_usage`** row has non-null **`command_type`** / **`user_intent`** (or `"other"` if model falls back), not consistently `null`.

**Checkpoint:** Classification metadata reaches Supabase when authenticated; stream path not broken.

---

## Phase 5 — Consolidation and quality

- [x] `./mach lint` on touched paths (or repo policy equivalent).
- [x] `./mach format` if required by project workflow.
- [x] Document any **manual merge decisions** (file + one-line rationale) in commit messages or a short `docs/` note if needed for reviewers.
- [ ] Optional: `./mach test --auto` or targeted tests per team practice.

**Checkpoint:** CI-ready branch; team agrees integration branch is the source for further merges.

---

## Phase 6 — Later work (not part of initial three merges)

- [ ] Merge **additional** feature branches into **`main-march-28-2026`** using the same pattern: merge → resolve → rebuild assistant if needed → `./mach build` → smoke.
- [ ] Open PR: **`main-march-28-2026` → `main`** when ready.
- [ ] Final review: changelog / release notes for OAuth, semantic search, and analytics classification.

---

## Merge decisions log (`main-march-28-2026`)

Short notes for reviewers; full history is in merge commits on `main-march-28-2026`.

| Area | Decision |
|------|-----------|
| **`assistant.ts`** | Kept semantic modular graph (`buildAssistantGraph`); added `oasisSetOAuthCallbackBaseUrl` / `oasisGetOAuthCallbackBaseUrl` on `assistantWindow`. |
| **`supabase.ts`** | OAuth branch flows (launcher URLs, `trackSessionForUser`, multi-provider) with semantic-style `assistantLogger` usage and `.js` imports. |
| **`localMemory.ts`** | Semantic branch (full semantic history / embedding stack). |
| **Preact `App.tsx`** | Semantic `useAuthSync` architecture; removed duplicate OAuth `useEffect` from OAuth branch. |
| **`Auth.tsx`** | Forgot-password and OAuth button flows from OAuth branch; typed `SupabaseAuthLike` and submit handling. |
| **`assistant.ui.js`** | OAuth branch (cookie/storage handoff, callback base URL shims). |
| **`assistant.bridge.js`** | Normalize URL scheme for `openTab`; trusted-window fallbacks; no stray debug logs. |
| **`browser-sidebar.js`** | Semantic Oasis overlay / toggle behavior; omit OAuth-only debug `console.log`. |
| **`FeatureCalloutMessages.sys.mjs`** | OAuth branch (e.g. onboarding trigger wiring, icon path). |
| **`CFRMessageProvider.sys.mjs`** | Whitespace-only delta vs other side; kept existing behavior. |
| **`browser/components/moz.build`** | Dropped duplicate `oasiswelcome` in `DIRS` after merge. |
| **`fix/llm-usage-classification-metadata`** | Clean merge; Prettier on touched assistant TS and rebuild `assistant.bundle.js` afterward. |
| **Artifacts** | Left `mach_profile_run.cProfile` out of the OAuth merge commit (matches `*.cProfile` in `.gitignore`). |

---

## Conflict resolution cheatsheet

| Area | Guidance |
|------|----------|
| **`assistant.bundle.js`** | Avoid hand-merging huge diffs; resolve **TypeScript**, then **`npm run build`**. |
| **`assistant.ts` / `assistant.ui.js`** | Merge **imports and initialization** so both OAuth and semantic features register. |
| **`graph.ts`** | Combine **router/tools** from semantic + OAuth with **JSON schema / `parseChatEnvelope`** from classification. |
| **`stream.ts`** | Keep **values-mode message extraction** + **early `oasisUsageMeta` capture** from the fix branch. |
| **`supabase.ts` / `localMemory.ts`** | Prefer **OAuth branch** session/storage expectations unless semantic branch **must** extend APIs; then merge both behaviors explicitly. |

---

## Rollback

- Before pushing: `git reset --hard` to the last good commit on `main-march-28-2026`.
- After pushing: revert merge commits or use a new integration branch from last known-good state.

---

## Reference commands (copy-paste)

```bash
git fetch origin
git checkout main-march-28-2026

git merge semantic-search-history
# resolve, then:
cd browser/base/content/assistant/build && npm run build && cd -
./mach build

git merge oauth-login-integration
# resolve, rebuild assistant, ./mach build

git merge fix/llm-usage-classification-metadata
# resolve, rebuild assistant, ./mach build
```

---

**Last updated:** 2026-03-28 (plan aligned with branch `main-march-28-2026` and branches `semantic-search-history`, `oauth-login-integration`, `fix/llm-usage-classification-metadata`).
