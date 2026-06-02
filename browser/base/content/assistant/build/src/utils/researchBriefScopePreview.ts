import { tabTitle } from "../services/firefoxFacade.js";
import type { BrowserTabLike } from "../types/runtime.js";

const PREVIEW_TAB_THRESHOLD = 6;
const PREVIEW_TABS_SCOPE_MATCH_THRESHOLD = 3;

export type ScopePreviewInput = {
  scope: "tab-group" | "window" | "tabs";
  tabCount: number;
  tabsOmittedByLimit: number;
  totalBeforeCap: number;
  tabQueriesCount: number;
  urlsDeduplicated: number;
  usedFuzzyGroupMatch: boolean;
};

export function shouldConfirmResearchBriefScope(
  input: ScopePreviewInput
): boolean {
  if (input.usedFuzzyGroupMatch) {
    return true;
  }
  if (input.tabsOmittedByLimit > 0) {
    return true;
  }
  if (input.urlsDeduplicated > 0 && input.tabCount >= 4) {
    return true;
  }
  if (
    input.scope === "tabs" &&
    input.tabQueriesCount > 0 &&
    input.tabCount > PREVIEW_TABS_SCOPE_MATCH_THRESHOLD
  ) {
    return true;
  }
  if (input.tabCount > PREVIEW_TAB_THRESHOLD) {
    return true;
  }
  return false;
}

export function formatTabTitlesForPreview(
  tabs: BrowserTabLike[],
  maxShown = 5
): string {
  const titles = tabs.map(tab => tabTitle(tab)).filter(Boolean);
  const shown = titles.slice(0, maxShown);
  const suffix =
    titles.length > maxShown ? `, +${titles.length - maxShown} more` : "";
  return `${shown.join(", ")}${suffix}`;
}

export function buildScopePreviewDescription(params: {
  scopeLabel: string;
  tabs: BrowserTabLike[];
  tabsOmittedByLimit: number;
  urlsDeduplicated: number;
}): string {
  const lines = [
    `I'll build a research brief from ${params.tabs.length} tab(s) in ${params.scopeLabel}.`,
    `Tabs: ${formatTabTitlesForPreview(params.tabs)}.`,
  ];
  if (params.tabsOmittedByLimit > 0) {
    lines.push(
      `${params.tabsOmittedByLimit} tab(s) in scope will be skipped due to the tab limit.`
    );
  }
  if (params.urlsDeduplicated > 0) {
    lines.push(`${params.urlsDeduplicated} duplicate URL(s) were removed.`);
  }
  lines.push("Continue?");
  return lines.join(" ");
}
