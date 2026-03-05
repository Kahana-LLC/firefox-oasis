import { bookmarkFolders, CreateFolderOpts } from "./bookmarkFolders";
import { localMemory } from "./services/localMemory";
import { subscriptionService } from "./services/subscription";
import {
  buildFolderUrlMap,
  filterStaleBookmarkFolderResults,
  hasBookmarkFolderCandidates,
} from "./utils/searchMemoryUtils";
import { getMemoryDocSource } from "./utils/localMemoryUtils";
import { assistantLogger } from "./utils/assistantLogger";
import {
  applyRoutingStateMutation,
  markRoutingStateDirty,
} from "./utils/deterministicRouter";
import {
  findGroupByName,
  findTabByIndex,
  findTabsByQuery,
  getChromeContext,
  getTabGroups,
  getTabs,
  normalizeName,
  tabTitle,
  tabUrl,
  toUrlString,
  withUriFixup,
} from "./services/firefoxFacade";
import {
  clearPendingAmbiguity,
  clearContinuationQueue,
  clearPendingConfirmation,
  clearRecentSearchResults,
  getRecentSearchResults,
  getPendingAmbiguity,
  getPendingConfirmation,
  setRecentSearchResults,
  setPendingConfirmation,
  type AmbiguityTarget,
  type InteractionCommandArgs,
  type RecentSearchResult,
} from "./services/interactionState";
import {
  getCommandExecutor,
  listRegisteredCommandNames,
} from "./services/commandExecutionRegistry";
import type {
  GBrowserLike,
  BrowserTabLike,
  BrowserWindowLike,
} from "./types/runtime";

type CommandArgs = InteractionCommandArgs;
type SearchResultItem = {
  title: string;
  url: string;
  snippet: string;
  bookmarkGuid?: string;
};

export type CmdResult = {
  message: string;
  requiresConfirmation?: boolean;
  confirmationData?: Record<string, unknown>;
};

export interface Command {
  commandName: string;
  description: string;
  execute(args: CommandArgs): Promise<CmdResult>;
}

/** Get the privileged top-level browser window/objects */
function getChrome() {
  const { topWin, gBrowser, Services, PlacesUtils } = getChromeContext();
  return { topWin, gBrowser, Services, PlacesUtils };
}

