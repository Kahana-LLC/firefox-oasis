/**
 * Explicit route rules — regex patterns for non-family-specific commands.
 *
 * Catches commands that don't fit neatly into list/search/mutation:
 * "open <url>", "new window", "copy tab urls", "show subscription",
 * "open bookmark folder X as tab group", etc.
 *
 * Each rule has a regex + arg extractor. Tried after family resolvers
 * fail. Called by decisionEngine.ts.
 */
import type { DeterministicRouteDecision, RouteArgs } from "./routerTypes.js";

type ExplicitRouteRule = {
  next: string;
  reason: string;
  resolve: (input: string, lower: string) => RouteArgs | null;
};

function toolDecision(
  next: string,
  reason: string,
  args: RouteArgs
): DeterministicRouteDecision {
  return { type: "tool", next, args, reason };
}

function firstUrlLike(input: string): string | null {
  const urlMatch = input.match(/\b(https?:\/\/[^\s]+)\b/i);
  if (urlMatch?.[1]) {
    return urlMatch[1].trim();
  }
  const domainMatch = input.match(/\b([a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?)\b/i);
  if (domainMatch?.[1]) {
    return domainMatch[1].trim();
  }
  return null;
}

function firstMatch(
  input: string,
  patterns: RegExp[]
): RegExpMatchArray | null {
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      return match;
    }
  }
  return null;
}

const EXPLICIT_ROUTE_RULES: ExplicitRouteRule[] = [
  {
    next: "copy_tab_urls",
    reason: "explicit-copy-tab-urls",
    resolve: input =>
      /\bcopy\s+(?:all\s+)?tab\s+urls?\b/i.test(input) ? {} : null,
  },
  {
    next: "new_window",
    reason: "explicit-new-window",
    resolve: input =>
      /^\s*(?:new\s+window|open\s+(?:a\s+)?new\s+window|create\s+(?:a\s+)?new\s+window|make\s+(?:a\s+)?new\s+window)\b/i.test(
        input
      )
        ? {}
        : null,
  },
  {
    next: "organize_windows",
    reason: "explicit-organize-windows",
    resolve: input => (/\borganize\s+windows?\b/i.test(input) ? {} : null),
  },
  {
    next: "show_subscription",
    reason: "explicit-show-subscription",
    resolve: input =>
      /\b(?:show|check|view)\s+(?:my\s+)?subscription\b/i.test(input)
        ? {}
        : null,
  },
  {
    next: "show_url",
    reason: "explicit-show-url",
    resolve: input => {
      const match = input.match(
        /(?:show|open)\s+url\s+(?<url>https?:\/\/[^\s]+|[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?)/i
      );
      const url = match?.groups?.url?.trim();
      return url ? { url } : null;
    },
  },
  {
    next: "open_bookmark_folder",
    reason: "explicit-open-folder-tabgroup",
    resolve: input => {
      const match = firstMatch(input, [
        /open\s+(?:the\s+)?(?:my\s+)?(?:bookmark\s+)?folder\s+"?(?<name>[\w\s]+?)"?\s+(?:(?:as|in)\s+(?:a\s+)?(?:new\s+)?tab\s*group)/i,
        /open\s+(?:my\s+)?"?(?<name>[\w\s]+?)"?\s+(?:bookmark\s+)?folder\s+(?:(?:as|in)\s+(?:a\s+)?(?:new\s+)?tab\s*group)/i,
      ]);
      const name = match?.groups?.name?.trim();
      return name ? { name, where: "tabgroup" } : null;
    },
  },
  {
    next: "open_bookmark_folder",
    reason: "explicit-open-folder-window",
    resolve: input => {
      const match = firstMatch(input, [
        /open\s+(?:the\s+)?(?:my\s+)?(?:bookmark\s+)?folder\s+"?(?<name>[\w\s]+?)"?\s+(?:in\s+(?:a\s+)?(?:new\s+)?window)/i,
        /open\s+(?:my\s+)?"?(?<name>[\w\s]+?)"?\s+(?:bookmark\s+)?folder\s+(?:in\s+(?:a\s+)?(?:new\s+)?window)/i,
      ]);
      const name = match?.groups?.name?.trim();
      return name ? { name, where: "window" } : null;
    },
  },
  {
    next: "open_bookmark_folder",
    reason: "explicit-open-folder",
    resolve: input => {
      const match = firstMatch(input, [
        /open\s+(?:the\s+)?(?:my\s+)?(?:bookmark\s+)?folder\s+"?(?<name>[\w\s]+?)"?\s*$/i,
        /open\s+(?:my\s+)?"?(?<name>[\w\s]+?)"?\s+(?:bookmark\s+)?folder\s*$/i,
      ]);
      const name = match?.groups?.name?.trim();
      return name ? { name } : null;
    },
  },
  {
    next: "open_url",
    reason: "explicit-open-url",
    resolve: input => {
      const match = input.match(
        /open\s+(?:a\s+)?(?:new\s+)?tab\s+(?:to\s+|with\s+)?"?(?<url>[^\s"']+)"?/i
      );
      const url = match?.groups?.url?.trim();
      return url ? { url } : null;
    },
  },
  {
    next: "open_url",
    reason: "open-url-like",
    resolve: (input, lower) => {
      if (!/^open\s+/i.test(lower)) {
        return null;
      }
      const url = firstUrlLike(input);
      return url ? { url } : null;
    },
  },
  {
    next: "web_search",
    reason: "open-query-as-search",
    resolve: input => {
      const match = input.match(
        /^open\s+(?:a\s+)?(?:new\s+)?tab\s+(?:for\s+|with\s+)?(?<query>.+)$/i
      );
      const query = match?.groups?.query?.trim();
      if (!query) {
        return null;
      }
      if (firstUrlLike(query)) {
        return null;
      }
      return { query };
    },
  },
];

export function resolveExplicitRoute(
  input: string
): DeterministicRouteDecision | null {
  const lower = input.toLowerCase();
  for (const rule of EXPLICIT_ROUTE_RULES) {
    const args = rule.resolve(input, lower);
    if (args) {
      return toolDecision(rule.next, rule.reason, args);
    }
  }
  return null;
}
