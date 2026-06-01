import { normalizeRouteName } from "./intentParser.js";
import { resolveBriefTopicFields } from "./researchBriefTopicPolicy.js";
import {
  isIndicesOnlyClause,
  parseTabIndicesFromClause,
  parseTabQueryList,
} from "../services/researchBriefTabResolve.js";
import type {
  DeterministicRouteDecision,
  RouteArgs,
  RoutingStateSnapshot,
} from "./routerTypes.js";
import {
  ACROSS_SCOPE,
  GROUP_NAME,
  PRODUCT_START,
  SCOPE_PREP,
  SYNTHESIS_START,
  TAB_GROUP_SUFFIX,
  TOPIC_SEGMENT,
  VERB_PREFIX,
  normalizeResearchBriefInput,
  looksLikeResearchBriefCommand,
  isObviousResearchBriefRequest,
} from "./researchBriefUtterances.js";

export {
  normalizeResearchBriefInput,
  looksLikeResearchBriefCommand,
  isObviousResearchBriefRequest,
} from "./researchBriefUtterances.js";

function toolDecision(
  next: string,
  reason: string,
  args: RouteArgs
): DeterministicRouteDecision {
  return { type: "tool", next, args, reason };
}

function trimQuotes(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

function activeGroupArgs(topic?: string): RouteArgs {
  const args: RouteArgs = {
    scope: "tab-group",
    use_active_tab_group: true,
    infer_topic_from_content: true,
  };
  if (topic) {
    args.topic = topic;
    delete args.infer_topic_from_content;
  }
  return args;
}

function tabGroupArgs(name: string, topic?: string): RouteArgs {
  const args: RouteArgs = {
    scope: "tab-group",
    name,
    infer_topic_from_content: true,
  };
  if (topic) {
    args.topic = topic;
    delete args.infer_topic_from_content;
  }
  return args;
}

export function extractResearchBriefOutlineHint(input: string): {
  body: string;
  outlineHint: string;
} {
  const trimmed = normalizeResearchBriefInput(input);
  const patterns = [
    /\s+with\s+sections?\s+for\s+(.+)$/i,
    /\s+organized\s+as\s+(.+)$/i,
    /\s+outline:\s*(.+)$/i,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match && match.index != null) {
      return {
        body: trimmed.slice(0, match.index).trim(),
        outlineHint: trimQuotes(match[1] || ""),
      };
    }
  }
  return { body: trimmed, outlineHint: "" };
}

