/**
 * Mutation explicit resolver — regex rules for destructive/creative commands.
 *
 * Array of regex patterns that extract args from mutation commands:
 * split tabs, close tab, create/delete/rename bookmark folders and
 * tab groups, move tab to window, remove split view, etc.
 *
 * Each rule produces { next, args } directly from named capture groups.
 * Called by manifestMutationResolver.ts.
 */
import type { DeterministicRouteDecision, RouteArgs } from "./routerTypes.js";

type MutationRoute = {
  next: string;
  reason: string;
  resolve: (input: string) => RouteArgs | null;
};

function toolDecision(
  next: string,
  reason: string,
  args: RouteArgs
): DeterministicRouteDecision {
  return { type: "tool", next, args, reason };
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

function numberArg(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractIndices(input: string): number[] {
  return (input.match(/\d+/g) || [])
    .map(value => Number(value))
    .filter(value => Number.isFinite(value) && value > 0);
}

const MUTATION_EXPLICIT_ROUTES: MutationRoute[] = [
  {
    next: "split_tabs",
    reason: "mutation-explicit-split-tabs",
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
    reason: "mutation-explicit-add-split-view-two-tabs",
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
    reason: "mutation-explicit-remove-split-view",
    resolve: input =>
      /(?:remove|disable|close)\s+split\s*view|unsplit\s+(?:tabs?|view)?/i.test(
        input
      )
        ? {}
        : null,
  },
  {
    next: "add_split_view",
    reason: "mutation-explicit-add-split-view-colloquial",
    resolve: input => {
      const lower = input.toLowerCase();
      if (/\b(remove|disable|close|unsplit|don't|do not)\b/.test(lower)) {
        return null;
      }
      if (
        /\b(?:two|2)\s+tabs?\s+(?:side\s*by\s*side|at\s+once)\b/i.test(input) ||
        /\bshow\s+(?:two|2)\s+tabs?\s+(?:side\s*by\s*side|at\s+once)\b/i.test(
          input
        ) ||
        /\bopen\s+.{0,40}\bsplit\s*view\b/i.test(input) ||
        /\bsplitview\b/i.test(input)
      ) {
        return {};
      }
      return null;
    },
  },
  {
    next: "add_split_view",
    reason: "mutation-explicit-add-split-view",
    resolve: input => {
      if (
        !/(?:add|create|enable)\s+split\s*view|split\s+(?:this\s+)?(?:tab|view)/i.test(
          input
        )
      ) {
        return null;
      }
      const withTabMatch = input.match(
        /(?:with|and)\s+(?:tab\s+)?(?<index>\d+)/i
      );
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
    next: "move_tab_to_new_window",
    reason: "mutation-explicit-move-tab-new-window",
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
    reason: "mutation-explicit-close-tab",
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
    reason: "mutation-explicit-remove-tab-from-group",
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
    reason: "mutation-explicit-remove-tab-from-folder",
    resolve: input => {
      const match = input.match(
        /(?:remove|delete)\s+(?:this\s+)?(?:tab\s+)?from\s+(?:my\s+)?(?:the\s+)?(?:bookmark\s+)?folder\s+"?(?<name>[\w\s]+?)"?\s*$/i
      );
      const name = match?.groups?.name?.trim();
      return name ? { name } : null;
    },
  },
  {
    next: "create_bookmark_folder",
    reason: "mutation-explicit-create-folder-with-current",
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
    reason: "mutation-explicit-create-folder-with-all",
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
    reason: "mutation-explicit-create-folder",
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
    reason: "mutation-explicit-delete-folder",
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
    next: "rename_bookmark_folder",
    reason: "mutation-explicit-rename-folder",
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
    next: "delete_tab_group",
    reason: "mutation-explicit-delete-group",
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
    reason: "mutation-explicit-create-group",
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
    next: "rename_tab_group",
    reason: "mutation-explicit-rename-group",
    resolve: input => {
      const match = input.match(
        /rename\s+(?:tab\s+)?group\s+"?(?<from>[\w\s]+?)"?\s+(?:to|as)\s+"?(?<to>[\w\s]+?)"?\s*$/i
      );
      const from = match?.groups?.from?.trim();
      const to = match?.groups?.to?.trim();
      return from && to ? { from, to } : null;
    },
  },
];

export function resolveExplicitMutationRoute(
  input: string
): DeterministicRouteDecision | null {
  for (const rule of MUTATION_EXPLICIT_ROUTES) {
    const args = rule.resolve(input);
    if (args) {
      return toolDecision(rule.next, rule.reason, args);
    }
  }
  return null;
}
