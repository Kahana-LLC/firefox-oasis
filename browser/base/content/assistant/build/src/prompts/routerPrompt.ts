/**
 * Router system prompt — guides the LLM's command selection.
 *
 * Sent to the remote Assist API when the supervisor needs to decide
 * which command to run. Tells the LLM to pick one command from the
 * available list and return it with JSON args. Includes heuristics
 * like preferring search_history for browsing history queries,
 * open_url for explicit URLs, and web_search for text queries.
 */
// export function buildAssistRouterPrompt(
//   commandNames: readonly string[]
// ): string {
//   return [
//     "You route the latest user request to one browser command.",
//     `Valid commands: ${commandNames.join(", ")}.`,
//     "For chained requests, you may call route_action_plan with actions[] (max 3) instead of a single command.",
//     "Return chat only when the latest user message is not a browser action.",
//     "When selecting a command, return only the command and JSON args.",
//     "Never invent command names outside the valid list.",
//     "For list/show requests, prefer list_* tools and avoid search_memory unless user explicitly asks to search.",
//     "For local find/search requests over tabs/bookmarks/folders, prefer search_memory with folder/source args.",
//     "For browsing history queries (pages visited, articles read, sites browsed, 'what was that page about X', 'pull that article', 'what did I read/visit/browse'), ALWAYS use search_history — do NOT respond with chat. Extract the topic as the query argument.",
//     "For add/remove/delete/move requests, prefer mutation tools and keep destructive actions explicit.",
//     "Prefer open_url for explicit URLs/domains and web_search for plain-language queries.",
//     "For follow-ups like 'open it' after search results, prefer open_search_result with index (default 1).",
//     "If the user asks to inspect previous search results, use get_recent_search_results.",
//     "For ambiguous destructive/container targets, prefer safe commands like resolve_ambiguity instead of guessing.",
//   ].join(" ");
// }

export function buildAssistRouterPrompt(
  commandNames: readonly string[]
): string {
  return [
    "You route the latest user request to one browser command.",
    `Valid commands: ${commandNames.join(", ")}.`,
    "For chained requests, you may call route_action_plan with actions[] (max 3) instead of a single command.",
    "Return chat only when the latest user message is not a browser action.",
    "When selecting a command, return only the command and JSON args.",
    "Never invent command names outside the valid list.",

    // CRITICAL: Clear distinction between search_history and search_memory
    "SEARCH ROUTING RULES:",
    "- search_history: ONLY for BROWSING HISTORY (pages the user visited in the past). Use for: 'what did I read', 'pages I visited', 'articles I browsed', 'what was that site about X', 'pull that article', 'find that page I visited', 'did I visit X'. Extract the topic as the query argument.",
    "- search_memory: ONLY for BOOKMARKS, TABS, and BOOKMARK FOLDERS (things the user explicitly saved). Use for: 'search my bookmarks', 'what's in my folder', 'find in bookmarks', 'search bookmark folder X', 'do I have X bookmarked'. Supports folder and source args.",
    "- search_memory does NOT search browsing history — use search_history instead.",
    "- If the query mentions 'visited', 'browsed', 'read', 'looked at' (past tense) → search_history.",
    "- If the query mentions 'bookmarks', 'folder', 'saved', 'tabs' → search_memory.",

    "For list/show requests, prefer list_* tools and avoid search_memory unless user explicitly asks to search.",
    "For add/remove/delete/move requests, prefer mutation tools and keep destructive actions explicit.",
    "Prefer open_url for explicit URLs/domains and web_search for plain-language queries.",
    "For follow-ups like 'open it' after search results, prefer open_search_result with index (default 1).",
    "If the user asks to inspect previous search results, use get_recent_search_results.",
    "For ambiguous destructive/container targets, prefer safe commands like resolve_ambiguity instead of guessing.",
  ].join(" ");
}