function stringArg(args: CommandArgs, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

function numberArg(args: CommandArgs, key: string): number | undefined {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanArg(args: CommandArgs, key: string): boolean | undefined {
  const value = args[key];
  return typeof value === "boolean" ? value : undefined;
}

function numberArrayArg(args: CommandArgs, key: string): number[] {
  const value = args[key];
  if (!Array.isArray(value)) return [];
  return value
    .map(item => (typeof item === "number" && Number.isFinite(item) ? item : null))
    .filter((item): item is number => item != null);
}

function ambiguityTargetArg(
  args: CommandArgs
): AmbiguityTarget | "cancel" | undefined {
  const value = stringArg(args, "target");
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "bookmark-folder" ||
    normalized === "tab-group" ||
    normalized === "tab" ||
    normalized === "cancel"
  ) {
    return normalized;
  }
  return undefined;
}

function tabByIndexOrCurrent(gBrowser: GBrowserLike | null, index: number | undefined): BrowserTabLike | null {
  if (index == null) return gBrowser?.selectedTab || null;
  return findTabByIndex(gBrowser, index);
}

function tabByIndex(gBrowser: { tabs: ArrayLike<BrowserTabLike> }, index: number): BrowserTabLike | null {
  const i = Math.max(1, Math.floor(index));
  const tabs = Array.from(gBrowser.tabs);
  if (i > tabs.length) return null;
  return tabs[i - 1] || null;
}

function normalizeQuery(value: string | undefined): string {
  return (value || "").trim().toLowerCase();
}

function toWebSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function analyzeGroupMoveImpact(tabsToMove: BrowserTabLike[]): {
  affectedGroups: string[];
  emptiedGroups: string[];
} {
  const affectedGroups = new Set<string>();
  const emptiedGroups = new Set<string>();

  for (const tab of tabsToMove) {
    const group = tab.group;
    if (!group) continue;

    const groupName = group.label || "(unnamed)";
    affectedGroups.add(groupName);

    const groupTabs = group.tabs || [];
    const movingTabs = groupTabs.filter(groupTab => tabsToMove.includes(groupTab));
    if (groupTabs.length > 0 && movingTabs.length === groupTabs.length) {
      emptiedGroups.add(groupName);
    }
  }

  return {
    affectedGroups: Array.from(affectedGroups),
    emptiedGroups: Array.from(emptiedGroups),
  };
}

const LIST_WINDOW_SCOPE_ALIASES = new Set([
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

function normalizeListTargetName(value: string): string {
  let next = String(value || "").replace(/["']/g, " ").trim();
  next = next.replace(/^\s*(?:my|the)\s+/i, "");
  next = next.replace(
    /\s+(?:tab\s*group|bookmark\s*folder|folder|group|hub)\s*$/i,
    ""
  );
  return next.trim();
}

/* ===========================
 * Tab Commands
 * =========================== */

export class ListTabsCommand implements Command {
  commandName = "list_tabs";
  description =
    "List tabs. Accepts optional arguments: { scope?: 'window'|'tab-group'|'bookmark-folder', name?: string }. If name is provided without scope, resolves tab-group vs bookmark-folder by runtime state.";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const { gBrowser } = getChrome();
    if (!gBrowser) return { message: "Browser UI (gBrowser) not available." };

    const scope = normalizeName(stringArg(args, "scope") || "");
    const name = normalizeListTargetName(stringArg(args, "name") || "");

    const listWindowTabs = (): CmdResult => {
      const titles = getTabs(gBrowser).map(tab => tabTitle(tab));
      return { message: JSON.stringify(titles.slice(0, 50)) };
    };

    const listGroupTabs = (groupName: string): CmdResult => {
      if (!groupName) {
        return { message: "Which tab group should I list tabs from?" };
      }
      const group = findGroupByName(gBrowser, groupName);
      if (!group) {
        return { message: `No tab group named "${groupName}".` };
      }

      const tabs = (group.tabs || []).slice(0, 50).map(tab => ({
        title: tabTitle(tab),
        url: tabUrl(tab),
      }));
      if (tabs.length === 0) {
        return { message: `Tab group "${groupName}" has no tabs.` };
      }
      return {
        message: `Tabs in tab group "${group.label || groupName}": ${JSON.stringify(tabs)}`,
      };
    };

    const listFolderTabs = async (folderName: string): Promise<CmdResult> => {
      if (!folderName) {
        return { message: "Which bookmark folder should I list tabs from?" };
      }
      const foldersReadOnly = await bookmarkFolders.getAllReadOnly();
      if (!foldersReadOnly.ok) {
        return { message: "Failed to read bookmark folders right now." };
      }
      const target = normalizeName(folderName);
      const folder = foldersReadOnly.folders.find(
        item => normalizeName(item.name) === target
      );
      if (!folder) {
        return { message: `No bookmark folder named "${folderName}".` };
      }

      const items = folder.items.slice(0, 50).map(item => ({
        title: item.title || item.url,
        url: item.url,
      }));
      if (items.length === 0) {
        return { message: `Bookmark folder "${folder.name}" is empty.` };
      }
      return {
        message: `Tabs in bookmark folder "${folder.name}": ${JSON.stringify(items)}`,
      };
    };

    if (
      scope === "window" ||
      scope === "current-window" ||
      scope === "this-window"
    ) {
      return listWindowTabs();
    }

    if (scope === "tab-group" || scope === "tab_group" || scope === "group") {
      return listGroupTabs(name);
    }

    if (
      scope === "bookmark-folder" ||
      scope === "bookmark_folder" ||
      scope === "folder" ||
      scope === "hub"
    ) {
      return await listFolderTabs(name);
    }

    if (name) {
      if (LIST_WINDOW_SCOPE_ALIASES.has(normalizeName(name))) {
        return listWindowTabs();
      }

      const group = findGroupByName(gBrowser, name);
      const foldersReadOnly = await bookmarkFolders.getAllReadOnly();

      if (!foldersReadOnly.ok) {
        if (group) {
          return listGroupTabs(name);
        }
        return {
          message:
            `I could not find a tab group named "${name}", and bookmark folders are temporarily unavailable. ` +
            `Try "list tabs", "list tabs in tab group ${name}", or retry in a moment.`,
        };
      }

      const folder = foldersReadOnly.folders.find(
        item => normalizeName(item.name) === normalizeName(name)
      );
      if (group && folder) {
        return {
          message:
            `I found both a tab group and a bookmark folder named "${name}". ` +
            `Say "list tabs in tab group ${name}" or "list tabs in bookmark folder ${name}".`,
        };
      }

      if (group) {
        return listGroupTabs(name);
      }

      if (folder) {
        return await listFolderTabs(name);
      }

      return {
        message:
          `I could not find a tab group or bookmark folder named "${name}". ` +
          `Try "list tabs" for open tabs, or "list tabs in tab group ${name}" / "list tabs in bookmark folder ${name}".`,
      };
    }

    return listWindowTabs();
  }
}

export class NewWindowCommand implements Command {
  commandName = "new_window";
  description = "Open a new browser window.";
  async execute(_args: CommandArgs): Promise<CmdResult> {
    const { topWin } = getChrome();
    if (!topWin?.OpenBrowserWindow) return { message: "Browser UI not available." };

    topWin.OpenBrowserWindow();
    return { message: "Successfully opened a new window." };
  }
}

export class OrganizeWindowsCommand implements Command {
  commandName = "organize_windows";
  description = "Arrange two or more windows side-by-side.";
  async execute(_args: CommandArgs): Promise<CmdResult> {
    const { Services } = getChrome();
    const windowManager = Services?.wm;
    const windows = windowManager?.getEnumerator?.("navigator:browser");
    if (!windows) return { message: "Services module not available." };
    const browserWindows: BrowserWindowLike[] = [];

    while (windows.hasMoreElements()) {
      const win = windows.getNext();
      const docEl = win.document?.documentElement;
      // Filter for visible, non-minimized windows if possible, or just all browser windows
      if (
        !win.closed &&
        docEl?.getAttribute("windowtype") === "navigator:browser"
      ) {
        browserWindows.push(win);
      }
    }

    if (browserWindows.length < 2) {
      return { message: "You need at least two windows to organize." };
    }

    // Use the screen of the first window as the target screen
    const screen = browserWindows[0].screen;
    const availWidth = screen.availWidth;
    const availHeight = screen.availHeight;
    const availLeft = screen.availLeft || 0;
    const availTop = screen.availTop || 0;
    const numWindows = browserWindows.length;
    const windowWidth = Math.floor(availWidth / numWindows);

    for (let i = 0; i < numWindows; i++) {
      const win = browserWindows[i];
      // Ensure the window is restored (not minimized/maximized) before resizing
      if (win.windowState !== 1) {
        // 1 is STATE_NORMAL
        win.restore();
      }

      const xPos = availLeft + windowWidth * i;
      win.resizeTo(windowWidth, availHeight);
      win.moveTo(xPos, availTop);
    }

    return { message: `Organized ${numWindows} windows side-by-side.` };
  }
}

export class ShowURLCommand implements Command {
  commandName = "show_url";
  description = "Open a URL in a new tab.";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const { topWin } = getChrome();
    if (!topWin?.openTrustedLinkIn) return { message: "Browser UI not available." };

    const url = stringArg(args, "url");
    if (!url) return { message: "Missing 'url' argument." };

    topWin.openTrustedLinkIn(url, "tab");
    return { message: `Successfully opened URL: ${url}` };
  }
}

export class OpenUrlCommand implements Command {
  commandName = "open_url";
  description = "Open a URL in a new browser tab. Arguments: { url: string }.";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const { topWin, Services } = getChrome();
    const rawUrl = stringArg(args, "url");
    if (!rawUrl) {
      return { message: "Missing 'url' argument." };
    }
    if (!topWin?.openTrustedLinkIn) {
      return { message: "Cannot open URL (openTrustedLinkIn not found)." };
    }

    const normalizedInput = rawUrl.trim();
    if (!normalizedInput) {
      return { message: "Missing 'url' argument." };
    }

    let url = normalizedInput;
    try {
      url = withUriFixup(normalizedInput, Services);
    } catch (error) {
      assistantLogger.warn("commands", "Failed to fixup URI", error);
    }
    topWin.openTrustedLinkIn(url, "tab");
    return { message: `Opened URL in a new tab: ${url}` };
  }
}

export class WebSearchCommand implements Command {
  commandName = "web_search";
  description =
    "Search the web in a new tab. Arguments: { query: string }.";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const { topWin } = getChrome();
    const query = stringArg(args, "query");
    if (!query) {
      return { message: "Missing 'query' argument." };
    }
    if (!topWin?.openTrustedLinkIn) {
      return { message: "Cannot open web search (openTrustedLinkIn not found)." };
    }
    const searchUrl = toWebSearchUrl(query);
    topWin.openTrustedLinkIn(searchUrl, "tab");
    return { message: `Opened web search for "${query}" in a new tab.` };
  }
}

export class OpenTabCommand implements Command {
  commandName = "open_tab";
  description =
    "Legacy alias that opens a URL or web query in a new tab. Prefer open_url({url}) or web_search({query}).";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const url = stringArg(args, "url");
    const query = stringArg(args, "query");
    if (query?.trim()) {
      return await new WebSearchCommand().execute({ query });
    }
    if (!url) {
      return { message: "Missing 'url' argument." };
    }
    if (url.includes(" ")) {
      return await new WebSearchCommand().execute({ query: url });
    }
    return await new OpenUrlCommand().execute({ url });
  }
}

export class CloseTabCommand implements Command {
  commandName = "close_tab";
  description =
    "Close the active tab (or a tab by index). Accepts arguments: { index?: number, confirmed?: boolean } (1-based).";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const { gBrowser } = getChrome();
    if (!gBrowser) return { message: "Browser UI (gBrowser) not available." };
    const idx = numberArg(args, "index");
    const tab = tabByIndexOrCurrent(gBrowser, idx);
    if (!tab) return { message: idx != null ? `No tab ${idx}.` : "No active tab." };
    const title = tabTitle(tab);

    if (booleanArg(args, "confirmed") !== true) {
      setPendingConfirmation({
        command: "close_tab",
        args: { ...args, confirmed: true },
        description: `Close tab "${title}"?`,
      });
      return {
        message: `Requesting confirmation to close tab "${title}"...`,
        requiresConfirmation: true,
        confirmationData: { title },
      };
    }

