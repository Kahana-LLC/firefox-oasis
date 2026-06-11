import { getTabs } from "./firefoxFacade.js";
import type { GBrowserLike } from "../types/runtime.js";
import { RELEVANT_AUTO_UPGRADE_THRESHOLD } from "./relevantTabConstants.js";
import type { ResearchScope } from "./researchBriefTypes.js";

export type EffectiveResearchScopeOptions = {
  gBrowser: GBrowserLike | null | undefined;
  scope: ResearchScope;
  name?: string;
  tabQueries?: string[];
  tabIndices?: number[];
  useActiveTabGroup?: boolean;
};

export function effectiveResearchScope(
  options: EffectiveResearchScopeOptions
): ResearchScope {
  if (options.useActiveTabGroup || options.scope === "tab-group") {
    return options.scope;
  }
  if (options.scope === "relevant") {
    return "relevant";
  }
  if (String(options.name || "").trim()) {
    return options.scope;
  }
  if (
    options.scope === "tabs" &&
    (options.tabQueries?.length ?? 0) === 1 &&
    (options.tabIndices?.length ?? 0) === 0
  ) {
    return "relevant";
  }
  if (options.scope === "tabs") {
    return "tabs";
  }
  if (options.scope === "window" && options.gBrowser) {
    const hasExplicitTabs =
      (options.tabQueries?.length ?? 0) > 0 ||
      (options.tabIndices?.length ?? 0) > 0;
    if (
      !hasExplicitTabs &&
      getTabs(options.gBrowser).length > RELEVANT_AUTO_UPGRADE_THRESHOLD
    ) {
      return "relevant";
    }
  }
  return options.scope;
}
