/**
 * Tool result presenter — formats raw command output for display.
 *
 * Converts JSON tool output into user-friendly text:
 * - list_bookmark_folders: bullet list of folder names
 * - list_tab_groups: names with tab counts and collapsed state
 * - list_tabs: formatted titles and URLs
 * - search_memory/get_recent_search_results: structured results
 *
 * Called by the chat node before sending output to the user.
 */
import type { ToolResultPayload } from "./messageUtils.js";

type SearchResultRow = {
  index?: number;
  source?: string;
  title?: string;
  url?: string;
  context?: string;
  snippet?: string;
};

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(item => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function toObjectList<T extends Record<string, unknown>>(value: unknown): T[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    item => !!item && typeof item === "object" && !Array.isArray(item)
  ) as T[];
}

function formatLines(title: string, lines: string[]): string {
  if (lines.length === 0) {
    return title;
  }
  return `${title}\n\n${lines.map(line => `- ${line}`).join("\n")}`;
}

function formatListBookmarkFolders(message: string): string {
  const parsed = safeParseJson(message);
  const rows = toStringList(parsed);
  if (rows.length === 0) {
    return message;
  }
  return formatLines("I've found these bookmark folders for you:", rows);
}

function formatListTabGroups(message: string): string {
  const parsed = safeParseJson(message);
  const rows = toObjectList<{
    name?: unknown;
    tabCount?: unknown;
    collapsed?: unknown;
  }>(parsed);
  if (rows.length === 0) {
    return message;
  }

  const lines = rows.map(row => {
    const name = typeof row.name === "string" ? row.name : "(unnamed)";
    const tabCount =
      typeof row.tabCount === "number" && Number.isFinite(row.tabCount)
        ? row.tabCount
        : 0;
    const collapsed = row.collapsed === true ? "collapsed" : "expanded";
    return `${name} (${tabCount} tabs, ${collapsed})`;
  });
  return formatLines("Here are the tab groups you currently have open:", lines);
}

function extractJsonArrayTail(message: string): unknown {
  const colon = message.indexOf(":");
  if (colon < 0) {
    return null;
  }
  const tail = message.slice(colon + 1).trim();
  if (!tail.startsWith("[")) {
    return null;
  }
  return safeParseJson(tail);
}

function formatListTabs(message: string): string {
  const parsedTop = safeParseJson(message);
  const strings = toStringList(parsedTop);
  if (strings.length > 0) {
    return formatLines("Sure, here are your open tabs:", strings);
  }

  const tail = extractJsonArrayTail(message);
  const rows = toObjectList<{ title?: unknown; url?: unknown }>(tail);
  if (rows.length === 0) {
    return message;
  }

  const containerMatch = message.match(/^Tabs in ([^:]+):/i);
  const container = containerMatch?.[1]?.trim() || "the requested target";
  const lines = rows.map(row => {
    const title = typeof row.title === "string" ? row.title : "(untitled)";
    const url = typeof row.url === "string" ? row.url : "";
    return url ? `${title} (${url})` : title;
  });
  return formatLines(`I found these tabs in ${container}:`, lines);
}

function formatSearchResults(message: string): string {
  const parsed = safeParseJson(message) as {
    summary?: unknown;
    results?: unknown;
  } | null;
  if (!parsed || typeof parsed !== "object") {
    return message;
  }
  const summary =
    typeof parsed.summary === "string"
      ? parsed.summary.trim()
      : "I found these results for you:";
  const rows = toObjectList<SearchResultRow>(parsed.results).slice(0, 10);
  if (rows.length === 0) {
    return summary || message;
  }

  const lines = rows.map(row => {
    const index =
      typeof row.index === "number" && Number.isFinite(row.index)
        ? row.index
        : undefined;
    const title = typeof row.title === "string" ? row.title : "(untitled)";
    const url = typeof row.url === "string" ? row.url : "";
    const prefix = index != null ? `${index}. ` : "";
    return url ? `${prefix}${title} (${url})` : `${prefix}${title}`;
  });
  return formatLines(summary, lines);
}

type HistorySearchRow = {
  index?: number;
  title?: string;
  url?: string;
  relevance?: string;
  visited?: string;
  matchType?: string;
  excerpt?: string;
};

type HistoryRefinementPayload = {
  needsRefinement?: boolean;
  prompt?: string;
  preview?: HistorySearchRow[];
  totalMatches?: number;
  results?: HistorySearchRow[];
  note?: string;
};

function historyMatchLabel(matchType?: string): string {
  if (matchType === "title") {
    return " (title match)";
  }
  if (matchType === "url") {
    return " (URL match)";
  }
  if (matchType === "snippet") {
    return " (page text match)";
  }
  return "";
}

function formatHistorySearchRow(row: HistorySearchRow): string {
  const idx = typeof row.index === "number" ? `${row.index}. ` : "";
  const title = typeof row.title === "string" ? row.title : "(untitled)";
  const url = typeof row.url === "string" ? row.url : "";
  const relevance =
    typeof row.relevance === "string" ? ` (${row.relevance} match)` : "";
  const matchNote = historyMatchLabel(row.matchType);
  const excerpt =
    typeof row.excerpt === "string" &&
    row.excerpt &&
    row.matchType === "snippet"
      ? ` — "${row.excerpt}"`
      : "";
  const visited =
    typeof row.visited === "string" ? ` — visited ${row.visited}` : "";
  const label = matchNote || relevance;
  return url
    ? `${idx}[**${title}**](${url})${label}${excerpt}${visited}`
    : `${idx}**${title}**${label}${excerpt}${visited}`;
}

function formatHistorySearchResults(message: string): string {
  const parsed = safeParseJson(message);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const payload = parsed as HistoryRefinementPayload;
    if (payload.needsRefinement) {
      const prompt =
        typeof payload.prompt === "string"
          ? payload.prompt
          : "I found several history matches. Add a site, date, or extra keyword to narrow down.";
      const previewRows = toObjectList<HistorySearchRow>(payload.preview);
      const previewLines =
        previewRows.length > 0
          ? `\n\nExamples:\n\n${previewRows.map(formatHistorySearchRow).join("\n\n")}`
          : "";
      return `${prompt}${previewLines}`;
    }
    if (Array.isArray(payload.results)) {
      const lines = payload.results.map(formatHistorySearchRow);
      const note =
        typeof payload.note === "string" ? `\n\n${payload.note}` : "";
      return `I've looked through your history and found these matches:\n\n${lines.join("\n\n")}${note}`;
    }
  }

  const rows = toObjectList<HistorySearchRow>(parsed);
  if (rows.length === 0) {
    return message;
  }

  const lines = rows.map(formatHistorySearchRow);
  return `I've looked through your history and found these matches:\n\n${lines.join("\n\n")}`;
}

export function presentToolResult(payload: ToolResultPayload): string {
  const message = String(payload.message || "").trim();
  if (!message) {
    return "I've taken care of that for you.";
  }

  switch (payload.commandName) {
    case "list_bookmark_folders":
      return formatListBookmarkFolders(message);
    case "list_tab_groups":
      return formatListTabGroups(message);
    case "list_tabs":
      return formatListTabs(message);
    case "search_memory":
    case "get_recent_search_results":
      return formatSearchResults(message);
    case "search_history":
      return formatHistorySearchResults(message);
    default:
      return message;
  }
}