    clearPendingConfirmation();
    gBrowser.removeTab?.(tab);
    return { message: `Closed tab: ${title}` };
  }
}

export class MoveTabToNewWindowCommand implements Command {
  commandName = "move_tab_to_new_window";
  description =
    "Move the active tab (or a tab by index) to a new window. Accepts arguments: { index?: number } (1-based).";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const { topWin, gBrowser } = getChrome();
    if (!gBrowser || !topWin?.OpenBrowserWindow) {
      return { message: "Browser UI not available." };
    }

    const idx = numberArg(args, "index");
    const tab = tabByIndexOrCurrent(gBrowser, idx);
    if (!tab) return { message: idx != null ? `No tab ${idx}.` : "No active tab." };

    const title = tabTitle(tab);
    const newWin = topWin.OpenBrowserWindow();
    await new Promise(r => setTimeout(r, 250)); // give it a tick
    newWin.gBrowser?.adoptTab?.(tab, 0);
    return { message: `Moved tab to new window: ${title}` };
  }
}

export class CopyTabUrlsCommand implements Command {
  commandName = "copy_tab_urls";
  description =
    "Copy all tab URLs in the current window to the clipboard (one per line). Accepts no arguments.";
  async execute(_args: CommandArgs): Promise<CmdResult> {
    const { gBrowser } = getChrome();
    if (!gBrowser) return { message: "Browser UI (gBrowser) not available." };
    const urls = getTabs(gBrowser)
      .map(tab => tabUrl(tab))
      .filter(Boolean);
    const text = urls.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      return { message: `Copied ${urls.length} URLs to clipboard.` };
    } catch {
      return { message: `Copied fallback. URLs:\n${text}` };
    }
  }
}

/* ===========================
 * Bookmark Folder Commands (formerly Hubs)
 * =========================== */

export class CreateBookmarkFolderCommand implements Command {
  commandName = "create_bookmark_folder";
  description =
    "Create a managed bookmark folder. Accepts arguments: { name: string, include?: 'none'|'current'|'all' }.";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const name = stringArg(args, "name") || "";
    const includeRaw = stringArg(args, "include");
    const include: CreateFolderOpts["include"] =
      includeRaw === "current" || includeRaw === "all" || includeRaw === "none"
        ? includeRaw
        : "none";
    const res = await bookmarkFolders.create(name, { include });
    applyRoutingStateMutation({
      kind: "upsert",
      entity: "folder",
      name: res.name,
    });
    return { message: `Created bookmark folder "${res.name}" with ${res.count} items.` };
  }
}

export class DeleteBookmarkFolderCommand implements Command {
  commandName = "delete_bookmark_folder";
  description =
    "Delete a managed bookmark folder by name. Accepts arguments: { name: string, closeTabs?: boolean, confirmed?: boolean }.";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const name = stringArg(args, "name");
    if (!name) return { message: "Which folder should I delete?" };

    if (booleanArg(args, "confirmed") !== true) {
      const closeTabs = booleanArg(args, "closeTabs") === true;
      const closeMsg = closeTabs ? " and close all associated tabs" : "";
      setPendingConfirmation({
        command: "delete_bookmark_folder",
        args: { ...args, confirmed: true },
        description: `Delete bookmark folder "${name}"${closeMsg}?`,
      });
      return {
        message: `Requesting confirmation to delete bookmark folder "${name}"${closeMsg}...`,
        requiresConfirmation: true,
        confirmationData: { name, closeTabs },
      };
    }

    clearPendingConfirmation();
    const closeTabs = booleanArg(args, "closeTabs") === true;
    const res = await bookmarkFolders.delete(name, { closeTabs });
    if (res.removed === 0) return { message: `No folder named "${name}".` };
    applyRoutingStateMutation({
      kind: "delete",
      entity: "folder",
      name: res.name,
    });
    return {
      message: `Deleted bookmark folder "${res.name}" (${res.removed} items removed).`,
    };
  }
}

export class ListBookmarkFoldersCommand implements Command {
  commandName = "list_bookmark_folders";
  description = "List all managed bookmark folders. Accepts no arguments.";
  async execute(_args: CommandArgs): Promise<CmdResult> {
    const items = await bookmarkFolders.list();
    if (!items.length) return { message: "No bookmark folders yet." };
    return {
      message: JSON.stringify(items.map(h => `${h.name} (${h.count})`)),
    };
  }
}

export class RenameBookmarkFolderCommand implements Command {
  commandName = "rename_bookmark_folder";
  description =
    "Rename a managed bookmark folder. Accepts arguments: { from: string, to: string }.";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const from = stringArg(args, "from");
    const to = stringArg(args, "to");
    if (!from || !to)
      return { message: "Please provide old and new folder names." };
    const r = await bookmarkFolders.rename(from, to);
    if (r.ok) {
      applyRoutingStateMutation({
        kind: "rename",
        entity: "folder",
        from,
        to,
      });
    }
    return {
      message: r.ok
        ? `Renamed "${from}" to "${to}".`
        : `Rename failed: ${r.msg || "unknown error"}`,
    };
  }
}

export class AddTabToBookmarkFolderCommand implements Command {
  commandName = "add_tab_to_bookmark_folder";
  description =
    "Add tabs to a managed bookmark folder. Accepts arguments: { name: string, query?: string, all?: boolean } (query matches title/URL). all=true adds all tabs. If no query/all, adds current tab.";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const name = stringArg(args, "name");
    if (!name) return { message: "Which folder should I add tabs to?" };

    const { gBrowser } = getChrome();
    if (!gBrowser) return { message: "Browser UI not available." };

    const query = normalizeQuery(stringArg(args, "query"));
    const all = booleanArg(args, "all") === true;
    let tabsToAdd: BrowserTabLike[] = [];

    if (all) {
      tabsToAdd = getTabs(gBrowser);
    } else if (query) {
      tabsToAdd = findTabsByQuery(gBrowser, query);

      if (tabsToAdd.length === 0) {
        return { message: `No tabs found matching "${stringArg(args, "query") || ""}".` };
      }
    } else {
      // Default to current tab
      const current = gBrowser.selectedTab;
      if (current) {
        tabsToAdd = [current];
      }
    }

    if (tabsToAdd.length === 0) return { message: "No tabs available to add." };

    const r = await bookmarkFolders.addTabs(name, tabsToAdd);

    if (!r.ok) return { message: `Failed to add tabs to "${name}".` };
    applyRoutingStateMutation({
      kind: "upsert",
      entity: "folder",
      name,
    });

    const count = tabsToAdd.length;
    return { message: `Added ${count} tab(s) to bookmark folder "${name}".` };
  }
}

export class RemoveTabFromBookmarkFolderCommand implements Command {
  commandName = "remove_tab_from_bookmark_folder";
  description =
    "Remove a tab from a managed bookmark folder. Accepts arguments: { name: string, url?: string } (defaults to current tab URL).";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const name = stringArg(args, "name");
    if (!name) return { message: "Which folder?" };

    let url = stringArg(args, "url");
    if (!url) {
      const { gBrowser } = getChrome();
      if (gBrowser) {
        url = tabUrl(gBrowser.selectedTab || null);
      }
    }

