import { normalizeRouteName } from "./intentParser.js";
import {
  isIndicesOnlyClause,
  parseTabIndicesFromClause,
} from "../services/researchBriefTabResolve.js";
import type {
  DeterministicRouteDecision,
  RouteArgs,
  RoutingStateSnapshot,
} from "./routerTypes.js";
import {
  FOCUS_SEGMENT,
  GROUP_NAME,
  ORGANIZE_SCOPE,
  ORGANIZE_VERB,
  SPLIT_FROM_REST,
  extractOrganizeTabsFocus,
  inferOrganizeTabsMode,
  looksLikeOrganizeTabsCommand,
  normalizeOrganizeTabsInput,
  prepareOrganizeTabsCommandBody,
  trimOrganizeFocus,
} from "./organizeTabsQuery.js";
import { splitResearchBriefExcludeClause } from "./researchBriefExplicitResolver.js";

export {
  normalizeOrganizeTabsInput,
  looksLikeOrganizeTabsCommand,
} from "./organizeTabsQuery.js";

function toolDecision(
  next: string,
  reason: string,
  args: RouteArgs
): DeterministicRouteDecision {
  return { type: "tool", next, args, reason };
}

function trimQuotes(value: string): string {
  return trimOrganizeFocus(value);
}

function mergeExcludeArgs(
  args: RouteArgs,
  excludeIndices: number[],
  excludeQueries: string[]
): RouteArgs {
  const merged = { ...args };
  if (excludeIndices.length > 0) {
    merged.exclude_indices = excludeIndices;
  }
  if (excludeQueries.length > 0) {
    merged.exclude_queries = excludeQueries;
  }
  return merged;
}

function inferMode(args: RouteArgs, normalized: string): RouteArgs {
  const mode = inferOrganizeTabsMode(
    {
      mode: args.mode as
        | "single_focus"
        | "multi_topic"
        | "research_vs_other"
        | undefined,
      focus: String(args.focus || ""),
    },
    normalized
  );
  return { ...args, mode };
}

function finalizeOrganizeArgs(
  args: RouteArgs,
  normalized: string,
  excludeIndices: number[],
  excludeQueries: string[]
): RouteArgs {
  const withMode = inferMode(args, normalized);
  if (!withMode.scope) {
    withMode.scope = "window";
  }
  return mergeExcludeArgs(withMode, excludeIndices, excludeQueries);
}

