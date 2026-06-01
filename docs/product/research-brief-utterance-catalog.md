# Research Brief — utterance catalog

**Status:** Living document for deterministic routing and QA  
**Implementation:** [`researchBriefUtterances.ts`](../../browser/base/content/assistant/build/src/utils/researchBriefUtterances.ts), [`researchBriefExplicitResolver.ts`](../../browser/base/content/assistant/build/src/utils/researchBriefExplicitResolver.ts)  
**Automated matrix:** [`researchBriefUtteranceFixtures.ts`](../../browser/base/content/assistant/build/tests/researchBriefUtteranceFixtures.ts) (run via `npm run test:research-brief-utterances`)

---

## Routing policy

### Route to `build_research_brief`

1. **Strong product signal:** `research brief`, `(research )?brief`, or synonym noun (report, digest, outline, …) **with multi-tab scope**.  
2. **Multi-tab synthesis verbs:** consolidate, synthesize, compile, merge, combine, distill + scope (tab group, window, named tabs, across this group).  
3. **Multi-tab summarize:** `summarize` + scope implying multiple tabs (tab group, across this group, all tabs in …) — one brief, not N× `summarize_page`.

### Do not route to brief

- Single-tab: `summarize this page/tab`, `summarize tab 3`.  
- Mutations: `create tab group`, `close tab`.  
- Noun-only without scope: `give me a summary`.  
- Window-wide summarize without group: `summarize all my tabs` (no group anchor → not brief in v1).  
- List-only: `what tabs are open`.

### Edge cases (v1 decisions)

| Phrase | Route | Notes |
|--------|-------|-------|
| `summarize all my tabs` | not brief | No tab-group/window anchor; avoid hijacking list/mutation |
| `give me a summary` | not brief | Ambiguous; needs scope |
| Tab group named `research` | brief | Use dedicated `draft an outline` pattern if generic `PRODUCT_START` conflicts |

---

## Dimension taxonomy

| Dimension | Role in routing |
|-----------|-----------------|
| Product nouns | Gate + `PRODUCT_START` regex |
| Action verbs | `VERB_PREFIX` (create, build, draft, …) |
| Synthesis verbs | `SYNTHESIS_START` patterns |
| Summarize family | Multi-tab summarize patterns (not `summarize_page`) |
| Scope markers | Required for ambiguous nouns; drives `hasMultiTabScope()` |
| Topic | `on/about/for` segments; else `infer_topic_from_content` |

---

## Catalog rows (representative set)

Schema: **phrase** | **expected** | **args (high level)** | **notes**

### Product name — research brief / brief

| phrase | expected | args | notes |
|--------|----------|------|-------|
| Build a research brief on AI privacy tools from tab group AI Privacy | brief | topic, name=AI Privacy | Canonical MVP |
| create a research brief based on tab group sports | brief | name=sports, infer topic | |
| research brief from tab group sports | brief | name=sports, infer topic | |
| create a brief based on this tab group | brief | use_active_tab_group, infer topic | Dogfood fix |
| research brief from this group | brief | use_active_tab_group | |
| build a research brief from my tab group | brief | use_active_tab_group | Obvious → skip meta-clarify |
| research brief from current tab group | brief | use_active_tab_group | |
| research brief for tab group sports | brief | name=sports, infer topic | |
| research brief on college football from tab group sports | brief | topic, name=sports | |
| Make me a research brief on GDPR from tab group Research | brief | topic, name | |

### Synonym nouns (scope required)

| phrase | expected | args | notes |
|--------|----------|------|-------|
| build a report from tab group sports | brief | name=sports, infer topic | report |
| generate a digest on college football from tab group sports | brief | topic, name=sports | digest |
| draft an outline from tab group research | brief | name=research, infer topic | Group name collision |
| prepare a briefing from tab group sports | brief | name=sports | briefing |
| write a memo from tab group sports | brief | name=sports | memo |
| create a write-up from tab group sports | brief | name=sports | write-up |
| build a dossier from tab group sports | brief | name=sports | dossier |
| give me a summary of tab group sports | brief | name=sports | summary + scope |
| give me a summary of this tab group | brief | use_active_tab_group | |

### Synthesis verbs

| phrase | expected | args | notes |
|--------|----------|------|-------|
| consolidate findings from this tab group | brief | use_active_tab_group | |
| synthesize findings from tab group sports | brief | name=sports | |
| compile research from my tab group sports | brief | name=sports | |
| merge findings across this tab group | brief | use_active_tab_group | across scope |
| combine tabs into one report from tab group sports | brief | name=sports | Partial; prefer shorter phrasing in tests |
| distill research from tab group sports | brief | name=sports | |

### Multi-tab summarize

| phrase | expected | args | notes |
|--------|----------|------|-------|
| summarize tabs in tab group sports | brief | name=sports | New policy |
| summarize tabs in sports group | brief | name=sports | Trailing "group" |
| summarize across this tab group | brief | use_active_tab_group | |
| summarize everything in my tab group sports | brief | name=sports | |
| summarize tab group sports | brief | name=sports | |
| summarize all tabs in tab group sports | brief | name=sports | |

### Scoped tabs / window

| phrase | expected | args | notes |
|--------|----------|------|-------|
| research brief from tabs ESPN, NFL | brief | scope=tabs, infer topic | |
| report on GDPR from tabs privacy law, EU regulation | brief | topic, tab_queries | |
| research brief from tabs 2, 3, and 5 | brief | tab_indices | |
| research brief from tab titled "Hacker News" | brief | tab_queries | |
| research brief from this window | brief | scope=window, infer topic | |
| research brief from tabs matching privacy | brief | tab_queries | |

### Exclusions (must not brief)

| phrase | expected | args | notes |
|--------|----------|------|-------|
| summarize this page | summarize_page | | Single tab |
| summarize this tab | summarize_page | | |
| summarize tab 2 | summarize_page | | |
| summarize all my tabs | not brief | | No scope anchor |
| give me a summary | not brief | | No scope |
| create a tab group sports | not brief | | Mutation |
| summarize tabs in sports group (legacy) | brief | | Was exclusion; now brief |

### Observed failures (fixed)

| phrase | was | now |
|--------|-----|-----|
| create a brief based on this tab group | mutation error | brief + active group |
| create a report / consolidate / summarize (group) | chat or mutation | brief when scoped |

---

## Extending the catalog

1. Add a row to this doc under the right dimension.  
2. Add a matching entry to `researchBriefUtteranceFixtures.ts` if it should be CI-enforced.  
3. If the phrase needs new regex, extend `RESEARCH_BRIEF_PATTERNS` in `researchBriefExplicitResolver.ts`.  
4. Run `npm run test:research-brief-utterances`.

---

## Related docs

- [research-brief-mvp.md](./research-brief-mvp.md) — product spec and entry points  
- [research-brief-mvp.md §3](./research-brief-mvp.md) — clarification and quota UX