    if (!url) return { message: "Could not determine URL to remove." };

    const r = await bookmarkFolders.removeUrl(name, url);
    return {
      message: r.ok
        ? `Removed URL from folder "${name}".`
        : `Failed to remove URL from folder "${name}" (maybe not found).`,
    };
  }
}

export class OpenBookmarkFolderCommand implements Command {
  commandName = "open_bookmark_folder";
  description =
    "Open all bookmarks from a managed folder. Accepts arguments: { name: string, where?: 'tabs'|'window'|'tabgroup' }. 'tabgroup' creates a new visual group.";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const name = stringArg(args, "name");
    if (!name) return { message: "Which folder should I open?" };
    const whereRaw = stringArg(args, "where");
    const where: "tabs" | "window" | "tabgroup" =
      whereRaw === "window" || whereRaw === "tabgroup" ? whereRaw : "tabs";
    const r = await bookmarkFolders.openFolder(name, where);
    return {
      message: r.ok
        ? `Opened folder "${name}" in ${where}.`
        : `Failed to open folder "${name}".`,
    };
  }
}

export class AddSplitViewCommand implements Command {
  commandName = "add_split_view";
  description =
    "Add split view with tabs side-by-side. Accepts arguments: { indices?: [number, number], withIndex?: number, withQuery?: string }. Use 'indices' to specify two tabs by number. Use 'withIndex' or 'withQuery' to split current tab with another. If no arguments, opens split view with a new tab.";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const { topWin, gBrowser, Services } = getChrome();
    if (!gBrowser || !topWin) return { message: "Browser UI not available." };

    const splitViewEnabled = Services?.prefs?.getBoolPref?.(
      "browser.tabs.splitView.enabled",
      false
    );
    if (!splitViewEnabled) {
      return { message: "Split view is not enabled in this browser." };
    }

    let tab1: BrowserTabLike | null = null;
    let tab2: BrowserTabLike | null = null;

    const indices = numberArrayArg(args, "indices");
    if (indices.length >= 2) {
      const i1 = Math.max(1, Math.floor(indices[0]));
      const i2 = Math.max(1, Math.floor(indices[1]));
      const first = tabByIndex(gBrowser, i1);
      const second = tabByIndex(gBrowser, i2);
      if (!first) return { message: `No tab ${i1}.` };
      if (!second) return { message: `No tab ${i2}.` };
      if (i1 === i2) return { message: "Cannot split a tab with itself." };
      tab1 = first;
      tab2 = second;
    } else {
      tab1 = gBrowser.selectedTab || null;
      const withIndex = numberArg(args, "withIndex");
      const withQuery = normalizeQuery(stringArg(args, "withQuery"));

      if (withIndex != null) {
        const i = Math.max(1, Math.floor(withIndex));
        tab2 = tabByIndex(gBrowser, i);
        if (!tab2) return { message: `No tab ${i}.` };
      } else if (withQuery) {
        tab2 = findTabsByQuery(gBrowser, withQuery)[0] || null;
        if (!tab2) {
          return { message: `No tab found matching "${stringArg(args, "withQuery") || ""}".` };
        }
      } else {
        tab2 = gBrowser.addTrustedTab?.("about:newtab") || null;
      }
    }

    if (!tab1 || !tab2) return { message: "Unable to resolve tabs for split view." };
    if (tab1 === tab2) {
      return { message: "Cannot split a tab with itself." };
    }

    if (tab1.pinned || tab2.pinned) {
      return { message: "Cannot add pinned tabs to split view." };
    }

    if (tab1.splitview) {
      return { message: `Tab "${tab1.label}" is already in a split view.` };
    }
    if (tab2.splitview) {
      return { message: `Tab "${tab2.label}" is already in a split view.` };
    }

    try {
      gBrowser.addTabSplitView?.([tab1, tab2], {
        insertBefore: tab1,
      });

      const title1 = tabTitle(tab1);
      const title2 = tabTitle(tab2);
      return {
        message: `Added split view: "${title1}" and "${title2}".`,
      };
    } catch (e) {
      return { message: `Failed to create split view: ${e}` };
    }
  }
}

export class RemoveSplitViewCommand implements Command {
  commandName = "remove_split_view";
  description = "Remove split view from the current tab (unsplit tabs).";
  async execute(_args: CommandArgs): Promise<CmdResult> {
    const { gBrowser } = getChrome();
    if (!gBrowser) return { message: "Browser UI not available." };

    const currentTab = gBrowser.selectedTab;
    if (!currentTab) return { message: "No active tab found." };
    const splitview = currentTab.splitview;

    if (!splitview?.unsplitTabs) {
      return { message: "This tab is not in a split view." };
    }

    try {
      splitview.unsplitTabs();
      return { message: "Split view removed. Tabs are now separate." };
    } catch (e) {
      return { message: `Failed to remove split view: ${e}` };
    }
  }
}

export class SplitTabsCommand implements Command {
  commandName = "split_tabs";
  description =
    "Split specified tabs into side-by-side windows. Accepts arguments: { indices: number[] }.";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const { topWin, gBrowser } = getChrome();
    if (!gBrowser || !topWin?.OpenBrowserWindow) return { message: "Browser UI not available." };

    const indices = numberArrayArg(args, "indices");
    if (indices.length < 2) {
      return {
        message:
          "Please provide at least 2 tab indices to split (e.g., { indices: [1, 2] }).",
      };
    }

    // Validate all indices first
    const tabs: BrowserTabLike[] = [];
    for (const idx of indices) {
      const i = Math.max(1, Math.floor(idx));
      const tab = tabByIndex(gBrowser, i);
      if (!tab) return { message: `No tab ${i}.` };
      tabs.push(tab);
    }

    // Get screen dimensions
    const screen = topWin.screen;
    const availWidth = screen.availWidth;
    const availHeight = screen.availHeight;
    const availLeft = screen.availLeft || 0;
    const availTop = screen.availTop || 0;

    const numTabs = tabs.length;
    const windows: Array<{ win: BrowserWindowLike; tab: BrowserTabLike; title: string }> = [];

    // Create windows for each tab
    for (let i = 0; i < numTabs; i++) {
      const tab = tabs[i];
      const title = tabTitle(tab);

      // Create new window
      const newWin = topWin.OpenBrowserWindow();
      windows.push({ win: newWin, tab, title });

      // Small delay to ensure window is created
      await new Promise(r => setTimeout(r, 100));
    }

    // Give windows time to fully initialize
    await new Promise(r => setTimeout(r, 300));

    // Position and resize windows, then move tabs
    for (let i = 0; i < numTabs; i++) {
      const { win, tab } = windows[i];

      // Horizontal layout (side-by-side, left to right)
      const windowWidth = Math.floor(availWidth / numTabs);
      const windowHeight = availHeight;
      const xPos = availLeft + windowWidth * i;
      const yPos = availTop;

      win.resizeTo(windowWidth, windowHeight);
      win.moveTo(xPos, yPos);

      // Close the sidebar if it's open (since session storage isn't implemented yet)
      try {
        const sidebar = win.document?.getElementById("sidebar-box") as
          | { hidden?: boolean }
          | null;
        if (sidebar && !sidebar.hidden) {
          win.SidebarController?.hide?.();
        }
      } catch (e) {
        assistantLogger.warn("commands", "Failed to close sidebar", e);
      }

      // Move the tab to the new window
      win.gBrowser?.adoptTab?.(tab, 0);
    }

