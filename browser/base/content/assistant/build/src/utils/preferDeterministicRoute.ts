import { extractHistorySearchKeyword } from "./historyQueryExtract.js";
import {
  looksLikeHistoryKeywordSearch,
  parseHistorySearchQuery,
} from "./historySearchQuery.js";
import {
  enrichOrganizeTabsRouteArgs,
  looksLikeOrganizeTabsCommand,
} from "./organizeTabsQuery.js";
import type { DeterministicRouteDecision, RouteArgs } from "./routerTypes.js";

export type PreferDeterministicToolRoute = {
  next: string;
  args: RouteArgs;
  reason: string;
};

export type EarlyDeterministicSupervisorRoute = {
  next: string;
  args: RouteArgs;
};

export function tryPreferDeterministicToolRoute(
  commandText: string,
  route: DeterministicRouteDecision
): PreferDeterministicToolRoute | null {
  const input = String(commandText || "").trim();
  if (!input || route.type !== "tool") {
    return null;
  }

  if (route.next === "search_history") {
    const parsed = parseHistorySearchQuery(input);
    const routeQuery =
      typeof route.args?.query === "string" ? route.args.query.trim() : "";
    const extracted = extractHistorySearchKeyword(input);
    const resolvedQuery =
      parsed?.query ||
      (extracted && (!routeQuery || routeQuery.split(/\s+/).length > 6)
        ? extracted
        : routeQuery);
    if (parsed?.mode === "keyword" || looksLikeHistoryKeywordSearch(input)) {
      return {
        next: "search_history",
        args: {
          ...route.args,
          query: resolvedQuery,
          mode: "keyword",
          utterance: input,
        },
        reason: route.reason,
      };
    }
    if (parsed?.mode === "recent") {
      return {
        next: "search_history",
        args: {
          ...route.args,
          query: "",
          mode: "recent",
          utterance: input,
        },
        reason: route.reason,
      };
    }
  }

  if (route.next === "organize_tabs" && looksLikeOrganizeTabsCommand(input)) {
    return {
      next: "organize_tabs",
      args: enrichOrganizeTabsRouteArgs(input, {
        ...route.args,
        utterance: input,
      }),
      reason: route.reason,
    };
  }

  return {
    next: route.next,
    args: { ...route.args, utterance: input },
    reason: route.reason,
  };
}

export function tryResolveEarlyDeterministicSupervisorRoute(
  commandText: string,
  route: DeterministicRouteDecision
): EarlyDeterministicSupervisorRoute | null {
  const preferred = tryPreferDeterministicToolRoute(commandText, route);
  if (preferred) {
    return { next: preferred.next, args: preferred.args };
  }
  if (route.type === "chat" && route.message?.trim()) {
    return { next: "chat", args: { routerMessage: route.message.trim() } };
  }
  return null;
}

export function mergeDeterministicHistorySearchArgs(
  activeCommand: string,
  route: DeterministicRouteDecision
): RouteArgs | null {
  const preferred = tryPreferDeterministicToolRoute(activeCommand, route);
  return preferred?.next === "search_history" ? preferred.args : null;
}

export function mergeDeterministicOrganizeTabsArgs(
  activeCommand: string,
  route: DeterministicRouteDecision
): RouteArgs | null {
  const preferred = tryPreferDeterministicToolRoute(activeCommand, route);
  return preferred?.next === "organize_tabs" ? preferred.args : null;
}
