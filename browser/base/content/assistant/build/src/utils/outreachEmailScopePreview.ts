import type { BrowserTabLike } from "../types/runtime.js";
import { formatTabTitlesForPreview } from "./researchBriefScopePreview.js";

export function buildOutreachScopePreviewDescription(params: {
  scopeLabel: string;
  tabs: BrowserTabLike[];
  tabsOmittedByLimit: number;
  urlsDeduplicated: number;
}): string {
  const lines = [
    `I'll draft an outreach email from ${params.tabs.length} tab(s) in ${params.scopeLabel}.`,
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