    const tabTitles = windows.map(w => w.title).join(", ");
    return { message: `Split ${numTabs} tabs side-by-side: ${tabTitles}` };
  }
}

export class SummarizePageCommand implements Command {
  commandName = "summarize_page";
  description =
    "Summarize the content of a webpage. Accepts arguments: { index?: number, query?: string }. Use 'index' for tab number (1-based), 'query' to find tab by title/URL. If no arguments, summarizes current tab.";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const { gBrowser } = getChrome();
    if (!gBrowser) return { message: "Browser UI not available." };

    const idx = numberArg(args, "index");
    let tab = tabByIndexOrCurrent(gBrowser, idx);
    
    // Allow specifying tab by index
    if (idx != null && !tab) return { message: `No tab ${idx}.` };
    
    // Allow specifying tab by query (title/URL match)
    const query = normalizeQuery(stringArg(args, "query"));
    if (query && !idx) {
      tab = findTabsByQuery(gBrowser, query)[0] || null;
      if (!tab) {
        return { message: `No tab found matching "${stringArg(args, "query") || ""}".` };
      }
    }
    
    const browser = tab?.linkedBrowser;
    if (!browser) return { message: "No active tab found." };

    const url = browser.currentURI?.spec || "";
    const title = tabTitle(tab);
    
    // Skip certain pages that can't be summarized
    if (url.startsWith("about:") || url.startsWith("chrome://") || url.startsWith("moz-extension://")) {
      return { message: "Cannot summarize browser internal pages." };
    }

    try {
      // Use PageExtractor actor for Fission-compatible content extraction
      const currentWindowContext = browser.browsingContext?.currentWindowContext;
      
      if (!currentWindowContext) {
        return { message: "Cannot access page content. The page may still be loading." };
      }

      const pageExtractor = currentWindowContext.getActor("PageExtractor");
      
      if (!pageExtractor) {
        return { message: "Page content extractor not available." };
      }

      // Try Reader Mode first (cleaner content), fall back to full text
      let content = "";
      try {
        content = (await pageExtractor.getReaderModeContent?.()) || "";
      } catch (e) {
        assistantLogger.warn(
          "commands",
          "Reader mode extraction failed, trying full text",
          e
        );
      }

      // If reader mode failed or returned empty, try full text extraction
      if (!content || content.length < 50) {
        try {
          const result = await pageExtractor.getText?.();
          content = typeof result === "string" ? result : result?.text || "";
        } catch (e) {
          assistantLogger.warn("commands", "Full text extraction failed", e);
        }
      }

      // Clean up whitespace
      content = content
        .replace(/\s+/g, " ")
        .replace(/\n\s*\n/g, "\n")
        .trim();

      if (!content || content.length < 50) {
        return { message: "Not enough content found on this page to summarize." };
      }

      // Truncate to reasonable length for LLM (roughly 10k chars ≈ 2.5k tokens)
      const maxLength = 12000;
      if (content.length > maxLength) {
        content = content.substring(0, maxLength) + "...";
      }

      // Return the content for the chat node to summarize
      return {
        message: `__SUMMARIZE_REQUEST__\nTitle: ${title}\nURL: ${url}\n\nContent:\n${content}`,
      };
    } catch (e) {
      return { message: `Failed to extract page content: ${e}` };
    }
  }
}

export class SearchMemoryCommand implements Command {
  commandName = "search_memory";
  description =
    `Search across multiple local sources: browsing history, bookmarks (including managed bookmark folders), open tabs, tab groups, and stored memory. ` +
    `Arguments: { query: string, folder?: string, source?: 'bookmark-folder' }. ` +
    `'folder' filters to a specific managed bookmark folder; 'source' can scope to bookmark-folder results. ` +
    `Returns JSON with: { summary: string, resultsBySource: { [source]: [{ title, url, snippet }] }, results: [{ index, source, title, url, context, snippet }] }. ` +
    `Sources are: "history", "bookmark", "bookmark-folder", "tab", "tab-group", "memory".`;
  async execute(args: CommandArgs): Promise<CmdResult> {
    const query = stringArg(args, "query");
    const folder = stringArg(args, "folder");
    const source = stringArg(args, "source");
    const sourceScope = source === "bookmark-folder" ? "bookmark-folder" : undefined;
    if (!query) return { message: "Missing 'query' argument." };

    let results = await localMemory.search(
      query,
      10,
      folder ? { folder } : undefined
    );

    if (hasBookmarkFolderCandidates(results)) {
      const snapshot = await bookmarkFolders.getAllReadOnly();
      if (snapshot.ok) {
        const folderToUrls = buildFolderUrlMap(snapshot.folders);
        const filtered = filterStaleBookmarkFolderResults(results, folderToUrls);
        results = filtered.results;
        if (filtered.dropped > 0) {
          assistantLogger.debug(
            "search-memory",
            "Dropped stale bookmark-folder results",
            { dropped: filtered.dropped }
          );
        }
      } else {
        assistantLogger.warn(
          "search-memory",
          "Read-only folder snapshot failed; returning lexical results"
        );
      }
    }

    const folderScoped = Boolean(folder);
    const requiresBookmarkFolderOnly = folderScoped || sourceScope === "bookmark-folder";
    if (requiresBookmarkFolderOnly) {
      const before = results.length;
      results = results.filter((r) => getMemoryDocSource(r) === "bookmark-folder");
      if (before !== results.length) {
        assistantLogger.debug(
          "search-memory",
          "Restricted results to bookmark-folder scope",
          {
            before,
            after: results.length,
            folderScoped,
            sourceScope: sourceScope || "none",
          }
        );
      }
    }

    const scopeSuffix = folder
      ? ` in bookmark folder "${folder}"`
      : sourceScope === "bookmark-folder"
        ? " in bookmark folders"
        : "";

    if (results.length === 0) {
      clearRecentSearchResults();
      if (!folderScoped && !sourceScope && query.trim() !== "*") {
        setPendingConfirmation({
          command: "web_search",
          args: { query },
          description: `No local matches found for "${query}". Search the web in a new tab?`,
        });
        return {
          message:
            `No local matches found for "${query}". ` +
            `Would you like me to open a web search in a new tab?`,
          requiresConfirmation: true,
          confirmationData: { query, url: toWebSearchUrl(query) },
        };
      }
      const guidance = folder
        ? ` Try "list tabs in bookmark folder ${folder}" to inspect what is saved there.`
        : "";
      return {
        message: `No matches found for "${query}"${scopeSuffix}.${guidance}`,
      };
    }

    const sourceMap: Record<string, string> = {
      history: "history",
      bookmark: "bookmark",
      tab: "tab",
      "tab-group": "tab-group",
      hub_item: "bookmark-folder",
      bookmark_folder_item: "bookmark-folder",
      memory: "memory",
    };

    const structured: RecentSearchResult[] = results.map((r, i) => {
      const rawType = r.metadata?.type || "memory";
      const source = sourceMap[rawType] || rawType;
      const resolvedUrl = r.url || r.metadata?.url || r.metadata?.hubName || "";
      return {
        index: i + 1,
        source,
        title: r.metadata?.title || "(no title)",
        url: resolvedUrl,
        bookmarkGuid: r.metadata?.bookmarkGuid || undefined,
        context:
          r.metadata?.context ||
          (source === "history" ? "Browsing History" :
           source === "bookmark" ? "Bookmarks" :
           source === "bookmark-folder" ? `Bookmark Folder: ${r.metadata?.hubName || "unknown"}` :
           source === "tab" ? "Open Tab" :
           source === "tab-group" ? "Tab Group" :
           "Memory"),
        snippet: r.text.length > 120 ? r.text.substring(0, 120) + "..." : r.text,
      };
    });
    setRecentSearchResults(structured);

    const resultsBySource: Record<string, SearchResultItem[]> = {};
    for (const r of structured) {
      if (!resultsBySource[r.source]) resultsBySource[r.source] = [];
      resultsBySource[r.source].push({
        title: r.title,
        url: r.url,
        snippet: r.snippet,
        bookmarkGuid: r.bookmarkGuid,
      });
    }

    const sourceCounts = Object.entries(resultsBySource)
      .map(([src, items]) => `${items.length} from ${src}`)
      .join(", ");
    const summary = `Found ${structured.length} result(s) for "${query}"${scopeSuffix}: ${sourceCounts}.`;

    return { message: JSON.stringify({ summary, resultsBySource, results: structured }) };
  }
}

