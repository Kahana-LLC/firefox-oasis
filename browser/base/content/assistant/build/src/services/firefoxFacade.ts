/**
 * Firefox API facade — abstraction over privileged browser APIs.
 *
 * Resolves the chrome window, gBrowser, PlacesUtils, and Services.
 * Provides helpers for tab/group/bookmark operations:
 * - getTabs(), getTabGroups(), findTabsByQuery(), findGroupByName()
 * - tabUrl(), tabTitle(), findTabByIndex()
 * - withUriFixup(), fetchChildrenBookmarks(), fetchBookmarkByGuid()
 *
 * Decouples command implementations from direct Firefox API access.
 */
import {
  getBrowserWindow,
  type AssistantWindowLike,
  type BrowserTabGroupLike,
  type BrowserTabLike,
  type BrowserUriLike,
  type BrowserWindowLike,
  type GBrowserLike,
  type PlacesBookmarkEntry,
  type PlacesUtilsLike,
  type ServicesLike,
} from "../types/runtime.js";

export type ChromeContext = {
  topWin: BrowserWindowLike | null;
  gBrowser: GBrowserLike | null;
  PlacesUtils: PlacesUtilsLike | null;
  Services: ServicesLike | null;
};

function getAssistantWindow(): AssistantWindowLike {
  return window as AssistantWindowLike;
}

export function getChromeContext(): ChromeContext {
  const topWin = getBrowserWindow();
  const assistantWindow = getAssistantWindow();
  const Services =
    topWin?.Services ||
    assistantWindow.Services ||
    (assistantWindow.top as AssistantWindowLike | undefined)?.Services ||
    null;
  const PlacesUtils =
    topWin?.PlacesUtils ||
    assistantWindow.PlacesUtils ||
    (assistantWindow.top as AssistantWindowLike | undefined)?.PlacesUtils ||
    null;
  const gBrowser = topWin?.gBrowser || null;
  return { topWin, gBrowser, PlacesUtils, Services };
}

export function toUrlString(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    const uri = value as BrowserUriLike;
    const fromSpec = String(uri.spec || "").trim();
    if (fromSpec) return fromSpec;
    const fromHref = String(uri.href || "").trim();
    if (fromHref) return fromHref;
    const fromToString = String(uri.toString?.() || "").trim();
    if (fromToString && fromToString !== "[object Object]") return fromToString;
  }
  return "";
}

export function normalizeName(value: string): string {
  return (value || "").trim().toLowerCase();
}

export function getTabs(gBrowser: GBrowserLike | null | undefined): BrowserTabLike[] {
  if (!gBrowser?.tabs) return [];
  return Array.from(gBrowser.tabs);
}

export function getTabGroups(
  gBrowser: GBrowserLike | null | undefined
): BrowserTabGroupLike[] {
  if (!gBrowser) return [];
  const groups = gBrowser.getAllTabGroups
    ? gBrowser.getAllTabGroups()
    : gBrowser.tabGroups || [];
  return Array.from(groups);
}

export function tabUrl(tab: BrowserTabLike | null | undefined): string {
  return toUrlString(tab?.linkedBrowser?.currentURI);
}

export function tabTitle(tab: BrowserTabLike | null | undefined): string {
  return (
    tab?.label ||
    tab?.linkedBrowser?.contentTitle ||
    tabUrl(tab) ||
    "(untitled)"
  );
}

export function findTabByIndex(
  gBrowser: GBrowserLike | null | undefined,
  index: number | undefined
): BrowserTabLike | null {
  const tabs = getTabs(gBrowser);
  if (!tabs.length) return null;
  if (index == null) return gBrowser?.selectedTab || tabs[0] || null;
  const i = Math.max(1, Math.floor(index));
  if (i > tabs.length) return null;
  return tabs[i - 1] || null;
}

export function findTabsByQuery(
  gBrowser: GBrowserLike | null | undefined,
  query: string
): BrowserTabLike[] {
  const target = normalizeName(query);
  if (!target) return [];
  return getTabs(gBrowser).filter(tab => {
    const title = normalizeName(tabTitle(tab));
    const url = normalizeName(tabUrl(tab));
    return title.includes(target) || url.includes(target);
  });
}

export function findGroupByName(
  gBrowser: GBrowserLike | null | undefined,
  name: string
): BrowserTabGroupLike | null {
  const match = findGroupByNameFuzzy(gBrowser, name);
  return match.group;
}

function levenshtein(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(0)
  );
  for (let i = 0; i < rows; i++) {
    matrix[i][0] = i;
  }
  for (let j = 0; j < cols; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[rows - 1][cols - 1];
}

