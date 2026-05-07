/**
 * Search-family resolver — handles "search/find" commands deterministically.
 *
 * Extracts query and optional folder scope from inputs like
 * "search python in my Docs folder" or "find amazon in Deals".
 * Validates folder names against the routing state snapshot.
 *
 * Returns: search_memory (with query + folder args), search_history,
 * or null if no match. Called by decisionEngine.ts for search-family.
 */
import { normalizeRouteName, parseSearchMemoryIntent } from "./intentParser.js";
import { resolveManifestCommand } from "./manifestResolver.js";
import type { DeterministicRouteDecision, RouteArgs, RoutingStateSnapshot } from "./routerTypes.js";
import { getBrowserWindow } from "../types/runtime.js";

function cleanSearchTarget(value: string): string {
  const cleaned = String(value || "")
    .replace(/["']/g, "")
    .replace(/^\s*(?:my|the)\s+/i, "")
    .trim();
  return cleaned
    .replace(/\s+(?:bookmark\s+folder|folder|hub|bookmarks?)\s*$/i, "")
    .trim();
}

function cleanSearchQuery(value: string): string {
  return String(value || "").replace(/["']/g, "").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseFolderSearchMissingQuery(
  input: string,
  snapshot: RoutingStateSnapshot
): string | null {
  const match = String(input || "").trim().match(
    /^(?:search|find|look\s*up)\s+(?:(?:in|inside|within|from)\s+)?(?:my\s+|the\s+)?(?<target>.+?)\s+(?:bookmark\s+folder|folder|hub|bookmarks?)\s*$/i
  );
  if (!match?.groups?.target) {
    return null;
  }
  const targetName = cleanSearchTarget(match.groups.target);
  if (!targetName) {
    return null;
  }
  const targetNorm = normalizeRouteName(targetName);
  if (!targetNorm || !snapshot.folderNames.has(targetNorm)) {
    return null;
  }
  return targetName;
}

function parseImplicitFolderPrefixSearch(
  input: string,
  snapshot: RoutingStateSnapshot
): { query: string; folder: string } | null {
  const body = String(input || "")
    .trim()
    .replace(/^(?:search|find|look\s*up)\s+/i, "")
    .replace(/^\s*(?:my|the)\s+/i, "")
    .trim();
  if (!body) {
    return null;
  }
  if (/\bfor\b/i.test(body) || /\b(?:in|inside|within|from)\b/i.test(body)) {
    return null;
  }

  const folderNames = Array.from(snapshot.folderNames).sort(
    (a, b) => b.length - a.length
  );
  for (const folderNorm of folderNames) {
    const pattern = new RegExp(
      `^(?<folder>${escapeRegExp(
        folderNorm
      )})(?:\\s+(?:bookmark\\s+folder|folder|hub|bookmarks?))?\\s+(?<query>.+)$`,
      "i"
    );
    const match = body.match(pattern);
    if (!match?.groups) {
      continue;
    }
    const folder = cleanSearchTarget(match.groups.folder);
    const query = cleanSearchQuery(match.groups.query);
    if (!folder || !query) {
      continue;
    }
    return { query, folder };
  }
  return null;
}

function parseImplicitFolderSearch(
  input: string,
  snapshot: RoutingStateSnapshot
): { query: string; folder: string } | null {
  const command = String(input || "").trim();
  const queryInTarget = command.match(
    /^(?:search|find|look\s*up)\s+(?:for\s+)?(?<query>.+?)\s+(?:in|inside|within|from)\s+(?:my\s+|the\s+)?(?<target>.+?)\s*$/i
  );
  if (queryInTarget?.groups) {
    const targetName = cleanSearchTarget(queryInTarget.groups.target);
    const query = cleanSearchQuery(queryInTarget.groups.query);
    if (targetName && query) {
      const targetNorm = normalizeRouteName(targetName);
      if (targetNorm && snapshot.folderNames.has(targetNorm)) {
        return { query, folder: targetName };
      }
    }
  }

  const queryWithTrailingFolder = command.match(
    /^(?:search|find|look\s*up)\s+(?:my\s+|the\s+)?(?<target>[\w\s-]+?)\s+for\s+(?<query>.+?)\s+(?:bookmark\s+folder|folder|hub|bookmarks?)\s*$/i
  );
  if (queryWithTrailingFolder?.groups) {
    const targetName = cleanSearchTarget(queryWithTrailingFolder.groups.target);
    const query = cleanSearchQuery(queryWithTrailingFolder.groups.query);
    if (targetName && query) {
      const targetNorm = normalizeRouteName(targetName);
      if (targetNorm && snapshot.folderNames.has(targetNorm)) {
        return { query, folder: targetName };
      }
    }
  }

  const match = command.match(
    /^(?:search|find|look\s*up)\s+(?:my\s+|the\s+)?(?<target>[\w\s-]+?)\s+for\s+(?<query>.+?)\s*$/i
  );
  if (!match?.groups) {
    return null;
  }
  const targetName = cleanSearchTarget(match.groups.target);
  const query = cleanSearchQuery(match.groups.query);
  if (!targetName || !query) {
    return null;
  }
  const targetNorm = normalizeRouteName(targetName);
  if (!targetNorm) {
    return null;
  }
  if (!snapshot.folderNames.has(targetNorm)) {
    return null;
  }
  return { query, folder: targetName };
}

export function resolveManifestSearchRoute(
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
  if (!candidate || candidate.definition.family !== "search") {
    return null;
  }

  // If the manifest resolved to search_history, route directly
  if (candidate.definition.commandName === "search_history") {
    const parsed = parseSearchMemoryIntent(input);
    const query = parsed?.query || input.replace(/^(?:find|search|what|did\s+i)\s+/i, "").trim();
    return {
      type: "tool",
      next: "search_history",
      args: { query },
      reason: "search-manifest-history",
    };
  }

  const missingFolderQuery = parseFolderSearchMissingQuery(input, snapshot);
  if (missingFolderQuery) {
    return {
      type: "chat",
      reason: "search-manifest-folder-missing-query",
      actionable: true,
      message: `What should I search for in bookmark folder "${missingFolderQuery}"?`,
    };
  }

  const parsed = parseSearchMemoryIntent(input);
  const implicitFolder =
    parseImplicitFolderSearch(input, snapshot) ||
    parseImplicitFolderPrefixSearch(input, snapshot);
  const resolved = implicitFolder || parsed;
  if (!resolved) {
    return null;
  }

  const args: RouteArgs = { query: resolved.query };
  if (resolved.folder) {
    args.folder = resolved.folder;
  }
  if ("source" in resolved && resolved.source) {
    args.source = resolved.source;
  }

  const reason = implicitFolder
    ? "search-manifest-implicit-folder"
    : resolved.folder
      ? "search-manifest-folder"
      : "source" in resolved && resolved.source === "bookmark-folder"
        ? "search-manifest-bookmark-folder-scope"
        : "search-manifest-memory";

  return {
    type: "tool",
    next: "search_memory",
    args,
    reason,
  };
}
