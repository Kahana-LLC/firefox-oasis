# Organize Tabs by Topic — MVP

**Status:** Shipped in assistant  
**Command:** `organize_tabs`  
**Utterance catalog:** [organize-tabs-utterance-catalog.md](organize-tabs-utterance-catalog.md)

---

## Summary

The Oasis assistant can scan open tabs in the current window (or a tab group), infer topics from titles, URLs, and optional page snippets, and create **tab groups** automatically — so research tabs stay contained while you switch to other work.

Example (Likhitha’s use case):

> “Group all tabs related to LLM research”

---

## Modes

| Mode | Intent | Example |
|------|--------|---------|
| `single_focus` | One topic → one new group; leave unrelated tabs alone | “Group tabs about transformers” |
| `multi_topic` | Discover several topic groups | “Organize my open tabs by topic” |
| `research_vs_other` | Binary split for context switching | “Separate my LLM research from everything else” |

Mode is inferred from phrasing when omitted (see utterance catalog).

---

## Privacy

Organize tabs uses the same Assist API path as other Oasis AI features. The browser sends a compact catalog of tab **titles**, **URLs**, and **short snippets** (for ambiguous pages only) to plan groupings. No grouping happens until you confirm when the preview gate applies.

See [oasis-your-data-and-training.md](oasis-your-data-and-training.md).

---

## Confirmation gates

1. **Preview** — when more than three tabs are affected, multiple groups are proposed, or tabs would move from existing groups.
2. **Cross-group move** — when tabs leave an existing tab group (same behavior as `create_tab_group`).

Pinned tabs are never grouped.

---

## Relationship to Research Brief

Natural two-step workflow:

1. **Organize:** “Group my LLM research tabs”
2. **Synthesize:** “Build a research brief from tab group LLM Research on fine-tuning”

See [research-brief-mvp.md](research-brief-mvp.md).

---

## Implementation map

| Area | Path |
|------|------|
| Command | [`OrganizeTabsCommand`](../../browser/base/content/assistant/build/src/commands.ts) |
| Service | [`organizeTabs.ts`](../../browser/base/content/assistant/build/src/services/organizeTabs.ts) |
| Routing | [`organizeTabsExplicitResolver.ts`](../../browser/base/content/assistant/build/src/utils/organizeTabsExplicitResolver.ts) |
| Tests | `npm run test:organize-tabs` in assistant build |