export type FuzzyGroupMatch = {
  group: BrowserTabGroupLike | null;
  matchKind: "exact" | "substring" | "fuzzy" | "none";
  alternatives: BrowserTabGroupLike[];
  closestLabel: string | null;
};

export function findGroupByNameFuzzy(
  gBrowser: GBrowserLike | null | undefined,
  name: string
): FuzzyGroupMatch {
  const target = normalizeName(name);
  const groups = getTabGroups(gBrowser);
  if (!target || groups.length === 0) {
    return {
      group: null,
      matchKind: "none",
      alternatives: [],
      closestLabel: null,
    };
  }

  const exact = groups.find(
    group => normalizeName(group.label || "") === target
  );
  if (exact) {
    return {
      group: exact,
      matchKind: "exact",
      alternatives: [],
      closestLabel: exact.label || null,
    };
  }

  const substringMatches = groups.filter(group => {
    const label = normalizeName(group.label || "");
    return label.includes(target) || target.includes(label);
  });
  if (substringMatches.length === 1) {
    return {
      group: substringMatches[0],
      matchKind: "substring",
      alternatives: [],
      closestLabel: substringMatches[0].label || null,
    };
  }
  if (substringMatches.length > 1) {
    return {
      group: null,
      matchKind: "substring",
      alternatives: substringMatches.slice(0, 3),
      closestLabel: substringMatches[0].label || null,
    };
  }

  const scored = groups
    .map(group => {
      const label = normalizeName(group.label || "");
      return {
        group,
        distance: levenshtein(target, label),
      };
    })
    .filter(item => item.distance <= 2)
    .sort((a, b) => a.distance - b.distance);

  if (scored.length === 1) {
    return {
      group: scored[0].group,
      matchKind: "fuzzy",
      alternatives: [],
      closestLabel: scored[0].group.label || null,
    };
  }
  if (scored.length > 1) {
    return {
      group: null,
      matchKind: "fuzzy",
      alternatives: scored.slice(0, 3).map(item => item.group),
      closestLabel: scored[0].group.label || null,
    };
  }

  const closest = groups
    .map(group => ({
      group,
      distance: levenshtein(target, normalizeName(group.label || "")),
    }))
    .sort((a, b) => a.distance - b.distance)[0];

  return {
    group: null,
    matchKind: "none",
    alternatives: [],
    closestLabel: closest?.group.label || null,
  };
}

export function resolveActiveTabGroup(
  gBrowser: GBrowserLike | null | undefined
): BrowserTabGroupLike | null {
  const groups = getTabGroups(gBrowser);
  if (!groups.length) {
    return null;
  }
  const selected = gBrowser?.selectedTab;
  if (selected) {
    const containing = groups.find(group =>
      Array.from(group.tabs || []).some(tab => tab === selected)
    );
    if (containing) {
      return containing;
    }
  }
  return groups.reduce((largest, group) => {
    const count = Array.from(group.tabs || []).length;
    const largestCount = Array.from(largest.tabs || []).length;
    return count > largestCount ? group : largest;
  });
}

export function withUriFixup(rawInput: string, services: ServicesLike | null): string {
  let input = String(rawInput || "").trim();
  if (!input) return "";
  const info = services?.uriFixup?.getFixupURIInfo?.(input, 2 | 4);
  const fixed = toUrlString(info?.preferredURI);
  return fixed || input;
}

export function getSystemPrincipal(services: ServicesLike | null): unknown {
  return services?.scriptSecurityManager?.getSystemPrincipal?.();
}

export async function fetchChildrenBookmarks(
  places: PlacesUtilsLike | null | undefined,
  parentGuid: string
): Promise<PlacesBookmarkEntry[]> {
  if (!places?.bookmarks?.fetch || !parentGuid) return [];

  const collected: PlacesBookmarkEntry[] = [];
  const fetched = await places.bookmarks.fetch({ parentGuid }, (bookmark: PlacesBookmarkEntry) => {
    collected.push(bookmark);
  });

  if (collected.length > 0) {
    return collected;
  }
  if (Array.isArray(fetched)) {
    return fetched;
  }
  return fetched ? [fetched] : [];
}

export async function fetchBookmarkByGuid(
  places: PlacesUtilsLike | null | undefined,
  guid: string
): Promise<PlacesBookmarkEntry | null> {
  if (!places?.bookmarks?.fetch || !guid) return null;
  const fetched = await places.bookmarks.fetch(guid);
  if (!fetched) return null;
  if (Array.isArray(fetched)) {
    return fetched[0] || null;
  }
  return fetched;
}