const ORGANIZE_TABS_PATTERNS: Array<{
  reason: string;
  match: RegExp;
  resolve: (match: RegExpMatchArray, normalized: string) => RouteArgs | null;
}> = [
  {
    reason: "group-tabs-about-with-name",
    match: new RegExp(
      `^group\\s+(?:all\\s+)?tabs?\\s+${FOCUS_SEGMENT}\\s+in\\s+(?:a\\s+)?(?:tab\\s+)?group\\s+(?:called|named)\\s+${GROUP_NAME}\\s*$`,
      "i"
    ),
    resolve: match => {
      const focus = trimQuotes(match.groups?.focus || "");
      const name = trimQuotes(match.groups?.name || "");
      if (!focus || !name) {
        return null;
      }
      return { mode: "single_focus", focus, name };
    },
  },
  {
    reason: "organize-focus-with-name",
    match: new RegExp(
      `^put\\s+(?:my\\s+)?(?<focus>.+?)\\s+tabs?\\s+in\\s+(?:a\\s+)?(?:tab\\s+)?group\\s+(?:called|named)\\s+${GROUP_NAME}\\s*$`,
      "i"
    ),
    resolve: match => {
      const focus = trimQuotes(match.groups?.focus || "");
      const name = trimQuotes(match.groups?.name || "");
      if (!focus || !name) {
        return null;
      }
      return { mode: "single_focus", focus, name };
    },
  },
  {
    reason: "put-tabs-together",
    match: new RegExp(
      `^(?:put|collect|gather|bundle)\\s+(?:all\\s+)?(?:my\\s+)?(?<focus>.+?)\\s+tabs?\\s+together\\s*$`,
      "i"
    ),
    resolve: match => {
      const focus = trimQuotes(match.groups?.focus || "");
      return focus ? { mode: "single_focus", focus } : null;
    },
  },
  {
    reason: "organize-group-tabs-about",
    match: new RegExp(
      `^${ORGANIZE_VERB}\\s+(?:all\\s+)?tabs?\\s+${FOCUS_SEGMENT}\\s*$`,
      "i"
    ),
    resolve: match => {
      const focus = trimQuotes(match.groups?.focus || "");
      return focus ? { mode: "single_focus", focus } : null;
    },
  },
  {
    reason: "group-tabs-related-to",
    match: new RegExp(
      `^group\\s+(?:all\\s+)?(?:the\\s+)?tabs?\\s+(?:related\\s+to|about|on|for|around|involving|regarding|concerning|pertaining\\s+to|dealing\\s+with)\\s+(?<focus>.+?)\\s*$`,
      "i"
    ),
    resolve: match => {
      const focus = trimQuotes(match.groups?.focus || "");
      return focus ? { mode: "single_focus", focus } : null;
    },
  },
  {
    reason: "group-quoted-topic",
    match:
      /^group\s+(?:all\s+)?(?:the\s+)?tabs?\s+["'](?<focus>[^"']+)["']\s*$/i,
    resolve: match => {
      const focus = trimQuotes(match.groups?.focus || "");
      return focus ? { mode: "single_focus", focus } : null;
    },
  },
  {
    reason: "research-narrative-group",
    match: new RegExp(
      `^(?:i'?m|i\\s+am)\\s+(?:doing\\s+)?(?:research(?:ing)?|working)\\s+(?:on|about)\\s+(?<focus>.+?)\\s*[—-]\\s*(?:group|organize)\\s+(?:those|these|my)?\\s*tabs?\\s*$`,
      "i"
    ),
    resolve: match => {
      const focus = trimQuotes(match.groups?.focus || "");
      return focus ? { mode: "single_focus", focus } : null;
    },
  },
  {
    reason: "collect-tabs-into-group",
    match: new RegExp(
      `^collect\\s+tabs?\\s+${FOCUS_SEGMENT}\\s+into\\s+(?:a\\s+)?(?:tab\\s+)?group\\s*$`,
      "i"
    ),
    resolve: match => {
      const focus = trimQuotes(match.groups?.focus || "");
      return focus ? { mode: "single_focus", focus } : null;
    },
  },
  {
    reason: "tabs-that-are-about-group",
    match: new RegExp(
      `^tabs?\\s+(?:that\\s+are|which\\s+are)\\s+${FOCUS_SEGMENT}\\s*[—-]\\s*(?:group|organize)\\s+(?:them|those|these)\\s*$`,
      "i"
    ),
    resolve: match => {
      const focus = trimQuotes(match.groups?.focus || "");
      return focus ? { mode: "single_focus", focus } : null;
    },
  },
  {
    reason: "narrative-group-them",
    match: new RegExp(
      `^(?:all\\s+)?(?:the\\s+)?tabs?\\s+${FOCUS_SEGMENT}\\s*[—-]\\s*(?:group|organize)\\s+(?:them|those|these)\\s*$`,
      "i"
    ),
    resolve: match => {
      const focus = trimQuotes(match.groups?.focus || "");
      return focus ? { mode: "single_focus", focus } : null;
    },
  },
  {
    reason: "separate-from-unrelated-tabs",
    match: new RegExp(
      `^(?:separate|split|isolate)\\s+(?:my\\s+)?(?<focus>.+?)\\s+from\\s+unrelated\\s+tabs?\\s*$`,
      "i"
    ),
    resolve: match => {
      const focus = trimQuotes(match.groups?.focus || "");
      return focus
        ? { mode: "research_vs_other", focus }
        : { mode: "research_vs_other" };
    },
  },
  {
    reason: "tidy-open-tabs",
    match: /^tidy\s+up\s+(?:my\s+)?(?:open\s+)?tabs?\s*$/i,
    resolve: () => ({ mode: "multi_topic", scope: "window" }),
  },
  {
    reason: "research-vs-other-explicit",
    match: new RegExp(
      `^(?:separate|split|isolate)\\s+(?:my\\s+)?(?<focus>.+?)\\s+${SPLIT_FROM_REST}\\s*$`,
      "i"
    ),
    resolve: match => {
      const focus = trimQuotes(match.groups?.focus || "");
      return focus
        ? { mode: "research_vs_other", focus }
        : { mode: "research_vs_other" };
    },
  },
  {
    reason: "split-research-from-rest",
    match: new RegExp(
      `^(?:split|separate)\\s+(?:my\\s+)?(?:research|researching)?\\s*tabs?\\s+from\\s+(?:the\\s+)?rest\\s*$`,
      "i"
    ),
    resolve: () => ({ mode: "research_vs_other" }),
  },
  {
    reason: "organize-by-topic-window",
    match: new RegExp(
      `^${ORGANIZE_VERB}\\s+(?:my\\s+)?${ORGANIZE_SCOPE}\\s+by\\s+topic\\s*$`,
      "i"
    ),
    resolve: () => ({ mode: "multi_topic", scope: "window" }),
  },
  {
    reason: "sort-tabs-into-groups",
    match: new RegExp(
      `^(?:sort|cluster)\\s+(?:these|my|the)?\\s*tabs?\\s+into\\s+groups?\\s*$`,
      "i"
    ),
    resolve: () => ({ mode: "multi_topic", scope: "window" }),
  },
  {
    reason: "organize-window-tabs",
    match: new RegExp(
      `^${ORGANIZE_VERB}\\s+(?:my\\s+)?(?:open\\s+)?tabs?\\s+in\\s+(?:this\\s+)?window\\s*$`,
      "i"
    ),
    resolve: () => ({ mode: "multi_topic", scope: "window" }),
  },
  {
    reason: "organize-ungrouped-only",
    match: new RegExp(
      `^${ORGANIZE_VERB}\\s+(?:ungrouped|un\\s*grouped)\\s+tabs?\\s*(?:only|by\\s+topic)?\\s*$`,
      "i"
    ),
    resolve: () => ({ mode: "multi_topic", scope: "ungrouped_only" }),
  },
  {
    reason: "organize-active-tab-group",
    match: new RegExp(
      `^${ORGANIZE_VERB}\\s+(?:this|current|my)\\s+(?:tab\\s+)?group\\s*(?:by\\s+topic)?\\s*$`,
      "i"
    ),
    resolve: () => ({
      mode: "multi_topic",
      scope: "tab-group",
      use_active_tab_group: true,
    }),
  },
  {
    reason: "organize-named-tab-group",
    match: new RegExp(
      `^${ORGANIZE_VERB}\\s+(?:tabs?\\s+)?(?:in|from|within)\\s+(?:tab\\s+)?group\\s+${GROUP_NAME}(?:\\s+by\\s+topic)?\\s*$`,
      "i"
    ),
    resolve: match => {
      const name = trimQuotes(match.groups?.name || "");
      return name ? { mode: "multi_topic", scope: "tab-group", name } : null;
    },
  },
  {
    reason: "organize-tabs-in-named-group",
    match: new RegExp(
      `^${ORGANIZE_VERB}\\s+tabs?\\s+in\\s+(?:tab\\s+)?group\\s+${GROUP_NAME}\\s+by\\s+topic\\s*$`,
      "i"
    ),
    resolve: match => {
      const name = trimQuotes(match.groups?.name || "");
      return name ? { mode: "multi_topic", scope: "tab-group", name } : null;
    },
  },
  {
    reason: "organize-tabs-except-indices",
    match: new RegExp(
      `^group\\s+tabs?\\s+${FOCUS_SEGMENT}\\s+except\\s+tabs?\\s+(?<clause>[\\d,\\sand]+)\\s*$`,
      "i"
    ),
    resolve: match => {
      const focus = trimQuotes(match.groups?.focus || "");
      const clause = match.groups?.clause || "";
      if (!focus || !isIndicesOnlyClause(clause)) {
        return null;
      }
      return {
        mode: "single_focus",
        focus,
        exclude_indices: parseTabIndicesFromClause(clause),
      };
    },
  },
  {
    reason: "organize-generic-tabs",
    match: new RegExp(
      `^${ORGANIZE_VERB}\\s+(?:my\\s+)?${ORGANIZE_SCOPE}\\s*$`,
      "i"
    ),
    resolve: () => ({ mode: "multi_topic", scope: "window" }),
  },
];

