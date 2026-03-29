/**
 * List-family resolver — handles "list/show" commands deterministically.
 *
 * Parses target names from inputs like "list tabs in Research group",
 * cross-references with the routing state snapshot to determine if
 * the target is a tab group, bookmark folder, or ambiguous.
 *
 * Returns: list_tabs (with scope + name args), list_bookmark_folders,
 * list_tab_groups, or null if no match.
 * Called by decisionEngine.ts for list-family commands.
 */
import { normalizeRouteName } from "./intentParser.js";
import { resolveManifestCommand } from "./manifestResolver.js";
import type {
  DeterministicRouteDecision,
  RoutingStateSnapshot,
} from "./routerTypes.js";
import { getBrowserWindow } from "../types/runtime.js";

const WINDOW_SCOPE_ALIASES = new Set([
  "window",
  "current window",
  "this window",
  "open tabs",
  "all open tabs",
  "tabs",
  "all tabs",
  "my tabs",
  "current tabs",
  "active tabs",
]);

function cleanTargetName(value: string): string {
  return String(value || "")
    .replace(/["']/g, "")
    .replace(/^\s*(?:my|the)\s+/i, "")
    .replace(/\s+(?:please|now)\s*$/i, "")
    .trim();
}

function isListBookmarkFoldersCommand(input: string): boolean {
  return /^(?:list|show)\s+(?:all\s+)?(?:my\s+)?(?:bookmark\s+)?(?:bookmarks?|folders?|hubs?)\s*$/i.test(
    String(input || "").trim()
  );
}

function isListTabGroupsCommand(input: string): boolean {
  return /^(?:list|show)\s+(?:all\s+)?(?:my\s+)?(?:tab\s+)?groups?\s*$/i.test(
    String(input || "").trim()
  );
}

function parseListTabsTarget(input: string): {
  targetName?: string;
  explicitContainer?: "tab-group" | "bookmark-folder";
} | null {
  const command = String(input || "").trim();
  if (!/^(?:list|show)\b/i.test(command)) {
    return null;
  }

  if (
    /\btab\s*groups?\b/i.test(command) &&
    !/\btabs?\s+(?:in|from)\b/i.test(command)
  ) {
    return null;
  }

  const tabsWithTarget = command.match(
    /\btabs?\s+(?:in|from)\s+(?<target>.+)$/i
  );
  if (tabsWithTarget?.groups?.target) {
    const rawTarget = cleanTargetName(tabsWithTarget.groups.target);
    if (!rawTarget) {
      return {};
    }
    const hasGroup = /\btab\s*group\b|\bgroup\b/i.test(rawTarget);
    const hasFolder =
      /\bbookmark\s*folder\b|\bfolder\b|\bhub\b|\bbookmarks?\b/i.test(
        rawTarget
      );
    const explicitContainer =
      hasGroup && !hasFolder
        ? "tab-group"
        : hasFolder && !hasGroup
          ? "bookmark-folder"
          : undefined;
    const targetName = cleanTargetName(
      rawTarget.replace(
        /\b(?:tab\s*group|bookmark\s*folder|group|folder|hub|bookmarks?)\b/gi,
        " "
      )
    );
    if (!targetName) {
      return explicitContainer ? { explicitContainer } : {};
    }
    return { targetName, explicitContainer };
  }

  if (/^(?:list|show)\s+(?:all\s+)?(?:my\s+)?tabs?\b/i.test(command)) {
    return {};
  }

  const containerNameMatch = command.match(
    /^(?:list|show)\s+(?:tabs?\s+(?:in|from)\s+)?(?:my\s+|the\s+)?(?<name>.+?)\s+(?<container>tab\s*group|group|bookmark\s*folder|folder|hub|bookmarks?)(?:\s+tabs?)?\s*$/i
  );
  if (containerNameMatch?.groups?.container) {
    const targetName = cleanTargetName(containerNameMatch.groups.name || "");
    const container = normalizeRouteName(containerNameMatch.groups.container);
    const explicitContainer = container.includes("group")
      ? "tab-group"
      : "bookmark-folder";
    if (!targetName) {
      return { explicitContainer };
    }
    return { targetName, explicitContainer };
  }

  const namedListMatch = command.match(
    /^(?:list|show)\s+(?:my\s+|the\s+)?(?<name>[\w\s-]+)\s*$/i
  );
  if (!namedListMatch?.groups?.name) {
    return null;
  }

  const targetName = cleanTargetName(namedListMatch.groups.name);
  if (!targetName) {
    return null;
  }
  if (
    /^(?:tabs?|tab\s*groups?|groups?|bookmark\s*folders?|folders?|hubs?|bookmarks?)$/i.test(
      targetName
    )
  ) {
    return null;
  }

  return { targetName };
}

export function resolveManifestListRoute(
  input: string,
  snapshot: RoutingStateSnapshot
): DeterministicRouteDecision | null {
  const topWin = getBrowserWindow();
  const tabCount = topWin?.gBrowser?.tabs
    ? Array.from(topWin.gBrowser.tabs).length
    : 0;
  const candidate = resolveManifestCommand(input, {
    snapshot,
    hasOpenTabs: tabCount > 0,
    hasPendingConfirmation: false,
  });
  if (!candidate || candidate.definition.family !== "list") {
    return null;
  }

  if (
    candidate.definition.id === "list.bookmark.folders" ||
    isListBookmarkFoldersCommand(input)
  ) {
    return {
      type: "tool",
      next: "list_bookmark_folders",
      args: {},
      reason: "list-manifest-bookmark-folders",
    };
  }

  if (
    candidate.definition.id === "list.tab.groups" ||
    isListTabGroupsCommand(input)
  ) {
    return {
      type: "tool",
      next: "list_tab_groups",
      args: {},
      reason: "list-manifest-tab-groups",
    };
  }

  const parsed = parseListTabsTarget(input);
  if (!parsed) {
    if (candidate.definition.id === "list.window.tabs") {
      return {
        type: "tool",
        next: "list_tabs",
        args: {},
        reason: "list-manifest-open-window",
      };
    }
    return null;
  }

  const targetName = parsed.targetName;
  const explicitContainer = parsed.explicitContainer;

  if (explicitContainer === "tab-group") {
    if (!targetName) {
      return {
        type: "chat",
        actionable: true,
        reason: "list-manifest-missing-group-name",
        message: "Which tab group should I list tabs from?",
      };
    }
    return {
      type: "tool",
      next: "list_tabs",
      args: { scope: "tab-group", name: targetName },
      reason: "list-manifest-explicit-group",
    };
  }

  if (explicitContainer === "bookmark-folder") {
    if (!targetName) {
      return {
        type: "chat",
        actionable: true,
        reason: "list-manifest-missing-folder-name",
        message: "Which bookmark folder should I list tabs from?",
      };
    }
    return {
      type: "tool",
      next: "list_tabs",
      args: { scope: "bookmark-folder", name: targetName },
      reason: "list-manifest-explicit-folder",
    };
  }

  if (!targetName) {
    return {
      type: "tool",
      next: "list_tabs",
      args: {},
      reason: "list-manifest-open-window",
    };
  }

  const normalizedTarget = normalizeRouteName(targetName);
  if (WINDOW_SCOPE_ALIASES.has(normalizedTarget)) {
    return {
      type: "tool",
      next: "list_tabs",
      args: {},
      reason: "list-manifest-window-alias",
    };
  }

  const targetInGroups = snapshot.groupNames.has(normalizedTarget);
  const targetInFolders = snapshot.folderNames.has(normalizedTarget);

  if (targetInGroups && !targetInFolders) {
    return {
      type: "tool",
      next: "list_tabs",
      args: { scope: "tab-group", name: targetName },
      reason: "list-manifest-resolved-group",
    };
  }

  if (targetInFolders && !targetInGroups) {
    return {
      type: "tool",
      next: "list_tabs",
      args: { scope: "bookmark-folder", name: targetName },
      reason: "list-manifest-resolved-folder",
    };
  }

  if (targetInFolders && targetInGroups) {
    return {
      type: "chat",
      actionable: true,
      reason: "list-manifest-ambiguous-target",
      message:
        `I found both a tab group and a bookmark folder named "${targetName}". ` +
        `Say "list tabs in tab group ${targetName}" or "list tabs in bookmark folder ${targetName}".`,
    };
  }

  return {
    type: "tool",
    next: "list_tabs",
    args: { name: targetName },
    reason: "list-manifest-runtime-resolve-target",
  };
}
