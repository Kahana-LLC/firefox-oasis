import {
  normalizeRouteName,
  parseCloseDeleteTargetIntent,
  parseContainerAddIntent,
} from "./intentParser.js";
import { resolveManifestCommand } from "./manifestResolver.js";
import { resolveTargetName } from "./entityResolver.js";
import type {
  DeterministicRouteDecision,
  PendingAmbiguityPayload,
  RouteArgs,
  RoutingStateSnapshot,
} from "./routerTypes.js";
import { getBrowserWindow } from "../types/runtime.js";

function buildAmbiguityPayload(
  name: string,
  opts: {
    kind?: "container_target" | "close_delete_target";
    query?: string;
    all?: boolean;
    originalText: string;
    choices?: Array<"tab" | "tab-group" | "bookmark-folder">;
    tabIndex?: number;
    verb?: string;
  }
): PendingAmbiguityPayload {
  return {
    kind: opts.kind || "container_target",
    name,
    query: opts.query,
    all: opts.all,
    choices: opts.choices,
    tabIndex: opts.tabIndex,
    verb: opts.verb,
    originalText: opts.originalText,
  };
}

function resolveContainerAddRoute(
  input: string,
  snapshot: RoutingStateSnapshot
): DeterministicRouteDecision | null {
  const parsed = parseContainerAddIntent(input);
  if (!parsed || !parsed.targetName) {
    return null;
  }

  const targetName = parsed.targetName;
  const targetNorm = normalizeRouteName(targetName);
  const targetInFolders = snapshot.folderNames.has(targetNorm);
  const targetInGroups = snapshot.groupNames.has(targetNorm);

  const addArgs: RouteArgs = { name: targetName };
  if (parsed.all) {
    addArgs.all = true;
  } else if (parsed.query && !parsed.current) {
    addArgs.query = parsed.query;
  }

  if (parsed.explicitContainer === "tab-group") {
    return {
      type: "tool",
      next: "add_tab_to_group",
      args: addArgs,
      reason: "container-add-explicit-group",
    };
  }

  if (parsed.explicitContainer === "bookmark-folder") {
    return {
      type: "tool",
      next: "add_tab_to_bookmark_folder",
      args: addArgs,
      reason: "container-add-explicit-folder",
    };
  }

  if (targetInFolders && targetInGroups) {
    return {
      type: "tool",
      next: "resolve_ambiguity",
      args: {},
      reason: "container-add-name-collision",
      pendingAmbiguity: buildAmbiguityPayload(targetName, {
        query: parsed.query,
        all: parsed.all,
        originalText: parsed.rawText,
      }),
    };
  }

  if (!targetInFolders && targetInGroups) {
    return {
      type: "tool",
      next: "resolve_ambiguity",
      args: {},
      reason: "container-add-only-group-exists",
      pendingAmbiguity: buildAmbiguityPayload(targetName, {
        query: parsed.query,
        all: parsed.all,
        originalText: parsed.rawText,
      }),
    };
  }

  return {
    type: "tool",
    next: "add_tab_to_bookmark_folder",
    args: addArgs,
    reason: targetInFolders
      ? "container-add-folder-exists"
      : "container-add-default-folder",
  };
}

function resolveCloseDeleteRoute(
  input: string,
  snapshot: RoutingStateSnapshot
): DeterministicRouteDecision | null {
  const parsed = parseCloseDeleteTargetIntent(input);
  if (!parsed?.targetName || !parsed.verb) {
    return null;
  }

  const normalized = parsed.normalizedText;
  if (
    /\b(?:tab\s+group|bookmark\s+folder|split\s*view|from\s+(?:my\s+)?(?:the\s+)?(?:bookmark\s+)?folder|from\s+(?:its\s+)?(?:tab\s+)?group|current\s+tab|tab\s+\d+)\b/i.test(
      normalized
    )
  ) {
    return null;
  }

  const resolution = resolveTargetName(parsed.targetName, snapshot);
  const hasTab = resolution.tabMatches.length > 0;
  const hasGroup = resolution.targetInGroups;
  const hasFolder = resolution.targetInFolders;
  const matches = [hasTab, hasGroup, hasFolder].filter(Boolean).length;

  if (matches === 0) {
    return null;
  }

  if (matches > 1) {
    const choices: Array<"tab" | "tab-group" | "bookmark-folder"> = [];
    if (hasTab) {
      choices.push("tab");
    }
    if (hasGroup) {
      choices.push("tab-group");
    }
    if (hasFolder) {
      choices.push("bookmark-folder");
    }
    return {
      type: "tool",
      next: "resolve_ambiguity",
      args: {},
      reason: "close-delete-ambiguous-target",
      pendingAmbiguity: buildAmbiguityPayload(parsed.targetName, {
        kind: "close_delete_target",
        choices,
        tabIndex: resolution.tabMatches[0],
        verb: parsed.verb,
        originalText: parsed.rawText,
      }),
    };
  }

  if (hasGroup) {
    return {
      type: "tool",
      next: "delete_tab_group",
      args: { name: parsed.targetName },
      reason: "close-delete-resolved-group",
    };
  }

  if (hasFolder) {
    return {
      type: "tool",
      next: "delete_bookmark_folder",
      args: { name: parsed.targetName },
      reason: "close-delete-resolved-folder",
    };
  }

  return {
    type: "tool",
    next: "close_tab",
    args: { index: resolution.tabMatches[0] },
    reason: "close-delete-resolved-tab",
  };
}

export function resolveManifestMutationRoute(
  input: string,
  snapshot: RoutingStateSnapshot
): DeterministicRouteDecision | null {
  const topWin = getBrowserWindow();
  const tabCount = topWin?.gBrowser?.tabs ? Array.from(topWin.gBrowser.tabs).length : 0;
  const candidate = resolveManifestCommand(input, {
    snapshot,
    hasOpenTabs: tabCount > 0,
    hasPendingConfirmation: false,
  });
  if (!candidate || candidate.definition.family !== "mutation") {
    return null;
  }

  if (candidate.definition.id === "mutation.container.add") {
    return resolveContainerAddRoute(input, snapshot);
  }

  if (candidate.definition.id === "mutation.target.delete") {
    return resolveCloseDeleteRoute(input, snapshot);
  }

  return resolveContainerAddRoute(input, snapshot) || resolveCloseDeleteRoute(input, snapshot);
}
