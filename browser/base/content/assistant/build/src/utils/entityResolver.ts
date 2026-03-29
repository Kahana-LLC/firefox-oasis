/** Resolves a target name against live browser state: checks tab groups, bookmark folders, and matching open tabs. Used by manifestMutationResolver.ts for ambiguity detection. */
import type { ResolutionResult, RoutingStateSnapshot } from "./routerTypes.js";
import { normalizeRouteName } from "./intentParser.js";
import { getBrowserWindow, type BrowserTabLike } from "../types/runtime.js";

export function resolveTargetName(
  targetName: string,
  snapshot: RoutingStateSnapshot
): ResolutionResult {
  const normalizedTarget = normalizeRouteName(targetName);
  const topWin = getBrowserWindow();
  const gBrowser = topWin?.gBrowser;

  const tabMatches: number[] = [];
  if (gBrowser?.tabs && normalizedTarget) {
    const tabs = Array.from(gBrowser.tabs || []);
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i] as BrowserTabLike;
      const title = normalizeRouteName(tab?.label || "");
      const url = normalizeRouteName(
        tab?.linkedBrowser?.currentURI?.spec || ""
      );
      if (
        title === normalizedTarget ||
        url === normalizedTarget ||
        (normalizedTarget.length > 2 &&
          (title.includes(normalizedTarget) || url.includes(normalizedTarget)))
      ) {
        tabMatches.push(i + 1);
      }
    }
  }

  return {
    targetInFolders: snapshot.folderNames.has(normalizedTarget),
    targetInGroups: snapshot.groupNames.has(normalizedTarget),
    tabMatches,
  };
}
