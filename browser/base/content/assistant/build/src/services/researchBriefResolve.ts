import { clampMaxTabs } from "./researchBriefFormat.js";
import {
  buildScopeLabelWithExclusions,
  filterExcludedTabs,
  type FilterExcludedTabsOptions,
} from "./researchBriefScope.js";
import type { BrowserTabLike } from "../types/runtime.js";
import type { ResolveResearchTabsResult } from "./researchBriefTypes.js";
import { dedupeTabsByUrl } from "../utils/researchBriefUrlDedupe.js";

export type TabDescriptor = {
  tab: BrowserTabLike;
  title: string;
  url: string;
};

export function finalizeResolvedTabList(params: {
  tabDescriptors: TabDescriptor[];
  exclusions: FilterExcludedTabsOptions;
  maxTabs: number;
  baseLabel: string;
  tabQueriesCount?: number;
  usedFuzzyGroupMatch?: boolean;
}): ResolveResearchTabsResult {
  const { tabs: afterExclude, excludedCount } = filterExcludedTabs(
    params.tabDescriptors,
    params.exclusions
  );

  if (afterExclude.length === 0) {
    return {
      ok: false,
      message:
        "No tabs left after exclusions. Adjust which tabs to skip, or say list tabs in tab group [name] to see positions.",
    };
  }

  const { items: deduped, dedupedCount } = dedupeTabsByUrl(afterExclude);
  const limit = clampMaxTabs(params.maxTabs);
  const capped = deduped.slice(0, limit);
  const tabsOmittedByLimit = Math.max(0, deduped.length - capped.length);
  let scopeLabel = buildScopeLabelWithExclusions(
    params.baseLabel,
    capped.length,
    excludedCount
  );
  if (dedupedCount > 0) {
    scopeLabel += ` (${dedupedCount} duplicate URL${dedupedCount === 1 ? "" : "s"} skipped)`;
  }

  return {
    ok: true,
    tabs: capped.map(item => item.tab),
    scopeLabel,
    tabsOmittedByLimit,
    totalBeforeCap: deduped.length,
    urlsDeduplicated: dedupedCount,
    usedFuzzyGroupMatch: params.usedFuzzyGroupMatch === true,
    tabQueriesCount: params.tabQueriesCount ?? 0,
  };
}
