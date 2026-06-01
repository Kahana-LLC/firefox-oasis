import {
  findTabByIndex,
  findTabsByQuery,
  tabTitle,
} from "./firefoxFacade.js";
import type { BrowserTabLike, GBrowserLike } from "../types/runtime.js";
import {
  filterExcludedTabs,
  type FilterExcludedTabsOptions,
} from "./researchBriefScope.js";
import type { ResolveResearchTabsResult } from "./researchBriefTypes.js";
import { finalizeResolvedTabList } from "./researchBriefResolve.js";

const MIN_TAB_QUERY_LEN = 3;

function tabKey(tab: BrowserTabLike): string {
  const id = (tab as { linkedBrowser?: { permanentKey?: unknown } }).linkedBrowser
    ?.permanentKey;
  if (id != null) {
    return String(id);
  }
  return `${tabTitle(tab)}|${tab.linkedBrowser?.currentURI?.spec || ""}`;
}

export function parseTabQueryList(raw: string): string[] {
  return String(raw || "")
    .split(/\s*,\s*|\s+and\s+/i)
    .map(part =>
      part
        .trim()
        .replace(/^["']|["']$/g, "")
        .trim()
    )
    .filter(part => part.length >= MIN_TAB_QUERY_LEN);
}

export function parseTabIndicesFromClause(raw: string): number[] {
  const indices = [...String(raw || "").matchAll(/\d+/g)]
    .map(match => parseInt(match[0], 10))
    .filter(n => Number.isFinite(n) && n >= 1);
  return [...new Set(indices)];
}

export function isIndicesOnlyClause(raw: string): boolean {
  return /^[\d,\sand]+$/i.test(String(raw || "").trim());
}

function buildTabsBaseLabel(
  tabQueries: string[],
  tabIndices: number[],
  matchedCount: number,
  totalBeforeCap: number
): string {
  const parts: string[] = [];
  if (tabQueries.length > 0) {
    const shown = tabQueries
      .slice(0, 4)
      .map(q => `"${q}"`)
      .join(", ");
    parts.push(
      tabQueries.length > 4 ? `${shown}, …` : shown
    );
  }
  if (tabIndices.length > 0) {
    parts.push(`indices ${tabIndices.join(", ")}`);
  }
  let label = `Tabs: ${parts.join("; ") || "selected"}`;
  if (totalBeforeCap > matchedCount) {
    label += ` (${matchedCount} of ${totalBeforeCap} matched)`;
  }
  return label;
}

export function resolveTabsScope(
  gBrowser: GBrowserLike | null | undefined,
  tabQueries: string[],
  tabIndices: number[],
  maxTabs: number,
  exclusions: FilterExcludedTabsOptions = {}
): ResolveResearchTabsResult {
  if (!gBrowser) {
    return { ok: false, message: "Browser UI is not available." };
  }

  const queries = tabQueries
    .map(q => String(q || "").trim())
    .filter(q => q.length >= MIN_TAB_QUERY_LEN);
  const indices = tabIndices.filter(n => Number.isFinite(n) && n >= 1);

  if (queries.length === 0 && indices.length === 0) {
    return {
      ok: false,
      message:
        "Which tabs should I use? Name them by title, URL keyword, or position (e.g. from tabs ESPN, 2 and 3).",
    };
  }

  const seen = new Set<string>();
  const ordered: BrowserTabLike[] = [];

  for (const index of indices) {
    const tab = findTabByIndex(gBrowser, index);
    if (!tab) {
      continue;
    }
    const key = tabKey(tab);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    ordered.push(tab);
  }

  for (const query of queries) {
    for (const tab of findTabsByQuery(gBrowser, query)) {
      const key = tabKey(tab);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      ordered.push(tab);
    }
  }

  if (ordered.length === 0) {
    return {
      ok: false,
      message:
        "I couldn't find open tabs matching that description. Say list tabs to see open tabs, or try a shorter title or URL keyword.",
    };
  }

  const tabDescriptors = ordered.map(tab => ({
    tab,
    title: tabTitle(tab),
    url: tab.linkedBrowser?.currentURI?.spec || "",
  }));

  const { tabs: afterExclude, excludedCount } = filterExcludedTabs(
    tabDescriptors,
    exclusions
  );

  if (afterExclude.length === 0) {
    return {
      ok: false,
      message:
        "No tabs left after exclusions. Adjust which tabs to skip or try different tab names.",
    };
  }

  const baseLabel = buildTabsBaseLabel(
    queries,
    indices,
    afterExclude.length,
    afterExclude.length
  );

  return finalizeResolvedTabList({
    tabDescriptors: afterExclude,
    exclusions: {},
    maxTabs,
    baseLabel,
    tabQueriesCount: queries.length,
    usedFuzzyGroupMatch: false,
  });
}
