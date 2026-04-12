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

function firstMatch(input: string, patterns: RegExp[]): RegExpMatchArray | null {
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
    resolve: input => (/\bcopy\s+(?:all\s+)?tab\s+urls?\b/i.test(input) ? {} : null),
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
      /\b(?:show|check|view)\s+(?:my\s+)?subscription\b/i.test(input) ? {} : null,
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
  // ─────────────────────────────────────────────────────────────────────────
  // BROWSING HISTORY SEARCH (search_history)
  // Matches queries about pages the user VISITED (not bookmarked)
  // Examples: "what did I read about X", "find that article I visited"
  // ─────────────────────────────────────────────────────────────────────────
  {
    next: "search_history",
    reason: "explicit-history-search",
    resolve: input => {
      const patterns: Array<{ re: RegExp; queryGroup?: string }> = [
        { re: /(?:what|which)\s+(?:was|were|is)\s+that\s+(?<query>.+?)\s+(?:i\s+was|i've\s+been|i\s+have\s+been)\s+(?:reading|looking\s+at|browsing|viewing)/i },
        { re: /(?:pull|get|find|show)\s+(?:up\s+)?(?:me\s+)?(?:that\s+)?(?:page|article|site)\s+(?:about|on|regarding)\s+(?<query>.+?)(?:\s+(?:from|in)\s+(?:my\s+)?history)?$/i },
        { re: /(?:pull|get|find|show|look)\s+(?:up\s+)?(?:for\s+)?(?:me\s+)?(?<query>.+?)\s+(?:from|in)\s+(?:my\s+)?(?:browsing\s+)?history/i },
        { re: /(?:can\s+you\s+)?(?:pull|get|find|show|look)\s+(?:up\s+)?(?:for\s+)?(?:me\s+)?(?<query>.+?)\s+(?:from|in)\s+(?:my\s+)?(?:browsing\s+)?history/i },
        { re: /(?:search|find|look\s*up)\s+(?:my\s+)?(?:browsing\s+)?history\s+(?:for|about)\s+(?<query>.+)/i },
        { re: /(?:i\s+was\s+(?:reading|looking\s+at|browsing|viewing))\s+(?:something|a\s+page|an?\s+article|a\s+site)\s+(?:about|on|regarding)\s+(?<query>.+)/i },
        { re: /what\s+(?:pages?|sites?|articles?)\s+(?:have\s+i|did\s+i|i)\s+(?:visited?|read|browsed?|looked?\s+at|viewed?|seen)\s+(?:about|on|regarding)\s+(?<query>.+?)(?:\s+(?:recently|earlier|before|previously|yesterday))?$/i },
        { re: /what\s+(?:did\s+i|have\s+i)\s+(?:visit|read|browse|look\s+at|view)\s+(?:about\s+)?(?<query>.+?)(?:\s+(?:recently|earlier|before|previously|yesterday))?$/i },
        { re: /what\s+(?:pages?|sites?|articles?)\s+(?:have\s+i|did\s+i)\s+(?:visited?|read|browsed?|viewed?|seen)(?:\s+(?:recently|earlier|before|previously|yesterday))?$/i, queryGroup: "recent browsing history" },
      ];
      for (const { re, queryGroup } of patterns) {
        const match = input.match(re);
        if (match) {
          const query = match.groups?.query?.trim() || queryGroup || "";
          if (query) return { query };
        }
      }
      if (/\b(?:my|the)\s+(?:browsing\s+)?history\b/i.test(input)) {
        const cleaned = input
          .replace(/^(?:can\s+you\s+)?(?:search|find|look\s*(?:up|for)?|show|pull\s*up?|get)\s+/i, "")
          .replace(/\s+(?:from|in)\s+(?:my\s+)?(?:browsing\s+)?history\b.*/i, "")
          .replace(/\s*(?:my|the)\s+(?:browsing\s+)?history\s*/i, "")
          .replace(/^(?:for|about|on|regarding)\s+/i, "")
          .trim();
        return { query: cleaned || "recent browsing history" };
      }
      return null;
    },
  },
//   {
//     next: "search_history",
//     reason: "explicit-history-search",
//     resolve: input => {
//       const patterns: Array<{ re: RegExp; queryGroup?: string }> = [
//         { re: /(?:what|which)\s+(?:was|were|is)\s+that\s+(?<query>.+?)\s+(?:i\s+was|i've\s+been|i\s+have\s+been)\s+(?:reading|looking\s+at|browsing|viewing)/i },
//         { re: /(?:pull|get|find|show)\s+(?:up\s+)?(?:me\s+)?(?:that\s+)?(?:page|article|site)\s+(?:about|on|regarding)\s+(?<query>.+?)(?:\s+(?:from|in)\s+(?:my\s+)?history)?$/i },
//         { re: /(?:pull|get|find|show|look)\s+(?:up\s+)?(?:for\s+)?(?:me\s+)?(?<query>.+?)\s+(?:from|in)\s+(?:my\s+)?(?:browsing\s+)?history/i },
//         { re: /(?:can\s+you\s+)?(?:pull|get|find|show|look)\s+(?:up\s+)?(?:for\s+)?(?:me\s+)?(?<query>.+?)\s+(?:from|in)\s+(?:my\s+)?(?:browsing\s+)?history/i },
//         { re: /(?:search|find|look\s*up)\s+(?:my\s+)?(?:browsing\s+)?history\s+(?:for|about)\s+(?<query>.+)/i },
//         { re: /(?:i\s+was\s+(?:reading|looking\s+at|browsing|viewing))\s+(?:something|a\s+page|an?\s+article|a\s+site)\s+(?:about|on|regarding)\s+(?<query>.+)/i },
//         { re: /what\s+(?:pages?|sites?|articles?)\s+(?:have\s+i|did\s+i|i)\s+(?:visited?|read|browsed?|looked?\s+at|viewed?|seen)\s+(?:about|on|regarding)\s+(?<query>.+?)(?:\s+(?:recently|earlier|before|previously|yesterday))?$/i },
//         { re: /what\s+(?:did\s+i|have\s+i)\s+(?:visit|read|browse|look\s+at|view)\s+(?:about\s+)?(?<query>.+?)(?:\s+(?:recently|earlier|before|previously|yesterday))?$/i },
//         { re: /what\s+(?:pages?|sites?|articles?)\s+(?:have\s+i|did\s+i)\s+(?:visited?|read|browsed?|viewed?|seen)(?:\s+(?:recently|earlier|before|previously|yesterday))?$/i, queryGroup: "recent browsing history" },
//       ];
//       for (const { re, queryGroup } of patterns) {
//         const match = input.match(re);
//         if (match) {
//           const query = match.groups?.query?.trim() || queryGroup || "";
//           if (query) return { query };
//         }
//       }
//       if (/\b(?:my|the)\s+(?:browsing\s+)?history\b/i.test(input)) {
//         const cleaned = input
//           .replace(/^(?:can\s+you\s+)?(?:search|find|look\s*(?:up|for)?|show|pull\s*up?|get)\s+/i, "")
//           .replace(/\s+(?:from|in)\s+(?:my\s+)?(?:browsing\s+)?history\b.*/i, "")
//           .replace(/\s*(?:my|the)\s+(?:browsing\s+)?history\s*/i, "")
//           .replace(/^(?:for|about|on|regarding)\s+/i, "")
//           .trim();
//         return { query: cleaned || "recent browsing history" };
//       }
//       return null;
//     },
//   },
// ];

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