export class GetRecentSearchResultsCommand implements Command {
  commandName = "get_recent_search_results";
  description =
    "Get cached results from the most recent search_memory command. Arguments: { limit?: number }.";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const limit = numberArg(args, "limit");
    const cappedLimit =
      limit != null ? Math.max(1, Math.min(Math.floor(limit), 25)) : 5;
    const recent = getRecentSearchResults();
    if (recent.length === 0) {
      return {
        message: JSON.stringify({
          summary: "No recent search results available.",
          results: [],
        }),
      };
    }

    const results = recent.slice(0, cappedLimit).map((result, idx) => ({
      index: idx + 1,
      source: result.source,
      title: result.title,
      url: result.url,
      bookmarkGuid: result.bookmarkGuid,
      context: result.context,
      snippet: result.snippet,
    }));
    return {
      message: JSON.stringify({
        summary: `Found ${results.length} cached recent search result(s).`,
        results,
      }),
    };
  }
}

export class OpenSearchResultCommand implements Command {
  commandName = "open_search_result";
  description =
    "Open a search result. Accepts arguments: { url?: string, index?: number, type?: string, bookmarkGuid?: string }. If index is provided (or omitted), resolves from recent search results. If type is 'tab', switches to it if found.";
  async execute(args: CommandArgs): Promise<CmdResult> {
    let url = stringArg(args, "url");
    const index = numberArg(args, "index");
    let type = stringArg(args, "type");
    let bookmarkGuid = stringArg(args, "bookmarkGuid");

    if (!url) {
      const recent = getRecentSearchResults();
      if (recent.length === 0) {
        return {
          message:
            "No recent search result is available to open. Run a search first or pass a URL.",
        };
      }
      const targetIndex = index != null ? Math.max(1, Math.floor(index)) : 1;
      const selected = recent[targetIndex - 1];
      if (!selected?.url) {
        return {
          message:
            `Result index ${targetIndex} is out of range. ` +
            `I currently have ${recent.length} recent result(s).`,
        };
      }
      url = selected.url;
      bookmarkGuid = bookmarkGuid || selected.bookmarkGuid;
      if (!type && selected.source === "tab") {
        type = "tab";
      }
    }

    const { topWin, gBrowser, PlacesUtils } = getChrome();
    if (!topWin?.openTrustedLinkIn || !gBrowser) return { message: "Browser UI not available." };

    // If we have a bookmark GUID, prefer a fresh URL from Places at open-time.
    if (bookmarkGuid && PlacesUtils?.bookmarks?.fetch) {
      try {
        const fetched = await PlacesUtils.bookmarks.fetch(bookmarkGuid);
        const bookmark = Array.isArray(fetched) ? fetched[0] : fetched;
        const freshUrl = toUrlString(bookmark?.url);
        if (freshUrl) {
          url = freshUrl;
        }
      } catch (e) {
        assistantLogger.warn(
          "open-search-result",
          `Failed bookmark GUID lookup guid=${bookmarkGuid}`,
          e
        );
      }
    }

    if (!url) return { message: "Missing 'url' argument." };

    // If it's an open tab, try to find and switch to it
    if (type === "tab") {
      const foundTab = getTabs(gBrowser).find(tab => tabUrl(tab) === url);
      
      if (foundTab) {
        gBrowser.selectedTab = foundTab;
        return { message: `Switched to tab: ${url}` };
      }
    }

    // Otherwise (or if tab not found), open in new tab
    topWin.openTrustedLinkIn(url, "tab");
    return { message: `Opened in new tab: ${url}` };
  }
}

export class ShowSubscriptionCommand implements Command {
  commandName = "show_subscription";
  description = "Show the current subscription plan and usage options.";
  async execute(_args: CommandArgs): Promise<CmdResult> {
    const { topWin } = getChrome();
    if (!topWin?.openTrustedLinkIn) return { message: "Browser UI not available." };

    const stats = await subscriptionService.checkAvailability();
    const url = subscriptionService.getSubscriptionUrl();

    topWin.openTrustedLinkIn(url, "tab");

    return {
      message: `Opened subscription page.\nUsage this month: ${stats.totalUnits} units / ${stats.limit} limit.`,
    };
  }
}

/* ===========================
 * Tab Group Commands (Native Firefox Tab Groups)
 * =========================== */

export class ListTabGroupsCommand implements Command {
  commandName = "list_tab_groups";
  description =
    "List all tab groups in the current window. Accepts no arguments.";
  async execute(_args: CommandArgs): Promise<CmdResult> {
    const { gBrowser } = getChrome();
    if (!gBrowser) return { message: "Browser UI (gBrowser) not available." };

    const groups = getTabGroups(gBrowser);
    if (groups.length === 0) {
      return { message: "No tab groups in this window." };
    }

    const groupInfo = groups.map(group => ({
      name: group.label || "(unnamed)",
      tabCount: (group.tabs || []).length,
      collapsed: group.collapsed || false,
    }));

    return { message: JSON.stringify(groupInfo) };
  }
}

export class CreateTabGroupCommand implements Command {
  commandName = "create_tab_group";
  description =
    "Create a new tab group from specified tabs. Accepts arguments: { name: string, indices?: number[], openUrl?: string, confirmed?: boolean }. Use 'openUrl' to open a URL in the new group. If no indices provided, creates with current tab (or new tab if current is already grouped).";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const { gBrowser, Services } = getChrome();
    if (!gBrowser) return { message: "Browser UI (gBrowser) not available." };

    const name = stringArg(args, "name") || "New Group";
    const indices = numberArrayArg(args, "indices");

    let tabsToGroup: BrowserTabLike[] = [];
    let createdNewTab = false;
    const openUrl = stringArg(args, "openUrl");

