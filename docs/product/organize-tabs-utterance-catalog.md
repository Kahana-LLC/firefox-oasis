# Organize Tabs — utterance catalog

**Status:** Living document for deterministic routing and QA  
**Implementation:** [`organizeTabsUtterances.ts`](../../browser/base/content/assistant/build/src/utils/organizeTabsUtterances.ts), [`organizeTabsExplicitResolver.ts`](../../browser/base/content/assistant/build/src/utils/organizeTabsExplicitResolver.ts)  
**Automated matrix:** [`organizeTabsUtteranceFixtures.ts`](../../browser/base/content/assistant/build/tests/organizeTabsUtteranceFixtures.ts) (run via `npm run test:organize-tabs-utterances`)

---

## Routing policy

### Route to `organize_tabs`

1. **Organize verbs + tabs scope:** organize, group, sort, cluster, tidy, clean up + tabs / window / tab group  
2. **Focus extraction:** group tabs about/on/related to/for/regarding [topic]; polite wrappers (`can you…`, `please…`); typos (`reltated`); narrative (`all the tabs about X — group them`)  
3. **Research split:** separate/split/isolate + focus + from the rest / everything else / unrelated tabs  
4. **Narrative:** “I'm researching [topic] — group those tabs”

### Do not route to `organize_tabs`

| Phrase | Route instead |
|--------|----------------|
| `organize windows` | `organize_windows` |
| `create tab group called X` | `create_tab_group` |
| `add tabs about X to group Y` | `add_tab_to_group` |
| `build research brief from…` | `build_research_brief` |
| `what tabs are open` | `list_tabs` |

---

## Catalog rows (representative)

| Phrase | mode | focus / name | scope |
|--------|------|--------------|-------|
| Group all tabs related to LLM research | single_focus | focus=LLM research | window |
| can you group all tabs related to LLMs? | single_focus | focus=LLMs | window |
| group all tabs reltated to LLMs | single_focus | focus=LLMs | window |
| put all my LLM tabs together | single_focus | focus=LLM | window |
| all the tabs about transformers — group them | single_focus | focus=transformers | window |
| Organize my open tabs by topic | multi_topic | | window |
| Separate my LLM research from everything else | research_vs_other | focus=LLM research | window |
| Organize ungrouped tabs only | multi_topic | | ungrouped_only |
| Organize tabs in tab group Sports by topic | multi_topic | name=Sports | tab-group |
| Organize this tab group | multi_topic | use_active_tab_group | tab-group |
| Group tabs about pricing except tabs 2 and 5 | single_focus | focus=pricing | exclude_indices |

---

## Negative fixtures

- `organize windows` → `organize_windows`  
- `Create a tab group called Research` → `create_tab_group`  
- `Build a research brief from tab group sports` → not `organize_tabs`  
- `Add tabs about LLM to group Research` → not `organize_tabs`
