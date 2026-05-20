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

function currentDateString(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function buildAssistRouterPrompt(
  commandNames: readonly string[]
): string {
  return [
    `Today is ${currentDateString()}.`,
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
    "- For `search history for [term]`, use search_history with query=[term] and mode=keyword.",

    "SITE-SPECIFIC NAVIGATION (MUST route to a command, NEVER respond with chat):",
    "- When the user wants to play, watch, or find a video on YouTube, route to play_video with the search query. Do NOT return chat.",
    "- When the user wants to find something on a specific site (e.g. Medium, Reddit, GitHub, Amazon, Wikipedia), route to open_url with that site's search URL. Do NOT return chat. Common patterns:",
    "  Medium: https://medium.com/search?q=<query>",
    "  Reddit: https://www.reddit.com/search/?q=<query>",
    "  GitHub: https://github.com/search?q=<query>",
    "  Amazon: https://www.amazon.com/s?k=<query>",
    "  Wikipedia: https://en.wikipedia.org/w/index.php?search=<query>",
    "- If the user says 'on YouTube/Medium/Reddit/etc.', ALWAYS route to the appropriate command. NEVER use web_search or chat for these.",

    "SPLIT VIEW:",
    "- When the user wants split view, side-by-side tabs, two tabs at once, or a split screen of two pages in one window, prefer add_split_view (not chat). Use indices: [i,j] for two tab numbers, withIndex or withQuery to pair the current tab with another, or {} to split the current tab with a new tab.",
    "- For removing split view or unsplitting, prefer remove_split_view.",

    "For list/show requests, prefer list_* tools and avoid search_memory unless user explicitly asks to search.",
    "For add/remove/delete/move requests, prefer mutation tools and keep destructive actions explicit.",
    "Prefer open_url for explicit URLs/domains and web_search for plain-language queries.",
    "For follow-ups like 'open it' after search results, prefer open_search_result with index (default 1).",
    "If the user asks to inspect previous search results, use get_recent_search_results.",
    "For ambiguous destructive/container targets, prefer safe commands like resolve_ambiguity instead of guessing.",
    "PAGE CONTEXT:",
    "- Use summarize_page for explicit summaries of the active page, such as 'summarize this page' or 'summarize this tab'.",
    "- Use summarize_page for active-page questions grounded in what is currently open, such as 'show me the price of this', 'what does this page say about refunds?', or 'based on this page, is this legit?'.",
    "- For summarize_page, put the user's page-grounded question or task into query. Only use index when the user explicitly points to a numbered tab. If index is omitted, the current active tab will be used.",
    "RESEARCH BRIEF (multi-tab):",
    "- Use build_research_brief when the user wants an outline, themes, and sourced quotes across multiple open tabs (tab group, named tabs, or window), not a single-page summary.",
    "- Args: topic (optional if infer_topic_from_content), infer_topic_from_content, scope (tab-group|window|tabs), name (tab group), tab_queries (title/URL keywords), tab_indices (1-based), outline_hint, max_tabs.",
    "- Set infer_topic_from_content when the user did not give a substantive topic or only named a short tab group label.",
    "- When the user says except/skip tabs: set exclude_indices (1-based positions within the group/window list) and/or exclude_queries (title/URL substrings, min 3 chars).",
    "- Do NOT use repeated summarize_page calls for multi-tab research; use build_research_brief once.",
    "- Examples: 'consolidate findings from this tab group', 'build a report from tab group Sports', 'summarize tabs in tab group sports', 'give me a summary of my tab group'.",
    "- Single-page only: 'summarize this page' or 'summarize tab 3' → summarize_page, not build_research_brief.",
    "ORGANIZE TABS:",
    "- Use organize_tabs when the user wants to group, sort, cluster, or organize open tabs by topic — not for research briefs or manual create_tab_group.",
    "- Args: mode (single_focus | multi_topic | research_vs_other), focus (topic), name (group label), scope (window | tab-group | tabs | ungrouped_only), use_active_tab_group, tab_queries, tab_indices, exclude_indices, exclude_queries.",
    "- single_focus: group tabs about one topic (e.g. 'Group all tabs related to LLM research', 'can you group tabs about OAuth?', 'group all tabs reltated to LLMs').",
    "- multi_topic: discover several topic groups (e.g. 'Organize my open tabs by topic', 'please tidy up my tabs').",
    "- research_vs_other: split focus work from the rest (e.g. 'Separate my LLM research from everything else').",
    "- Do NOT reply that you cannot group tabs — call organize_tabs with the best mode/focus args.",
    "- Do NOT use organize_tabs for 'organize windows' (use organize_windows) or 'create tab group called X' (use create_tab_group).",
  ].join(" ");
}
