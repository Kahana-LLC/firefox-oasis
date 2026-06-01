# Oasis AI Assistant

**Version:** v1.0.0.12 (`8ecad89`)  
**Provenance:** Oasis-shipped

---

## Overview

The **Oasis Assistant** is a sidebar chat experience backed by a LangGraph agent, remote LLM routing (Gemini via Supabase Edge / proxy), and **52 browser tool commands** executed in the privileged browser context.

Entry: **View → Sidebar → Oasis Assistant** (pref `browser.sidebar.oasis_assistant.enabled`, default true).

---

## Capability tiers

| Tier | Description | Key files |
|------|-------------|-----------|
| **Routing** | Supervisor decides chat vs tool vs plan | `supervisorAssist.ts`, `graph.ts` |
| **Clarification** | Disambiguate ambiguous requests before acting | `clarificationClassifier.ts`, `ClarificationModal.tsx` |
| **Tools** | 52 commands (tabs, groups, bookmarks, search, page) | `commandsRegistry.ts`, `commands.ts` |
| **Voice** | Push-to-talk input; spoken or text-chat reply modes | `voiceAgent`, `voicePrompt.ts` |
| **Memory / search** | Semantic history search, bookmark/tab memory search | `search_memory`, `search_history` |
| **Session** | Turn history, railroad memory blocks (when enabled) | `session.ts`, `railroadMemory.ts` |
| **Limits** | Daily tokens, plan tiers, usage bar | `subscription.ts`, `proxyClient.ts` |
| **UI** | Preact sidebar, theme tokens (v1.0.0.12) | `ui-preact/` |

---

## v1.0.0.12 assistant highlights

1. **Meta-prompting clarification** — optional modal with 2–3 resolved interpretations for ambiguous prompts.
2. **Interaction telemetry** — see [privacy-data-and-telemetry.md](privacy-data-and-telemetry.md).
3. **Theme / design tokens** — calmer voice aura, modals, popovers (`bab04ea`).
4. **Capabilities overview** — in-chat markdown digest of tools ([`capabilitiesOverview.ts`](../../browser/base/content/assistant/build/src/assistant/capabilitiesOverview.ts)).

---

## Tool command catalog (52)

Source of truth: [`commandsRegistry.ts`](../../browser/base/content/assistant/build/src/assistant/commandsRegistry.ts). User-facing summaries are generated via `summarizeForUser()` in capabilities overview.

### Tabs and windows

| Command | User intent (summary) |
|---------|------------------------|
| `list_tabs` | List open tabs (optional scope: window, tab group, bookmark folder) |
| `open_url` | Open a URL in a tab |
| `web_search` | Web search query |
| `open_tab` | Legacy alias for open URL |
| `close_tab` | Close a tab by index |
| `reload_tab` | Reload a tab |
| `toggle_mute_tab` | Mute/unmute tab audio |
| `pin_tab` / `unpin_tab` | Pin or unpin a tab |
| `unload_tab` | Unload tab from memory |
| `new_tab_to_right` | Open new tab to the right of current |
| `duplicate_tab` | Duplicate a tab |
| `bookmark_tab` | Bookmark current tab |
| `move_tab_to_start` / `move_tab_to_end` | Reorder tab |
| `select_all_tabs` | Select all tabs in window |
| `close_duplicate_tabs` | Close duplicate tabs |
| `close_tabs_to_right` / `close_tabs_to_left` / `close_other_tabs` | Bulk close relative to a tab |
| `reopen_closed_tab` | Restore recently closed tab |
| `open_send_tab_to_device` | Send tab to another device |
| `open_tab_note` | Open tab note UI |
| `move_tab_to_new_window` | Move tab to new window |
| `copy_tab_urls` | Copy URLs from tabs |
| `new_window` | Open a new browser window |
| `organize_windows` | Organize windows (assistant-driven layout) |
| `show_url` | Show/navigate to URL |

### Split view

| Command | User intent |
|---------|-------------|
| `split_tabs` | Split view for tab indices |
| `add_split_view` | Add split view with optional second tab |
| `remove_split_view` | Remove split view |

### Tab groups

| Command | User intent |
|---------|-------------|
| `list_tab_groups` | List tab groups |
| `create_tab_group` | Create group from tabs |
| `delete_tab_group` | Delete a tab group |
| `add_tab_to_group` / `remove_tab_from_group` | Move tabs in/out of groups |
| `rename_tab_group` | Rename a group |

### Bookmarks

| Command | User intent |
|---------|-------------|
| `create_bookmark_folder` | Create bookmark folder |
| `delete_bookmark_folder` | Delete folder (with confirmation) |
| `list_bookmark_folders` | List folders |
| `rename_bookmark_folder` | Rename folder |
| `add_tab_to_bookmark_folder` / `remove_tab_from_bookmark_folder` | Add/remove tabs in folder |
| `open_bookmark_folder` | Open folder tabs in group or window |

### Search and page intelligence

| Command | User intent |
|---------|-------------|
| `search_memory` | Search memory (bookmarks/history embeddings) |
| `search_history` | Search or list browsing history |
| `get_recent_search_results` | Recent assistant search results |
| `open_search_result` | Open a prior search result |
| `summarize_page` | Summarize page content (optional query) |

### Meta / account

| Command | User intent |
|---------|-------------|
| `resolve_ambiguity` | Resolve ambiguous target (folder/group/tab) |
| `confirm_action` | Confirm destructive action |
| `show_subscription` | Show subscription / usage UI |

---

## Clarification flow (meta-prompting)

Before routing, an LLM classifier may return `need_clarification: true` with options `{ id, label, resolvedPrompt }`. The UI presents choices; the selected `resolvedPrompt` is sent as the user intent.

**Skips clarification** for clear commands (close tab, search X, open Y, greetings).

---

## Auth and availability

- Most cloud features require **Supabase sign-in**.
- Usage limits enforced via [`subscriptionService`](../../browser/base/content/assistant/build/src/services/subscription.ts) before runs.

---

## Build and test

```bash
cd browser/base/content/assistant/build && npm run build
cd ../ui-preact && npm run build
npm run test:capabilities-overview  # capabilities markdown tests
```

Packaged via `./mach build` per [BUILD_GUIDE.md](../../BUILD_GUIDE.md).

---

## External links (product)

- Features page: `https://kahana.co/features/oasis-assistant` (from `capabilitiesOverviewConstants.ts`)
- Feedback: `https://tally.so/r/3jkNN6`
