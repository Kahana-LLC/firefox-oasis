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
  const target = normalizeName(name);
  if (!target) return null;
  return (
    getTabGroups(gBrowser).find(group => normalizeName(group.label || "") === target) ||
    null
  );
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