    if (indices.length > 0) {
      for (const idx of indices) {
        const i = Math.max(1, Math.floor(idx));
        const tab = tabByIndex(gBrowser, i);
        if (!tab) return { message: `No tab ${i}.` };
        tabsToGroup.push(tab);
      }
    } else if (openUrl) {
      // If a URL is specified, create a new tab with that URL for the group
      let url = openUrl;
      // Fixup URL if needed
      if (!url.includes("://")) {
        try {
          url = withUriFixup(url, Services);
        } catch (e) {
          // Fallback: add https://
          if (!url.startsWith("http")) {
            url = "https://" + url;
          }
        }
      }
      const newTab = gBrowser.addTrustedTab?.(url);
      if (!newTab) return { message: "Failed to open a tab for the new group." };
      tabsToGroup = [newTab];
      createdNewTab = true;
    } else {
      const currentTab = gBrowser.selectedTab || null;
      // If current tab is already in a group, create a new tab instead of moving it
      if (currentTab?.group) {
        const newTab = gBrowser.addTrustedTab?.("about:newtab");
        if (!newTab) return { message: "Failed to create a tab for the new group." };
        tabsToGroup = [newTab];
        createdNewTab = true;
      } else {
        if (!currentTab) return { message: "No active tab available." };
        tabsToGroup = [currentTab];
      }
    }

    const groupableTabs = tabsToGroup.filter(tab => !tab.pinned);
    if (groupableTabs.length === 0) {
      return { message: "No groupable tabs (pinned tabs cannot be grouped)." };
    }

    // Check if any tabs are already in groups
    const tabsInGroups = groupableTabs.filter(tab => !!tab.group);
    if (tabsInGroups.length > 0 && booleanArg(args, "confirmed") !== true) {
      const impact = analyzeGroupMoveImpact(tabsInGroups);
      const groupNames = impact.affectedGroups.join(", ");

      let warningMsg = `${tabsInGroups.length} tab(s) will be moved from existing group(s): ${groupNames}.`;
      if (impact.emptiedGroups.length > 0) {
        warningMsg += ` This will delete the following empty group(s): ${impact.emptiedGroups.join(", ")}.`;
      }
      warningMsg += ` Create "${name}" anyway?`;

      setPendingConfirmation({
        command: "create_tab_group",
        args: { ...args, confirmed: true },
        description: warningMsg,
      });
      return {
        message: warningMsg,
        requiresConfirmation: true,
        confirmationData: {
          name,
          affectedGroups: impact.affectedGroups,
          willBeEmpty: impact.emptiedGroups,
        },
      };
    }

    clearPendingConfirmation();

    try {
      gBrowser.addTabGroup?.(groupableTabs, { label: name });
      applyRoutingStateMutation({
        kind: "upsert",
        entity: "group",
        name,
      });
      let msg: string;
      if (openUrl) {
        msg = `Created tab group "${name}" and opened ${openUrl} in it.`;
      } else if (createdNewTab) {
        msg = `Created tab group "${name}" with a new tab.`;
      } else {
        msg = `Created tab group "${name}" with ${groupableTabs.length} tab(s).`;
      }
      return { message: msg };
    } catch (e) {
      return { message: `Failed to create tab group: ${e}` };
    }
  }
}

export class DeleteTabGroupCommand implements Command {
  commandName = "delete_tab_group";
  description =
    "Delete a tab group by name. Accepts arguments: { name: string, closeTabs?: boolean, confirmed?: boolean }.";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const { gBrowser } = getChrome();
    if (!gBrowser) return { message: "Browser UI (gBrowser) not available." };

    const name = stringArg(args, "name");
    if (!name) return { message: "Which tab group should I delete?" };

    const group = findGroupByName(gBrowser, name);

    if (!group) {
      return { message: `No tab group named "${name}".` };
    }

    const tabCount = (group.tabs || []).length;
    const closeTabs = booleanArg(args, "closeTabs") === true;

    if (booleanArg(args, "confirmed") !== true) {
      const closeMsg = closeTabs
        ? " and close all its tabs"
        : " (tabs will be ungrouped)";
      setPendingConfirmation({
        command: "delete_tab_group",
        args: { ...args, confirmed: true },
        description: `Delete tab group "${name}"${closeMsg}?`,
      });
      return {
        message: `Requesting confirmation to delete tab group "${name}" (${tabCount} tabs)${closeMsg}...`,
        requiresConfirmation: true,
        confirmationData: { name, tabCount, closeTabs },
      };
    }

    clearPendingConfirmation();

    try {
      const tabs = group.tabs || [];
      if (closeTabs) {
        for (const tab of tabs) {
          gBrowser.removeTab?.(tab);
        }
      } else {
        for (const tab of tabs) {
          gBrowser.ungroupTab?.(tab);
        }
      }
      applyRoutingStateMutation({
        kind: "delete",
        entity: "group",
        name: group.label || name,
      });
      return {
        message: `Deleted tab group "${name}"${closeTabs ? " and closed its tabs" : ""}.`,
      };
    } catch (e) {
      return { message: `Failed to delete tab group: ${e}` };
    }
  }
}

export class AddTabToGroupCommand implements Command {
  commandName = "add_tab_to_group";
  description =
    "Add tab(s) to an existing tab group. Accepts arguments: { name: string, query?: string, index?: number, all?: boolean, confirmed?: boolean }. Use 'query' to find tab by title/URL. Use 'all: true' to add all ungrouped tabs. If no query/index/all, adds current tab.";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const { gBrowser } = getChrome();
    if (!gBrowser) return { message: "Browser UI (gBrowser) not available." };

    const name = stringArg(args, "name");
    if (!name) return { message: "Which tab group should I add the tab to?" };

    const group = findGroupByName(gBrowser, name);

    if (!group) {
      return {
        message: `No tab group named "${name}". Use create_tab_group to create one first.`,
      };
    }

    let tabsToAdd: BrowserTabLike[] = [];
    const query = normalizeQuery(stringArg(args, "query"));
    const idx = numberArg(args, "index");
    const all = booleanArg(args, "all");

    if (all === true) {
      tabsToAdd = getTabs(gBrowser).filter(tab => !tab.group);
    } else if (query) {
      tabsToAdd = findTabsByQuery(gBrowser, query);

      if (tabsToAdd.length === 0) {
        return { message: `No tabs found matching "${stringArg(args, "query") || ""}".` };
      }
    } else if (idx != null) {
      const tab = tabByIndex(gBrowser, idx);
      if (!tab) return { message: `No tab ${idx}.` };
      tabsToAdd = [tab];
    } else {
      const selected = gBrowser.selectedTab;
      if (selected) {
        tabsToAdd = [selected];
      }
    }

    const groupableTabs = tabsToAdd.filter(tab => !tab.pinned);
    if (groupableTabs.length === 0) {
      return { message: "No groupable tabs found (pinned tabs cannot be grouped, or all tabs are already in groups)." };
    }

    // Check if any tabs are already in OTHER groups (not the target group)
    const tabsInOtherGroups = groupableTabs.filter(tab => tab.group && tab.group !== group);
    if (tabsInOtherGroups.length > 0 && booleanArg(args, "confirmed") !== true) {
      const impact = analyzeGroupMoveImpact(tabsInOtherGroups);
      const groupNames = impact.affectedGroups.join(", ");

      let warningMsg = `${tabsInOtherGroups.length} tab(s) will be moved from existing group(s): ${groupNames}.`;
      if (impact.emptiedGroups.length > 0) {
        warningMsg += ` This will delete the following empty group(s): ${impact.emptiedGroups.join(", ")}.`;
      }
      warningMsg += ` Add to "${name}" anyway?`;

      setPendingConfirmation({
        command: "add_tab_to_group",
        args: { ...args, confirmed: true },
        description: warningMsg,
      });
      return {
        message: warningMsg,
        requiresConfirmation: true,
        confirmationData: {
          name,
          affectedGroups: impact.affectedGroups,
          willBeEmpty: impact.emptiedGroups,
        },
      };
    }