export function splitResearchBriefExcludeClause(input: string): {
  body: string;
  excludeIndices: number[];
  excludeQueries: string[];
} {
  const trimmed = normalizeResearchBriefInput(input);
  const exceptMatch = trimmed.match(/\s+except\s+(.+)$/i);
  if (!exceptMatch || exceptMatch.index == null) {
    return { body: trimmed, excludeIndices: [], excludeQueries: [] };
  }

  const body = trimmed.slice(0, exceptMatch.index).trim();
  const clause = exceptMatch[1].trim();

  if (/^tabs?\b/i.test(clause) || /^\d/.test(clause)) {
    const indices = [...clause.matchAll(/\d+/g)]
      .map(match => parseInt(match[0], 10))
      .filter(n => Number.isFinite(n) && n >= 1);
    return { body, excludeIndices: indices, excludeQueries: [] };
  }

  const queries = clause
    .split(/\s*,\s*|\s+and\s+/i)
    .map(part => trimQuotes(part))
    .filter(part => part.length >= 3);

  return { body, excludeIndices: [], excludeQueries: queries };
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

function findGroupNameInSnapshot(
  topic: string,
  snapshot: RoutingStateSnapshot
): string | null {
  const normalized = normalizeRouteName(topic);
  if (!normalized) {
    return null;
  }

  const exact: string[] = [];
  for (const name of snapshot.groupNames) {
    if (normalizeRouteName(name) === normalized) {
      exact.push(name);
    }
  }
  if (exact.length === 1) {
    return exact[0];
  }

  const partial: string[] = [];
  for (const name of snapshot.groupNames) {
    const groupNorm = normalizeRouteName(name);
    if (groupNorm.includes(normalized) || normalized.includes(groupNorm)) {
      partial.push(name);
    }
  }
  if (partial.length === 1) {
    return partial[0];
  }

  return null;
}

function applyTopicPolicy(
  args: RouteArgs,
  snapshot: RoutingStateSnapshot
): RouteArgs | null {
  const scope =
    args.scope === "window"
      ? "window"
      : args.scope === "tabs"
        ? "tabs"
        : "tab-group";
  let groupName = String(args.name || "").trim();
  const userTopicRaw = String(args.topic || "").trim();

  if (scope === "tab-group" && !groupName && userTopicRaw) {
    const inferredGroup = findGroupNameInSnapshot(userTopicRaw, snapshot);
    if (inferredGroup) {
      groupName = inferredGroup;
    }
  }

  const scopeLabel =
    scope === "tab-group" && groupName
      ? `Tab group: ${groupName}`
      : scope === "tabs"
        ? "Tabs"
        : scope === "window"
          ? "Current window"
          : "";

  const topicFields = resolveBriefTopicFields({
    userTopic: userTopicRaw,
    scopeLabel,
    groupName,
    scope,
  });

  const merged: RouteArgs = { ...args, scope };
  if (topicFields.topic) {
    merged.topic = topicFields.topic;
  } else {
    delete merged.topic;
  }
  if (topicFields.inferTopicFromContent) {
    merged.infer_topic_from_content = true;
  }

  if (args.use_active_tab_group === true) {
    merged.use_active_tab_group = true;
    merged.scope = "tab-group";
    delete merged.name;
  } else if (scope === "tab-group") {
    if (!groupName && !userTopicRaw) {
      return null;
    }
    if (!groupName && userTopicRaw) {
      return null;
    }
    merged.name = groupName;
    if (!String(merged.name || "").trim()) {
      return null;
    }
  }

  if (scope === "tabs") {
    const queries = Array.isArray(merged.tab_queries)
      ? (merged.tab_queries as string[])
      : [];
    const indices = Array.isArray(merged.tab_indices)
      ? (merged.tab_indices as number[])
      : [];
    if (queries.length === 0 && indices.length === 0) {
      return null;
    }
  }

  if (scope === "window" && !topicFields.topic && !topicFields.inferTopicFromContent) {
    return null;
  }

  if (!topicFields.topic && !topicFields.inferTopicFromContent) {
    return null;
  }

  return merged;
}

export function finalizeResearchBriefArgs(
  args: RouteArgs,
  snapshot: RoutingStateSnapshot
): RouteArgs | null {
  return applyTopicPolicy(args, snapshot);
}

const RESEARCH_BRIEF_PATTERNS: Array<{
  reason: string;
  match: RegExp;
  resolve: (match: RegExpMatchArray) => RouteArgs | null;
}> = [
  {
    reason: "synthesis-active-tab-group",
    match: new RegExp(
      `^${SYNTHESIS_START}(?:${SCOPE_PREP}|${ACROSS_SCOPE})(?:this|current|my)\\s+(?:tab\\s+)?group\\s*$`,
      "i"
    ),
    resolve: () => activeGroupArgs(),
  },
  {
    reason: "draft-outline-from-group",
    match: new RegExp(
      `^${VERB_PREFIX}an\\s+outline\\s+${SCOPE_PREP}${TAB_GROUP_SUFFIX}\\s*$`,
      "i"
    ),
    resolve: match => {
      const name = trimQuotes(match.groups?.name || "");
      return name ? tabGroupArgs(name) : null;
    },
  },
  {
    reason: "synthesis-tab-group-named",
    match: new RegExp(
      `^${SYNTHESIS_START}(?:${SCOPE_PREP})?${TAB_GROUP_SUFFIX}\\s*$`,
      "i"
    ),
    resolve: match => {
      const name = trimQuotes(match.groups?.name || "");
      return name ? tabGroupArgs(name) : null;
    },
  },
  {
    reason: "summarize-active-tab-group",
    match: new RegExp(
      `^summariz(?:e|ing)\\s+(?:across\\s+|everything\\s+in\\s+)?(?:this|current|my)\\s+(?:tab\\s+)?group\\s*$`,
      "i"
    ),
    resolve: () => activeGroupArgs(),
  },
  {
    reason: "summarize-everything-in-named-group",
    match: new RegExp(
      `^summariz(?:e|ing)\\s+everything\\s+in\\s+(?:my\\s+)?(?:tab\\s+)?group\\s+${GROUP_NAME}\\s*$`,
      "i"
    ),
    resolve: match => {
      const name = trimQuotes(match.groups?.name || "");
      return name ? tabGroupArgs(name) : null;
    },
  },
  {
    reason: "summarize-tab-group-named",
    match: new RegExp(
      `^summariz(?:e|ing)\\s+(?:the\\s+)?(?:tab\\s+)?group\\s+${GROUP_NAME}\\s*$`,
      "i"
    ),
    resolve: match => {
      const name = trimQuotes(match.groups?.name || "");
      return name ? tabGroupArgs(name) : null;
    },
  },
  {
    reason: "summarize-tabs-in-group",
    match: new RegExp(
      `^summariz(?:e|ing)\\s+(?:all\\s+)?tabs?\\s+in\\s+(?:(?:the\\s+)?(?:tab\\s+)?group\\s+)?${GROUP_NAME}(?:\\s+group)?\\s*$`,
      "i"
    ),
    resolve: match => {
      const name = trimQuotes(match.groups?.name || "");
      return name ? tabGroupArgs(name) : null;
    },
  },
  {
    reason: "summary-of-tab-group",
    match: new RegExp(
      `^(?:give\\s+me\\s+)?(?:an?\\s+)?summary\\s+(?:of|for)\\s+${TAB_GROUP_SUFFIX}\\s*$`,
      "i"
    ),
    resolve: match => {
      const name = trimQuotes(match.groups?.name || "");
      return name ? tabGroupArgs(name) : null;
    },
  },
  {
    reason: "summary-of-active-group",
    match: new RegExp(
      `^(?:give\\s+me\\s+)?(?:an?\\s+)?summary\\s+(?:of|for)\\s+(?:this|current|my)\\s+(?:tab\\s+)?group\\s*$`,
      "i"
    ),
    resolve: () => activeGroupArgs(),
  },
  {
    reason: "research-brief-active-tab-group",
    match: new RegExp(
      `^${PRODUCT_START}(?:\\s+${TOPIC_SEGMENT})?\\s+${SCOPE_PREP}(?:this|current|my)\\s+(?:tab\\s+)?group\\s*$`,
      "i"
    ),
    resolve: match => {
      const topic = trimQuotes(match.groups?.topic || "");
      return activeGroupArgs(topic || undefined);
    },
  },
  {
    reason: "research-brief-tab-titled",
    match: new RegExp(
      `^${PRODUCT_START}(?:\\s+${TOPIC_SEGMENT})?\\s+from\\s+tab\\s+(?:titled|named|called)\\s+["'](?<query>[^"']+)["']\\s*$`,
      "i"
    ),
    resolve: match => {
      const query = trimQuotes(match.groups?.query || "");
      if (!query) {
        return null;
      }
      const args: RouteArgs = {
        scope: "tabs",
        tab_queries: [query],
      };
      const topic = trimQuotes(match.groups?.topic || "");
      if (topic) {
        args.topic = topic;
      }
      return args;
    },
  },
  {
    reason: "research-brief-tabs-matching",
    match: new RegExp(
      `^${PRODUCT_START}(?:\\s+${TOPIC_SEGMENT})?\\s+from\\s+tabs\\s+matching\\s+(?<query>.+?)\\s*$`,
      "i"
    ),
    resolve: match => {
      const query = trimQuotes(match.groups?.query || "");
      if (!query) {
        return null;
      }
      const args: RouteArgs = {
        scope: "tabs",
        tab_queries: [query],
      };
      const topic = trimQuotes(match.groups?.topic || "");
      if (topic) {
        args.topic = topic;
      }
      return args;
    },
  },
  {
    reason: "research-brief-tab-indices",
    match: new RegExp(
      `^${PRODUCT_START}(?:\\s+${TOPIC_SEGMENT})?\\s+from\\s+tabs\\s+(?<clause>[\\d,\\sand]+)\\s*$`,
      "i"
    ),
    resolve: match => {
      const clause = match.groups?.clause || "";
      if (!isIndicesOnlyClause(clause)) {
        return null;
      }
      const indices = parseTabIndicesFromClause(clause);
      if (indices.length === 0) {
        return null;
      }
      const args: RouteArgs = { scope: "tabs", tab_indices: indices };
      const topic = trimQuotes(match.groups?.topic || "");
      if (topic) {
        args.topic = topic;
      }
      return args;
    },
  },
  {
    reason: "research-brief-on-topic-from-tabs",
    match: new RegExp(
      `^${PRODUCT_START}\\s+${TOPIC_SEGMENT}\\s+from\\s+tabs\\s+(?<list>.+?)\\s*$`,
      "i"
    ),
    resolve: match => {
      const topic = trimQuotes(match.groups?.topic || "");
      const list = trimQuotes(match.groups?.list || "");
      if (!topic || !list) {
        return null;
      }
      if (isIndicesOnlyClause(list)) {
        return {
          topic,
          scope: "tabs",
          tab_indices: parseTabIndicesFromClause(list),
        };
      }
      return {
        topic,
        scope: "tabs",
        tab_queries: parseTabQueryList(list),
      };
    },
  },
  {
    reason: "research-brief-from-tabs-list",
    match: new RegExp(
      `^${PRODUCT_START}(?:\\s+${TOPIC_SEGMENT})?\\s+from\\s+tabs\\s+(?<list>.+?)\\s*$`,
      "i"
    ),
    resolve: match => {
      const list = trimQuotes(match.groups?.list || "");
      if (!list || isIndicesOnlyClause(list)) {
        return null;
      }
      const queries = parseTabQueryList(list);
      if (queries.length === 0) {
        return null;
      }
      const args: RouteArgs = { scope: "tabs", tab_queries: queries };
      const topic = trimQuotes(match.groups?.topic || "");
      if (topic) {
        args.topic = topic;
      }
      return args;
    },
  },
  {
    reason: "research-brief-for-group",
    match: new RegExp(
      `^${PRODUCT_START}\\s+for\\s+${TAB_GROUP_SUFFIX}\\s*$`,
      "i"
    ),
    resolve: match => {
      const name = trimQuotes(match.groups?.name || "");
      if (!name) {
        return null;
      }
      return { scope: "tab-group", name };
    },
  },
  {
    reason: "research-brief-group-trailing",
    match: new RegExp(
      `^${PRODUCT_START}(?:\\s+${TOPIC_SEGMENT})?\\s+${SCOPE_PREP}(?:the\\s+)?(?:my\\s+)?${GROUP_NAME}\\s+(?:tab\\s+)?group\\s*$`,
      "i"
    ),
    resolve: match => {
      const topic = trimQuotes(match.groups?.topic || "");
      const name = trimQuotes(match.groups?.name || "");
      if (!name) {
        return null;
      }
      const args: RouteArgs = { scope: "tab-group", name };
      if (topic) {
        args.topic = topic;
      }
      return args;
    },
  },
  {
    reason: "research-brief-tab-group-named",
    match: new RegExp(
      `^${PRODUCT_START}(?:\\s+${TOPIC_SEGMENT})?\\s+${SCOPE_PREP}${TAB_GROUP_SUFFIX}\\s*$`,
      "i"
    ),
    resolve: match => {
      const topic = trimQuotes(match.groups?.topic || "");
      const name = trimQuotes(match.groups?.name || "");
      if (!name) {
        return null;
      }
      const args: RouteArgs = { scope: "tab-group", name };
      if (topic) {
        args.topic = topic;
      }
      return args;
    },
  },
  {
    reason: "research-brief-topic-then-group",
    match: new RegExp(
      `^${PRODUCT_START}\\s+${TOPIC_SEGMENT}\\s+${SCOPE_PREP}${TAB_GROUP_SUFFIX}\\s*$`,
      "i"
    ),
    resolve: match => {
      const topic = trimQuotes(match.groups?.topic || "");
      const name = trimQuotes(match.groups?.name || "");
      if (!topic || !name) {
        return null;
      }
      return { topic, scope: "tab-group", name };
    },
  },
  {
    reason: "research-brief-window",
    match: new RegExp(
      `^${PRODUCT_START}(?:\\s+${TOPIC_SEGMENT})?\\s+${SCOPE_PREP}(?:this\\s+)?window\\s*$`,
      "i"
    ),
    resolve: match => {
      const topic = trimQuotes(match.groups?.topic || "");
      const args: RouteArgs = { scope: "window" };
      if (topic) {
        args.topic = topic;
      }
      return args;
    },
  },
  {
    reason: "research-brief-topic-only",
    match: new RegExp(`^${PRODUCT_START}\\s+${TOPIC_SEGMENT}\\s*$`, "i"),
    resolve: match => {
      const topic = trimQuotes(match.groups?.topic || "");
      if (!topic) {
        return null;
      }
      return { topic, scope: "tab-group" };
    },
  },
];

export function resolveExplicitResearchBriefRoute(
  input: string,
  snapshot: RoutingStateSnapshot
): DeterministicRouteDecision | null {
  const regenerateMatch = normalizeResearchBriefInput(input).match(
    /^regenerate\s+research\s+brief\s+section\s+(\w+)\s*$/i
  );
  if (regenerateMatch) {
    return toolDecision("regenerate_research_brief_section", "regenerate-section", {
      section: regenerateMatch[1],
    });
  }

  const { body: afterOutline, outlineHint } =
    extractResearchBriefOutlineHint(input);
  const { body, excludeIndices, excludeQueries } =
    splitResearchBriefExcludeClause(afterOutline);
  const trimmed = body.trim();
  if (!trimmed) {
    return null;
  }

  for (const pattern of RESEARCH_BRIEF_PATTERNS) {
    const match = trimmed.match(pattern.match);
    if (!match) {
      continue;
    }
    const rawArgs = pattern.resolve(match);
    if (!rawArgs) {
      continue;
    }
    const args = finalizeResearchBriefArgs(rawArgs, snapshot);
    if (!args) {
      continue;
    }
    if (outlineHint) {
      args.outline_hint = outlineHint;
    }
    return toolDecision(
      "build_research_brief",
      pattern.reason,
      mergeExcludeArgs(args, excludeIndices, excludeQueries)
    );
  }

  return null;
}