function buildOrganizeTabsFallbackArgs(normalized: string): RouteArgs {
  const focus = extractOrganizeTabsFocus(normalized);
  if (focus) {
    return { mode: "single_focus", focus, scope: "window" };
  }
  return { mode: "multi_topic", scope: "window" };
}

export function resolveExplicitOrganizeTabsRoute(
  input: string,
  _snapshot: RoutingStateSnapshot
): DeterministicRouteDecision | null {
  const { body, excludeIndices, excludeQueries } =
    splitResearchBriefExcludeClause(normalizeOrganizeTabsInput(input));
  const trimmed = prepareOrganizeTabsCommandBody(body);
  if (!trimmed || !looksLikeOrganizeTabsCommand(trimmed)) {
    return null;
  }

  for (const pattern of ORGANIZE_TABS_PATTERNS) {
    const match = trimmed.match(pattern.match);
    if (!match) {
      continue;
    }
    const rawArgs = pattern.resolve(match, trimmed);
    if (!rawArgs) {
      continue;
    }
    return toolDecision(
      "organize_tabs",
      pattern.reason,
      finalizeOrganizeArgs(rawArgs, trimmed, excludeIndices, excludeQueries)
    );
  }

  if (looksLikeOrganizeTabsCommand(trimmed)) {
    const fallbackArgs = buildOrganizeTabsFallbackArgs(trimmed);
    return toolDecision(
      "organize_tabs",
      fallbackArgs.focus
        ? "organize-tabs-focus-heuristic"
        : "organize-tabs-fallback",
      finalizeOrganizeArgs(
        fallbackArgs,
        trimmed,
        excludeIndices,
        excludeQueries
      )
    );
  }

  return null;
}

export function findGroupNameInOrganizeSnapshot(
  topic: string,
  snapshot: RoutingStateSnapshot
): string | null {
  const normalized = normalizeRouteName(topic);
  if (!normalized) {
    return null;
  }
  for (const name of snapshot.groupNames) {
    if (normalizeRouteName(name) === normalized) {
      return name;
    }
  }
  return null;
}