    clearPendingConfirmation();

    try {
      group.addTabs?.(groupableTabs);
      applyRoutingStateMutation({
        kind: "upsert",
        entity: "group",
        name: group.label || name,
      });
      const titles = groupableTabs.map(tab => tabTitle(tab)).join(", ");
      return { message: `Added ${groupableTabs.length} tab(s) to group "${name}": ${titles}` };
    } catch (e) {
      return { message: `Failed to add tab to group: ${e}` };
    }
  }
}

export class RemoveTabFromGroupCommand implements Command {
  commandName = "remove_tab_from_group";
  description =
    "Remove a tab from its tab group (ungroup it). Accepts arguments: { index?: number }. If no index, uses current tab.";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const { gBrowser } = getChrome();
    if (!gBrowser) return { message: "Browser UI (gBrowser) not available." };

    const idx = numberArg(args, "index");
    const tab = tabByIndexOrCurrent(gBrowser, idx);
    if (!tab) return { message: idx != null ? `No tab ${idx}.` : "No active tab." };

    const title = tabTitle(tab);

    if (!tab.group) {
      return { message: `Tab "${title}" is not in any group.` };
    }

    try {
      if (gBrowser.ungroupTab) {
        gBrowser.ungroupTab(tab);
        markRoutingStateDirty("remove-tab-from-group");
        return { message: `Removed tab "${title}" from its group.` };
      } else {
        return {
          message: "Tab ungrouping is not available in this Firefox version.",
        };
      }
    } catch (e) {
      return { message: `Failed to remove tab from group: ${e}` };
    }
  }
}

export class RenameTabGroupCommand implements Command {
  commandName = "rename_tab_group";
  description =
    "Rename a tab group. Accepts arguments: { from: string, to: string }.";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const { gBrowser } = getChrome();
    if (!gBrowser) return { message: "Browser UI (gBrowser) not available." };

    const from = stringArg(args, "from");
    const to = stringArg(args, "to");
    if (!from || !to)
      return { message: "Please provide old and new group names." };

    const groups = getTabGroups(gBrowser);
    const group = findGroupByName(gBrowser, from);

    if (!group) {
      return { message: `No tab group named "${from}".` };
    }

    const existingWithNewName = groups.find(
      existingGroup => normalizeName(existingGroup.label || "") === normalizeName(to)
    );
    if (existingWithNewName) {
      return { message: `A tab group named "${to}" already exists.` };
    }

    try {
      group.label = to;
      applyRoutingStateMutation({
        kind: "rename",
        entity: "group",
        from,
        to,
      });
      return { message: `Renamed tab group "${from}" to "${to}".` };
    } catch (e) {
      return { message: `Failed to rename tab group: ${e}` };
    }
  }
}

export class ResolveAmbiguityCommand implements Command {
  commandName = "resolve_ambiguity";
  description =
    "Resolve an ambiguous request. Accepts arguments: { target?: 'bookmark-folder'|'tab-group'|'tab'|'cancel' }.";

  async execute(args: CommandArgs): Promise<CmdResult> {
    const pending = getPendingAmbiguity();
    if (!pending) {
      return { message: "No pending ambiguous request to resolve." };
    }

    const target = ambiguityTargetArg(args);
    if (target === "cancel") {
      clearPendingAmbiguity();
      return { message: "Okay, cancelled that request." };
    }

    if (pending.kind === "close_delete_target") {
      const allowed = new Set<AmbiguityTarget>(pending.choices || ["tab", "tab-group", "bookmark-folder"]);
      if (!target || !allowed.has(target as AmbiguityTarget)) {
        const optionLabels = Array.from(allowed).map((opt) => {
          if (opt === "tab-group") return "tab group";
          if (opt === "bookmark-folder") return "bookmark folder";
          return "tab";
        });
        const choicesText = optionLabels.length > 1
          ? `${optionLabels.slice(0, -1).join(", ")} or ${optionLabels[optionLabels.length - 1]}`
          : optionLabels[0] || "tab, tab group, or bookmark folder";
        return {
          message:
            `I found multiple matches for "${pending.name}". ` +
            `Do you mean ${choicesText}?`,
        };
      }

      clearPendingAmbiguity();
      assistantLogger.debug("ambiguity", "Resolved close/delete target", {
        target,
        name: pending.name,
      });

      if (target === "tab") {
        const cmd = new CloseTabCommand();
        return await cmd.execute(
          pending.tabIndex ? { index: pending.tabIndex } : {}
        );
      }
      if (target === "tab-group") {
        const cmd = new DeleteTabGroupCommand();
        return await cmd.execute({ name: pending.name });
      }
      const cmd = new DeleteBookmarkFolderCommand();
      return await cmd.execute({ name: pending.name });
    }

    if (target !== "bookmark-folder" && target !== "tab-group") {
      return {
        message:
          `Do you mean a bookmark folder or a tab group for "${pending.name}"? ` +
          `Reply with "bookmark folder" or "tab group".`,
      };
    }

    clearPendingAmbiguity();
    assistantLogger.debug("ambiguity", "Resolved container target", {
      target,
      name: pending.name,
    });

    if (target === "tab-group") {
      const cmd = new AddTabToGroupCommand();
      return await cmd.execute({
        name: pending.name,
        query: pending.query,
        all: pending.all,
      });
    }

    const cmd = new AddTabToBookmarkFolderCommand();
    return await cmd.execute({
      name: pending.name,
      query: pending.query,
      all: pending.all,
    });
  }
}

export class ConfirmActionCommand implements Command {
  commandName = "confirm_action";
  description =
    "Confirm or cancel a pending action. Accepts arguments: { confirmed: boolean }.";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const pending = getPendingConfirmation();
    assistantLogger.debug(
      "confirm-action",
      "Received confirmation input",
      { hasPending: !!pending }
    );
    if (!pending) {
      assistantLogger.debug(
        "confirm-action",
        "No pending confirmation found"
      );
      clearContinuationQueue();
      return { message: "No pending action to confirm." };
    }

    const confirmed = args?.confirmed;
    if (confirmed !== true && confirmed !== false) {
      return {
        message: `Pending action: ${pending.description}. Reply "yes" to confirm or "no" to cancel.`,
      };
    }

    if (!confirmed) {
      clearPendingConfirmation();
      clearContinuationQueue();
      return { message: "Action cancelled." };
    }

    const cmd = getCommandExecutor(pending.command);
    if (!cmd) {
      clearPendingConfirmation();
      clearContinuationQueue();
      const known = listRegisteredCommandNames().sort();
      return {
        message:
          `Unknown command: ${pending.command}. ` +
          `Known commands: ${known.join(", ")}`,
      };
    }

    if (cmd.commandName === this.commandName) {
      clearPendingConfirmation();
      clearContinuationQueue();
      return { message: "Cannot confirm confirm_action recursively." };
    }

    return await cmd.execute(pending.args);
  }
}
