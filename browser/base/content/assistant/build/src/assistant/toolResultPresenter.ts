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
  return formatLines("Here are your bookmark folders:", rows);
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
  return formatLines("Here are your tab groups:", lines);
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
    return formatLines("Here are your open tabs:", strings);
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
  return formatLines(`Here are the tabs in ${container}:`, lines);
}

function formatSearchResults(message: string): string {
  const parsed = safeParseJson(message) as
    | {
        summary?: unknown;
        results?: unknown;
      }
    | null;
  if (!parsed || typeof parsed !== "object") {
    return message;
  }
  const summary =
    typeof parsed.summary === "string" ? parsed.summary.trim() : "Search results:";
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

export function presentToolResult(payload: ToolResultPayload): string {
  const message = String(payload.message || "").trim();
  if (!message) {
    return "Done.";
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
    default:
      return message;
  }
}
