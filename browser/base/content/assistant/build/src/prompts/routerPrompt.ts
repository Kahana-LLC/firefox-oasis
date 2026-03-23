/**
 * Router system prompt — guides the LLM's command selection.
 *
 * Sent to the remote Assist API when the supervisor needs to decide
 * which command to run. Tells the LLM to pick one command from the
 * available list and return it with JSON args. Includes heuristics
 * like preferring search_history for browsing history queries,
 * open_url for explicit URLs, and web_search for text queries.
 */
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
    "For list/show requests, prefer list_* tools and avoid search_memory unless user explicitly asks to search.",
    "For local find/search requests over tabs/bookmarks/folders, prefer search_memory with folder/source args.",
    "For browsing history queries (pages visited, articles read, sites browsed), prefer search_history which uses AI semantic search.",
    "For add/remove/delete/move requests, prefer mutation tools and keep destructive actions explicit.",
    "Prefer open_url for explicit URLs/domains and web_search for plain-language queries.",
    "For follow-ups like 'open it' after search results, prefer open_search_result with index (default 1).",
    "If the user asks to inspect previous search results, use get_recent_search_results.",
    "For ambiguous destructive/container targets, prefer safe commands like resolve_ambiguity instead of guessing.",
  ].join(" ");
}
