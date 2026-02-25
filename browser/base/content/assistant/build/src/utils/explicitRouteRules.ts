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

function extractIndices(input: string): number[] {
  return (input.match(/\d+/g) || [])
    .map(v => Number(v))
    .filter(v => Number.isFinite(v) && v > 0);
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

function numberArg(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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
    next: "open_search_result",
    reason: "explicit-open-search-result",
    resolve: input => {
      const match = input.match(
        /(?:open|go\s+to)\s+(?:the\s+)?(?:search\s+)?result(?:\s+url)?\s+(?<url>https?:\/\/[^\s]+|[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?)/i
      );
      const url = match?.groups?.url?.trim();
      return url ? { url } : null;
    },
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
    next: "move_tab_to_new_window",
    reason: "explicit-move-tab-new-window",
    resolve: input => {
      const match = input.match(
        /(?:move)\s+(?:the\s+)?(?:current\s+)?tab(?:\s+(?<index>\d+))?\s+to\s+(?:a\s+)?new\s+window/i
      );
      if (!match) {
        return null;
      }
      const index = numberArg(match.groups?.index);
      return index != null ? { index } : {};
    },
  },
  {
    next: "close_tab",
    reason: "explicit-close-tab",
    resolve: input => {
      const match = input.match(
        /close\s+(?:the\s+)?(?:current\s+)?tab(?:\s+(?<index>\d+))?/i
      );
      if (!match) {
        return null;
      }
      const index = numberArg(match.groups?.index);
      return index != null ? { index } : {};
    },
  },
  {
    next: "remove_tab_from_group",
    reason: "explicit-remove-tab-from-group",
    resolve: input => {
      const match = input.match(
        /(?:remove|ungroup)\s+(?:the\s+)?(?:this\s+|current\s+|active\s+)?tab(?:\s+(?<index>\d+))?\s+from\s+(?:its\s+)?(?:tab\s+)?group/i
      );
      if (!match) {
        return null;
      }
      const index = numberArg(match.groups?.index);
      return index != null ? { index } : {};
    },
  },
  {
    next: "remove_tab_from_bookmark_folder",
    reason: "explicit-remove-tab-from-folder",
    resolve: input => {
      const match = input.match(
        /(?:remove|delete)\s+(?:this\s+)?(?:tab\s+)?from\s+(?:my\s+)?(?:the\s+)?(?:bookmark\s+)?folder\s+"?(?<name>[\w\s]+?)"?\s*$/i
      );
      const name = match?.groups?.name?.trim();
      return name ? { name } : null;
    },
  },
  {
    next: "split_tabs",
    reason: "explicit-split-tabs",
    resolve: input => {
      const match = input.match(/split\s+tabs?\s+(?<indices>[\d,\sand]+)/i);
      const indicesRaw = match?.groups?.indices;
      if (!indicesRaw) {
        return null;
      }
      const indices = extractIndices(indicesRaw);
      return indices.length >= 2 ? { indices } : null;
    },
  },
  {
    next: "add_split_view",
    reason: "explicit-add-split-view-two-tabs",
    resolve: input => {
      const match =
        input.match(
          /(?:split|splitview|add)\s+(?:tabs?\s+)?(?<a>\d+)\s+(?:and|,|with)\s+(?:tab\s+)?(?<b>\d+)/i
        ) ||
        input.match(
          /(?:add\s+)?tabs?\s+(?<a>\d+)\s+(?:and|,|with)\s+(?:tab\s+)?(?<b>\d+)\s+(?:to\s+)?(?:split\s*view|splitview)/i
        );
      const a = numberArg(match?.groups?.a);
      const b = numberArg(match?.groups?.b);
      return a != null && b != null ? { indices: [a, b] } : null;
    },
  },
  {
    next: "remove_split_view",
    reason: "explicit-remove-split-view",
    resolve: input =>
      /(?:remove|disable|close)\s+split\s*view|unsplit\s+(?:tabs?|view)?/i.test(
        input
      )
        ? {}
        : null,
  },
  {
    next: "add_split_view",
    reason: "explicit-add-split-view",
    resolve: input => {
      if (
        !/(?:add|create|enable)\s+split\s*view|split\s+(?:this\s+)?(?:tab|view)/i.test(
          input
        )
      ) {
        return null;
      }
      const withTabMatch = input.match(/(?:with|and)\s+(?:tab\s+)?(?<index>\d+)/i);
      const withIndex = numberArg(withTabMatch?.groups?.index);
      if (withIndex != null) {
        return { withIndex };
      }
      const withQueryMatch = input.match(
        /(?:with|and)\s+(?:the\s+)?"?(?<query>[^"\d][^"]+?)"?\s*(?:tab)?$/i
      );
      const withQuery = withQueryMatch?.groups?.query?.trim();
      return withQuery ? { withQuery } : {};
    },
  },
  {
    next: "summarize_page",
    reason: "explicit-summarize-current-tab",
    resolve: input =>
      /summarize\s+(?:the\s+)?(?:current|this|active)\s+tab/i.test(input)
        ? {}
        : null,
  },
  {
    next: "summarize_page",
    reason: "explicit-summarize-tab-index",
    resolve: input => {
      const match =
        input.match(/summarize\s+(?:the\s+)?tab\s+(?<index>\d+)/i) ||
        input.match(/summarize\s+(?:the\s+)?(?:first|1st)\s+tab/i);
      if (!match) {
        return null;
      }
      const index = numberArg(match.groups?.index) ?? 1;
      return { index };
    },
  },
  {
    next: "summarize_page",
    reason: "explicit-summarize-tab-query",
    resolve: input => {
      const match = input.match(
        /summarize\s+(?:the\s+)?"?(?<query>[^"\d][^"]+?)"?\s*tab/i
      );
      const query = match?.groups?.query?.trim();
      if (!query || /^(?:current|this|active)$/i.test(query)) {
        return null;
      }
      return { query };
    },
  },
  {
    next: "summarize_page",
    reason: "explicit-summarize-page",
    resolve: input =>
      /summarize\s+(?:this\s+)?(?:page|article|website|site)?|(?:what\s+is|tell\s+me\s+about)\s+this\s+(?:page|article|website|site)|give\s+(?:me\s+)?(?:a\s+)?summary/i.test(
        input
      )
        ? {}
        : null,
  },
  {
    next: "create_bookmark_folder",
    reason: "explicit-create-folder-with-current",
    resolve: input => {
      const match = input.match(
        /(?:create|make|new)\s+(?:a\s+)?(?:new\s+)?(?:bookmark\s+)?folder\s+(?:called\s+|named\s+)?"?(?<name>[\w\s]+?)"?\s+and\s+(?:add|save|include|put)\s+(?:the\s+)?(?:current|this|active)\s+tab/i
      );
      const name = match?.groups?.name?.trim();
      return name ? { name, include: "current" } : null;
    },
  },
  {
    next: "create_bookmark_folder",
    reason: "explicit-create-folder-with-all",
    resolve: input => {
      const match = input.match(
        /(?:create|make|new)\s+(?:a\s+)?(?:new\s+)?(?:bookmark\s+)?folder\s+(?:called\s+|named\s+)?"?(?<name>[\w\s]+?)"?\s+and\s+(?:add|save|include|put)\s+(?:all)\s+tabs/i
      );
      const name = match?.groups?.name?.trim();
      return name ? { name, include: "all" } : null;
    },
  },
  {
    next: "create_bookmark_folder",
    reason: "explicit-create-folder",
    resolve: input => {
      const match = input.match(
        /(?:create|make|new)\s+(?:a\s+)?(?:new\s+)?(?:bookmark\s+)?folder\s+(?:called\s+|named\s+)?"?(?<name>[\w\s]+?)"?\s*$/i
      );
      const name = match?.groups?.name?.trim();
      return name ? { name } : null;
    },
  },
  {
    next: "delete_bookmark_folder",
    reason: "explicit-delete-folder",
    resolve: input => {
      const match = firstMatch(input, [
        /(?:delete|remove)\s+(?:the\s+)?(?:bookmark\s+)?folder\s+"?(?<name>[\w\s]+?)"?\s*$/i,
        /(?:delete|remove)\s+(?:the\s+)?"?(?<name>[\w\s]+?)"?\s+(?:bookmark\s+)?folder/i,
      ]);
      const name = match?.groups?.name?.trim();
      return name ? { name } : null;
    },
  },
  {
    next: "list_bookmark_folders",
    reason: "explicit-list-folders",
    resolve: input =>
      /list\s+(?:all\s+)?(?:my\s+)?(?:bookmark\s+)?folders/i.test(input)
        ? {}
        : null,
  },
  {
    next: "rename_bookmark_folder",
    reason: "explicit-rename-folder",
    resolve: input => {
      const match = input.match(
        /rename\s+(?:the\s+)?(?:bookmark\s+)?folder\s+"?(?<from>[\w\s]+?)"?\s+(?:to|as)\s+"?(?<to>[\w\s]+?)"?\s*$/i
      );
      const from = match?.groups?.from?.trim();
      const to = match?.groups?.to?.trim();
      return from && to ? { from, to } : null;
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
    next: "delete_tab_group",
    reason: "explicit-delete-group",
    resolve: input => {
      const match = firstMatch(input, [
        /(?:delete|remove)\s+(?:tab\s+)?group\s+"?(?<name>[^"\n]+?)"?\s*$/i,
        /(?:delete|remove)\s+(?:the\s+)?"?(?<name>[^"\n]+?)"?\s+(?:tab\s+)?group/i,
      ]);
      const name = match?.groups?.name?.trim();
      return name ? { name } : null;
    },
  },
  {
    next: "create_tab_group",
    reason: "explicit-create-group",
    resolve: input => {
      const match = input.match(
        /(?:create|make|new)\s+(?:a\s+)?(?:new\s+)?(?:tab\s+)?(?:group|gorup)\s+(?:called\s+|named\s+)?"?(?<name>.+)$/i
      );
      if (!match?.groups?.name) {
        return null;
      }

      let name = match.groups.name.trim();
      let openUrl: string | undefined;

      const openInIt = name.match(
        /\s+and\s+(?:open|go\s+to)\s+(.+?)\s+(?:in\s+it|in\s+the\s+group|in\s+that\s+group|there)$/i
      );
      if (openInIt?.[1]) {
        openUrl = openInIt[1].trim();
        name = name.replace(/\s+and\s+(?:open|go\s+to)\s+.+$/i, "").trim();
      }

      name = name.replace(/\s+and\s+(?:add|open|put)\s+.+$/i, "").trim();
      name = name
        .replace(/\s+(?:with|using|from|for)\s+.*$/i, "")
        .replace(/["']/g, "")
        .trim();

      if (!name) {
        return null;
      }

      const args: RouteArgs = { name };
      if (openUrl) {
        args.openUrl = openUrl;
      }
      const indicesMatch = input.match(
        /(?:with\s+)?tabs?\s+([\d,\s]+(?:and\s+\d+)?)/i
      );
      if (indicesMatch?.[1]) {
        const indices = extractIndices(indicesMatch[1]);
        if (indices.length > 0) {
          args.indices = indices;
        }
      }
      return args;
    },
  },
  {
    next: "list_tab_groups",
    reason: "explicit-list-groups",
    resolve: input =>
      /list\s+(?:all\s+)?(?:tab\s+)?groups?/i.test(input) ? {} : null,
  },
  {
    next: "rename_tab_group",
    reason: "explicit-rename-group",
    resolve: input => {
      const match = input.match(
        /rename\s+(?:tab\s+)?group\s+"?(?<from>[\w\s]+?)"?\s+(?:to|as)\s+"?(?<to>[\w\s]+?)"?\s*$/i
      );
      const from = match?.groups?.from?.trim();
      const to = match?.groups?.to?.trim();
      return from && to ? { from, to } : null;
    },
  },
  {
    next: "open_tab",
    reason: "explicit-open-tab",
    resolve: input => {
      const match = input.match(
        /open\s+(?:a\s+)?(?:new\s+)?tab\s+(?:to\s+|with\s+)?"?(?<url>[^\s"']+)"?/i
      );
      const url = match?.groups?.url?.trim();
      return url ? { url } : null;
    },
  },
  {
    next: "open_tab",
    reason: "open-url-like",
    resolve: (input, lower) => {
      if (!/^open\s+/i.test(lower)) {
        return null;
      }
      const url = firstUrlLike(input);
      return url ? { url } : null;
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
