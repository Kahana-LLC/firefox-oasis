/**
 * All browser command implementations.
 *
 * Each command is a class implementing the Command interface with:
 * - commandName: identifier used for routing (e.g. "close_tab")
 * - description: human-readable text sent to the LLM for tool selection
 * - execute(args): performs the browser action and returns a result
 *
 * Commands cover: tab management, navigation, bookmark folders, tab groups,
 * search (full-text + semantic), window management, active-page reading,
 * and interaction flows (confirmation, ambiguity resolution).
 */
import { bookmarkFolders, CreateFolderOpts } from "./bookmarkFolders";
import { localMemory } from "./services/localMemory";
import { subscriptionService } from "./services/subscription";
import { fetchRecentHistory } from "./services/historyCollector";
import { semanticHistorySearch } from "./services/semanticHistorySearch";
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
  setPendingClarification,
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
import { buildPageContextRequestMessage } from "./utils/pageContextRequest";
import { extractPageContentFromTab } from "./services/pageContentExtract";
import {
  buildResearchBrief,
  previewResearchBriefScope,
  type BuildResearchBriefOptions,
  type ResearchScope,
} from "./services/researchBrief";
import { getCachedResearchBriefRun, storeResearchBriefRun } from "./services/researchBriefDigestCache.js";
import { researchBriefToMarkdown } from "./services/researchBriefFormat.js";
import { buildResearchBriefToolMessage } from "./utils/researchBriefRequest";
import {
  beginResearchBriefRun,
  createResearchBriefProgressReporter,
  endResearchBriefRun,
} from "./utils/researchBriefProgress.js";
import {
  buildScopePreviewDescription,
  shouldConfirmResearchBriefScope,
} from "./utils/researchBriefScopePreview.js";
import {
  buildAmbiguousGroupClarification,
  buildOverQuotaClarification,
  setResearchBriefResume,
} from "./utils/researchBriefResume.js";
import type { ResolveResearchTabsResult } from "./services/researchBriefTypes.js";
import { synthesizeResearchBriefSection } from "./services/researchBriefSectionSynthesis.js";
import { mergeSectionIntoBrief } from "./services/researchBriefSectionMerge.js";

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
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function booleanArg(args: CommandArgs, key: string): boolean | undefined {
  const value = args[key];
  return typeof value === "boolean" ? value : undefined;
}

function numberArrayArg(args: CommandArgs, key: string): number[] {
  const value = args[key];
  if (!Array.isArray(value)) return [];
  return value
    .map(item =>
      typeof item === "number" && Number.isFinite(item) ? item : null
    )
    .filter((item): item is number => item != null);
}

function stringArrayArg(args: CommandArgs, key: string): string[] {
  const value = args[key];
  if (!Array.isArray(value)) return [];
  return value
    .map(item => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
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

function tabByIndexOrCurrent(
  gBrowser: GBrowserLike | null,
  index: number | undefined
): BrowserTabLike | null {
  if (index == null) return gBrowser?.selectedTab || null;
  return findTabByIndex(gBrowser, index);
}

function tabByIndex(
  gBrowser: { tabs: ArrayLike<BrowserTabLike> },
  index: number
): BrowserTabLike | null {
  const i = Math.max(1, Math.floor(index));
  const tabs = Array.from(gBrowser.tabs);
  if (i > tabs.length) return null;
  return tabs[i - 1] || null;
}

type GBrowserTabOps = GBrowserLike & {
  reloadTab?: (tab: BrowserTabLike) => void;
  addAdjacentNewTab?: (tab: BrowserTabLike) => void;
  pinTab?: (tab: BrowserTabLike, opts?: unknown) => void;
  unpinTab?: (tab: BrowserTabLike) => void;
  duplicateTab?: (tab: BrowserTabLike, ...rest: unknown[]) => unknown;
  explicitUnloadTabs?: (tabs: BrowserTabLike[]) => Promise<void>;
  removeTabs?: (tabs: BrowserTabLike[], opts?: Record<string, unknown>) => void;
  getDuplicateTabsToClose?: (tab: BrowserTabLike) => BrowserTabLike[];
  _getTabsToTheEndFrom?: (tab: BrowserTabLike) => BrowserTabLike[];
  _getTabsToTheStartFrom?: (tab: BrowserTabLike) => BrowserTabLike[];
  removeAllTabsBut?: (
    tab: BrowserTabLike,
    opts?: Record<string, unknown>
  ) => void;
  selectAllTabs?: () => void;
  moveTabToStart?: (tab: BrowserTabLike) => void;
  moveTabToEnd?: (tab: BrowserTabLike) => void;
  tabNoteMenu?: { openPanel?: (tab: BrowserTabLike, opts?: unknown) => void };
};

function asTabOps(gBrowser: GBrowserLike | null): GBrowserTabOps | null {
  return gBrowser as GBrowserTabOps | null;
}

type BrowserChromeExtras = BrowserWindowLike & {
  PlacesCommandHook?: { bookmarkTabs?: (tabs: BrowserTabLike[]) => void };
  SessionStore?: { undoCloseTab?: (win: Window, index?: number) => unknown };
  gSync?: { showSendToDeviceViewFromFxaMenu?: (anchor: Element) => void };
};

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
    const movingTabs = groupTabs.filter(groupTab =>
      tabsToMove.includes(groupTab)
    );
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
  let next = String(value || "")
    .replace(/["']/g, " ")
    .trim();
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
    if (!topWin?.OpenBrowserWindow)
      return { message: "Browser UI not available." };

    topWin.OpenBrowserWindow();
    return { message: "I've opened a new window for you." };
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

    return {
      message: `I've arranged your ${numWindows} windows side-by-side.`,
    };
  }
}

export class ShowURLCommand implements Command {
  commandName = "show_url";
  description = "Open a URL in a new tab.";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const { topWin } = getChrome();
    if (!topWin?.openTrustedLinkIn)
      return { message: "Browser UI not available." };

    const url = stringArg(args, "url");
    if (!url) return { message: "Missing 'url' argument." };

    topWin.openTrustedLinkIn(url, "tab");
    return { message: `I've opened that URL for you: ${url}` };
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
    return { message: `I've opened that site in a new tab: ${url}` };
  }
}

export class WebSearchCommand implements Command {
  commandName = "web_search";
  description = "Search the web in a new tab. Arguments: { query: string }.";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const { topWin } = getChrome();
    const query = stringArg(args, "query");
    if (!query) {
      return { message: "Missing 'query' argument." };
    }
    if (!topWin?.openTrustedLinkIn) {
      return {
        message: "Cannot open web search (openTrustedLinkIn not found).",
      };
    }
    const searchUrl = toWebSearchUrl(query);
    topWin.openTrustedLinkIn(searchUrl, "tab");
    return { message: `I've opened a web search for "${query}" in a new tab.` };
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
    if (!tab)
      return { message: idx != null ? `No tab ${idx}.` : "No active tab." };
    const title = tabTitle(tab);

    if (booleanArg(args, "confirmed") !== true) {
      setPendingConfirmation({
        command: "close_tab",
        args: { ...args, confirmed: true },
        description: `Close tab "${title}"?`,
      });
      return {
        message: `Sure, I'll close the tab "${title}". Is that okay?`,
        requiresConfirmation: true,
        confirmationData: { title },
      };
    }

    clearPendingConfirmation();
    gBrowser.removeTab?.(tab);
    return { message: `I've closed the tab: ${title}` };
  }
}

export class ReloadTabCommand implements Command {
  commandName = "reload_tab";
  description =
    "Reload the current tab or a tab by index. Accepts arguments: { index?: number } (1-based).";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const gb = asTabOps(getChrome().gBrowser);
    if (!gb?.reloadTab)
      return { message: "Browser UI (gBrowser.reloadTab) not available." };
    const idx = numberArg(args, "index");
    const tab = tabByIndexOrCurrent(gb, idx);
    if (!tab)
      return { message: idx != null ? `No tab ${idx}.` : "No active tab." };
    gb.reloadTab(tab);
    return { message: `I've reloaded that tab for you: ${tabTitle(tab)}` };
  }
}

export class ToggleMuteTabCommand implements Command {
  commandName = "toggle_mute_tab";
  description =
    "Toggle mute for the current tab or a tab by index. Accepts arguments: { index?: number } (1-based).";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const { gBrowser } = getChrome();
    if (!gBrowser) return { message: "Browser UI (gBrowser) not available." };
    const idx = numberArg(args, "index");
    const tab = tabByIndexOrCurrent(gBrowser, idx);
    if (!tab)
      return { message: idx != null ? `No tab ${idx}.` : "No active tab." };
    const toggle = (tab as BrowserTabLike & { toggleMuteAudio?: () => void })
      .toggleMuteAudio;
    if (typeof toggle !== "function")
      return { message: "Mute is not available for this tab." };
    toggle.call(tab);
    return { message: `I've toggled the mute for you: ${tabTitle(tab)}` };
  }
}

export class PinTabCommand implements Command {
  commandName = "pin_tab";
  description =
    "Pin the current tab or a tab by index. Accepts arguments: { index?: number } (1-based).";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const gb = asTabOps(getChrome().gBrowser);
    if (!gb?.pinTab)
      return { message: "Browser UI (gBrowser.pinTab) not available." };
    const idx = numberArg(args, "index");
    const tab = tabByIndexOrCurrent(gb, idx);
    if (!tab)
      return { message: idx != null ? `No tab ${idx}.` : "No active tab." };
    if (tab.pinned)
      return { message: `That tab is already pinned: ${tabTitle(tab)}` };
    gb.pinTab(tab, {});
    return { message: `I've pinned that tab for you: ${tabTitle(tab)}` };
  }
}

export class UnpinTabCommand implements Command {
  commandName = "unpin_tab";
  description =
    "Unpin the current tab or a tab by index. Accepts arguments: { index?: number } (1-based).";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const gb = asTabOps(getChrome().gBrowser);
    if (!gb?.unpinTab)
      return { message: "Browser UI (gBrowser.unpinTab) not available." };
    const idx = numberArg(args, "index");
    const tab = tabByIndexOrCurrent(gb, idx);
    if (!tab)
      return { message: idx != null ? `No tab ${idx}.` : "No active tab." };
    if (!tab.pinned)
      return { message: `That tab isn't pinned: ${tabTitle(tab)}` };
    gb.unpinTab(tab);
    return { message: `I've unpinned that tab for you: ${tabTitle(tab)}` };
  }
}

export class UnloadTabCommand implements Command {
  commandName = "unload_tab";
  description =
    "Unload (discard) the current tab or a tab by index to free memory. Accepts arguments: { index?: number } (1-based).";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const gb = asTabOps(getChrome().gBrowser);
    if (!gb?.explicitUnloadTabs) {
      return { message: "Tab unload is not available in this build." };
    }
    const idx = numberArg(args, "index");
    const tab = tabByIndexOrCurrent(gb, idx);
    if (!tab)
      return { message: idx != null ? `No tab ${idx}.` : "No active tab." };
    await gb.explicitUnloadTabs([tab]);
    return {
      message: `I've unloaded that tab to save memory: ${tabTitle(tab)}`,
    };
  }
}

export class NewTabToRightCommand implements Command {
  commandName = "new_tab_to_right";
  description =
    "Open a new tab immediately to the right of the current tab or a tab by index. Accepts arguments: { index?: number } (1-based).";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const gb = asTabOps(getChrome().gBrowser);
    if (!gb?.addAdjacentNewTab) {
      return {
        message: "Browser UI (gBrowser.addAdjacentNewTab) not available.",
      };
    }
    const idx = numberArg(args, "index");
    const tab = tabByIndexOrCurrent(gb, idx);
    if (!tab)
      return { message: idx != null ? `No tab ${idx}.` : "No active tab." };
    gb.addAdjacentNewTab(tab);
    return {
      message: `I've opened a new tab to the right of: ${tabTitle(tab)}`,
    };
  }
}

export class DuplicateTabCommand implements Command {
  commandName = "duplicate_tab";
  description =
    "Duplicate the current tab or a tab by index. Accepts arguments: { index?: number } (1-based).";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const gb = asTabOps(getChrome().gBrowser);
    if (!gb?.duplicateTab) {
      return { message: "Browser UI (gBrowser.duplicateTab) not available." };
    }
    const idx = numberArg(args, "index");
    const tab = tabByIndexOrCurrent(gb, idx);
    if (!tab)
      return { message: idx != null ? `No tab ${idx}.` : "No active tab." };
    gb.duplicateTab(tab);
    return { message: `I've duplicated that tab for you: ${tabTitle(tab)}` };
  }
}

export class BookmarkTabCommand implements Command {
  commandName = "bookmark_tab";
  description =
    "Bookmark the current tab or a tab by index (default bookmarks location). Accepts arguments: { index?: number } (1-based).";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const { topWin, gBrowser } = getChrome();
    const hook = (topWin as BrowserChromeExtras | null)?.PlacesCommandHook
      ?.bookmarkTabs;
    if (!hook || !gBrowser) return { message: "Bookmarking is not available." };
    const idx = numberArg(args, "index");
    const tab = tabByIndexOrCurrent(gBrowser, idx);
    if (!tab)
      return { message: idx != null ? `No tab ${idx}.` : "No active tab." };
    hook([tab]);
    return { message: `I've bookmarked that tab for you: ${tabTitle(tab)}` };
  }
}

export class MoveTabToStartCommand implements Command {
  commandName = "move_tab_to_start";
  description =
    "Move the current tab or a tab by index to the start of the tab strip. Accepts arguments: { index?: number } (1-based).";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const gb = asTabOps(getChrome().gBrowser);
    if (!gb?.moveTabToStart)
      return { message: "Browser UI (gBrowser.moveTabToStart) not available." };
    const idx = numberArg(args, "index");
    const tab = tabByIndexOrCurrent(gb, idx);
    if (!tab)
      return { message: idx != null ? `No tab ${idx}.` : "No active tab." };
    gb.moveTabToStart(tab);
    return {
      message: `I've moved that tab to the beginning: ${tabTitle(tab)}`,
    };
  }
}

export class MoveTabToEndCommand implements Command {
  commandName = "move_tab_to_end";
  description =
    "Move the current tab or a tab by index to the end of the tab strip. Accepts arguments: { index?: number } (1-based).";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const gb = asTabOps(getChrome().gBrowser);
    if (!gb?.moveTabToEnd)
      return { message: "Browser UI (gBrowser.moveTabToEnd) not available." };
    const idx = numberArg(args, "index");
    const tab = tabByIndexOrCurrent(gb, idx);
    if (!tab)
      return { message: idx != null ? `No tab ${idx}.` : "No active tab." };
    gb.moveTabToEnd(tab);
    return { message: `I've moved that tab to the end: ${tabTitle(tab)}` };
  }
}

export class SelectAllTabsCommand implements Command {
  commandName = "select_all_tabs";
  description =
    "Select all tabs in the current window for multi-tab actions. Accepts no arguments.";
  async execute(_args: CommandArgs): Promise<CmdResult> {
    const gb = asTabOps(getChrome().gBrowser);
    if (!gb?.selectAllTabs)
      return { message: "Browser UI (gBrowser.selectAllTabs) not available." };
    gb.selectAllTabs();
    return { message: "I've selected all the tabs in this window for you." };
  }
}

export class CloseDuplicateTabsCommand implements Command {
  commandName = "close_duplicate_tabs";
  description =
    "Close duplicate tabs (same URL) relative to the current tab or a tab by index. Accepts arguments: { index?: number, confirmed?: boolean } (1-based).";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const gb = asTabOps(getChrome().gBrowser);
    if (!gb?.getDuplicateTabsToClose || !gb.removeTabs) {
      return { message: "Closing duplicate tabs is not available." };
    }
    const idx = numberArg(args, "index");
    const tab = tabByIndexOrCurrent(gb, idx);
    if (!tab)
      return { message: idx != null ? `No tab ${idx}.` : "No active tab." };
    const dupes = gb.getDuplicateTabsToClose(tab);
    if (!dupes.length) {
      return { message: "I didn't find any duplicate tabs to close." };
    }

    if (booleanArg(args, "confirmed") !== true) {
      setPendingConfirmation({
        command: "close_duplicate_tabs",
        args: { ...args, confirmed: true },
        description: `Close ${dupes.length} duplicate tab(s)?`,
      });
      return {
        message: `I've found ${dupes.length} duplicate tab(s). Should I go ahead and close them?`,
        requiresConfirmation: true,
        confirmationData: { count: dupes.length },
      };
    }

    clearPendingConfirmation();
    gb.removeTabs(dupes, { isUserTriggered: true });
    return { message: `I've closed ${dupes.length} duplicate tab(s) for you.` };
  }
}

export class CloseTabsToRightCommand implements Command {
  commandName = "close_tabs_to_right";
  description =
    "Close all tabs to the right of the current tab or a tab by index. Accepts arguments: { index?: number, confirmed?: boolean } (1-based).";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const gb = asTabOps(getChrome().gBrowser);
    if (!gb?._getTabsToTheEndFrom || !gb.removeTabs) {
      return { message: "Closing tabs to the right is not available." };
    }
    const idx = numberArg(args, "index");
    const tab = tabByIndexOrCurrent(gb, idx);
    if (!tab)
      return { message: idx != null ? `No tab ${idx}.` : "No active tab." };
    const toClose = gb._getTabsToTheEndFrom(tab);
    if (!toClose.length) {
      return { message: "There aren't any tabs to the right to close." };
    }

    if (booleanArg(args, "confirmed") !== true) {
      setPendingConfirmation({
        command: "close_tabs_to_right",
        args: { ...args, confirmed: true },
        description: `Close ${toClose.length} tab(s) to the right?`,
      });
      return {
        message: `I've found ${toClose.length} tab(s) to the right. Should I close them?`,
        requiresConfirmation: true,
        confirmationData: { count: toClose.length },
      };
    }

    clearPendingConfirmation();
    gb.removeTabs(toClose, { isUserTriggered: true });
    return { message: `I've closed ${toClose.length} tab(s) to the right.` };
  }
}

export class CloseTabsToLeftCommand implements Command {
  commandName = "close_tabs_to_left";
  description =
    "Close all tabs to the left of the current tab or a tab by index. Accepts arguments: { index?: number, confirmed?: boolean } (1-based).";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const gb = asTabOps(getChrome().gBrowser);
    if (!gb?._getTabsToTheStartFrom || !gb.removeTabs) {
      return { message: "Closing tabs to the left is not available." };
    }
    const idx = numberArg(args, "index");
    const tab = tabByIndexOrCurrent(gb, idx);
    if (!tab)
      return { message: idx != null ? `No tab ${idx}.` : "No active tab." };
    const toClose = gb._getTabsToTheStartFrom(tab);
    if (!toClose.length) {
      return { message: "There aren't any tabs to the left to close." };
    }

    if (booleanArg(args, "confirmed") !== true) {
      setPendingConfirmation({
        command: "close_tabs_to_left",
        args: { ...args, confirmed: true },
        description: `Close ${toClose.length} tab(s) to the left?`,
      });
      return {
        message: `I've found ${toClose.length} tab(s) to the left. Should I close them?`,
        requiresConfirmation: true,
        confirmationData: { count: toClose.length },
      };
    }

    clearPendingConfirmation();
    gb.removeTabs(toClose, { isUserTriggered: true });
    return { message: `I've closed ${toClose.length} tab(s) to the left.` };
  }
}

export class CloseOtherTabsCommand implements Command {
  commandName = "close_other_tabs";
  description =
    "Close all tabs except the current tab or a tab by index. Accepts arguments: { index?: number, confirmed?: boolean } (1-based).";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const gb = asTabOps(getChrome().gBrowser);
    if (!gb?.removeAllTabsBut)
      return { message: "Closing other tabs is not available." };
    const idx = numberArg(args, "index");
    const tab = tabByIndexOrCurrent(gb, idx);
    if (!tab)
      return { message: idx != null ? `No tab ${idx}.` : "No active tab." };
    const others = getTabs(gb).filter(t => t !== tab && !t.pinned);
    if (!others.length) {
      return { message: "There are no other unpinned tabs to close." };
    }

    if (booleanArg(args, "confirmed") !== true) {
      setPendingConfirmation({
        command: "close_other_tabs",
        args: { ...args, confirmed: true },
        description: `Close ${others.length} other tab(s) (keeping "${tabTitle(tab)}")?`,
      });
      return {
        message: `I've found ${others.length} other tab(s). Should I close them and keep "${tabTitle(tab)}"?`,
        requiresConfirmation: true,
        confirmationData: { count: others.length },
      };
    }

    clearPendingConfirmation();
    gb.removeAllTabsBut(tab, { skipWarnAboutClosingTabs: true });
    return {
      message: `I've closed the other tabs and kept "${tabTitle(tab)}" for you.`,
    };
  }
}

export class ReopenClosedTabCommand implements Command {
  commandName = "reopen_closed_tab";
  description =
    "Reopen the most recently closed tab from this window's closed-tab list. Accepts arguments: { index?: number } (0 = most recent).";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const { topWin } = getChrome();
    const ss = (topWin as BrowserChromeExtras | null)?.SessionStore;
    if (!ss?.undoCloseTab)
      return {
        message: "Session restore (reopen closed tab) is not available.",
      };
    const index = numberArg(args, "index");
    const reopened = ss.undoCloseTab(topWin as Window, index ?? 0);
    if (!reopened)
      return { message: "I didn't find any recently closed tabs to reopen." };
    return { message: "I've reopened the last tab you closed." };
  }
}

export class OpenSendTabToDeviceCommand implements Command {
  commandName = "open_send_tab_to_device";
  description =
    'Open Firefox Sync "Send Tab to Device" so the user can pick a synced device. Accepts no arguments.';
  async execute(_args: CommandArgs): Promise<CmdResult> {
    const { topWin } = getChrome();
    const sync = (topWin as BrowserChromeExtras | null)?.gSync;
    const anchor = topWin?.document?.getElementById?.(
      "fxa-toolbar-menu-button"
    );
    if (!sync?.showSendToDeviceViewFromFxaMenu || !anchor) {
      return {
        message:
          "I couldn't open Send Tab to Device. Please make sure you're signed in to Sync and the account button is visible.",
      };
    }
    sync.showSendToDeviceViewFromFxaMenu(anchor);
    return { message: "I've opened the Send Tab to Device menu for you." };
  }
}

export class OpenTabNoteCommand implements Command {
  commandName = "open_tab_note";
  description =
    "Open the tab note editor for the current tab or a tab by index. Accepts arguments: { index?: number } (1-based).";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const gb = asTabOps(getChrome().gBrowser);
    const menu = gb?.tabNoteMenu;
    if (!menu?.openPanel)
      return { message: "Tab notes are not available in this build." };
    const idx = numberArg(args, "index");
    const tab = tabByIndexOrCurrent(gb, idx);
    if (!tab)
      return { message: idx != null ? `No tab ${idx}.` : "No active tab." };
    menu.openPanel(tab, {});
    return { message: `I've opened the tab note for you: ${tabTitle(tab)}` };
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
    if (!tab)
      return { message: idx != null ? `No tab ${idx}.` : "No active tab." };

    const title = tabTitle(tab);
    const newWin = topWin.OpenBrowserWindow();
    await new Promise(r => setTimeout(r, 250)); // give it a tick
    newWin.gBrowser?.adoptTab?.(tab, 0);
    return {
      message: `I've moved the tab "${title}" to a new window for you.`,
    };
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
      return {
        message: `I've copied ${urls.length} URL(s) to your clipboard.`,
      };
    } catch {
      return {
        message: `I couldn't access the clipboard, but here are the URLs:\n${text}`,
      };
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
    return {
      message: `I've created the bookmark folder "${res.name}" with ${res.count} items for you.`,
    };
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
        message: `Are you sure you want to delete the bookmark folder "${name}"${closeMsg}?`,
        requiresConfirmation: true,
        confirmationData: { name, closeTabs },
      };
    }

    clearPendingConfirmation();
    const closeTabs = booleanArg(args, "closeTabs") === true;
    const res = await bookmarkFolders.delete(name, { closeTabs });
    if (res.removed === 0)
      return { message: `I couldn't find a folder named "${name}".` };
    applyRoutingStateMutation({
      kind: "delete",
      entity: "folder",
      name: res.name,
    });
    return {
      message: `I've deleted the bookmark folder "${res.name}" and removed ${res.removed} items.`,
    };
  }
}

export class ListBookmarkFoldersCommand implements Command {
  commandName = "list_bookmark_folders";
  description = "List all managed bookmark folders. Accepts no arguments.";
  async execute(_args: CommandArgs): Promise<CmdResult> {
    const items = await bookmarkFolders.list();
    if (!items.length)
      return { message: "You don't have any bookmark folders yet." };
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
      return {
        message:
          "Please tell me the current name and the new name for the folder.",
      };
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
        ? `I've renamed "${from}" to "${to}" for you.`
        : `I couldn't rename the folder: ${r.msg || "unknown error"}`,
    };
  }
}

export class AddTabToBookmarkFolderCommand implements Command {
  commandName = "add_tab_to_bookmark_folder";
  description =
    "Add tabs to a managed bookmark folder. Accepts arguments: { name: string, query?: string, all?: boolean } (query matches title/URL). all=true adds all tabs. If no query/all, adds current tab.";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const name = stringArg(args, "name");
    if (!name) return { message: "Which folder should I add the tabs to?" };

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
        return {
          message: `I couldn't find any tabs matching "${stringArg(args, "query") || ""}".`,
        };
      }
    } else {
      // Default to current tab
      const current = gBrowser.selectedTab;
      if (current) {
        tabsToAdd = [current];
      }
    }

    if (tabsToAdd.length === 0)
      return { message: "I don't see any tabs to add." };

    const r = await bookmarkFolders.addTabs(name, tabsToAdd);

    if (!r.ok)
      return { message: `I'm sorry, I couldn't add the tabs to "${name}".` };
    applyRoutingStateMutation({
      kind: "upsert",
      entity: "folder",
      name,
    });

    const count = tabsToAdd.length;
    return {
      message: `I've added ${count} tab(s) to your bookmark folder "${name}".`,
    };
  }
}

export class RemoveTabFromBookmarkFolderCommand implements Command {
  commandName = "remove_tab_from_bookmark_folder";
  description =
    "Remove a tab from a managed bookmark folder. Accepts arguments: { name: string, url?: string } (defaults to current tab URL).";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const name = stringArg(args, "name");
    if (!name) return { message: "Which folder should I look in?" };

    let url = stringArg(args, "url");
    if (!url) {
      const { gBrowser } = getChrome();
      if (gBrowser) {
        url = tabUrl(gBrowser.selectedTab || null);
      }
    }

    if (!url) return { message: "I couldn't figure out which URL to remove." };

    const r = await bookmarkFolders.removeUrl(name, url);
    return {
      message: r.ok
        ? `I've removed that URL from your folder "${name}".`
        : `I couldn't find that URL in the folder "${name}".`,
    };
  }
}

export class OpenBookmarkFolderCommand implements Command {
  commandName = "open_bookmark_folder";
  description =
    "Open all bookmarks from a managed folder. Accepts arguments: { name: string, where?: 'tabs'|'window'|'tabgroup' }. 'tabgroup' creates a new visual group.";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const name = stringArg(args, "name");
    if (!name) return { message: "Which folder would you like me to open?" };
    const whereRaw = stringArg(args, "where");
    const where: "tabs" | "window" | "tabgroup" =
      whereRaw === "window" || whereRaw === "tabgroup" ? whereRaw : "tabs";
    const r = await bookmarkFolders.openFolder(name, where);
    return {
      message: r.ok
        ? `I've opened the folder "${name}" in ${where} for you.`
        : `I'm sorry, I couldn't open the folder "${name}".`,
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
      return {
        message: "I'm sorry, split view isn't enabled in this browser.",
      };
    }

    let tab1: BrowserTabLike | null = null;
    let tab2: BrowserTabLike | null = null;

    const indices = numberArrayArg(args, "indices");
    if (indices.length >= 2) {
      const i1 = Math.max(1, Math.floor(indices[0]));
      const i2 = Math.max(1, Math.floor(indices[1]));
      const first = tabByIndex(gBrowser, i1);
      const second = tabByIndex(gBrowser, i2);
      if (!first) return { message: `I couldn't find tab ${i1}.` };
      if (!second) return { message: `I couldn't find tab ${i2}.` };
      if (i1 === i2) return { message: "I can't split a tab with itself." };
      tab1 = first;
      tab2 = second;
    } else {
      tab1 = gBrowser.selectedTab || null;
      const withIndex = numberArg(args, "withIndex");
      const withQuery = normalizeQuery(stringArg(args, "withQuery"));

      if (withIndex != null) {
        const i = Math.max(1, Math.floor(withIndex));
        tab2 = tabByIndex(gBrowser, i);
        if (!tab2) return { message: `I couldn't find tab ${i}.` };
      } else if (withQuery) {
        tab2 = findTabsByQuery(gBrowser, withQuery)[0] || null;
        if (!tab2) {
          return {
            message: `I couldn't find a tab matching "${stringArg(args, "withQuery") || ""}".`,
          };
        }
      } else {
        tab2 = gBrowser.addTrustedTab?.("about:newtab") || null;
      }
    }

    if (!tab1 || !tab2)
      return { message: "I couldn't resolve the tabs for split view." };
    if (tab1 === tab2) {
      return { message: "I can't split a tab with itself." };
    }

    if (tab1.pinned || tab2.pinned) {
      return { message: "I'm sorry, I can't add pinned tabs to split view." };
    }

    if (tab1.splitview) {
      return { message: `The tab "${tab1.label}" is already in a split view.` };
    }
    if (tab2.splitview) {
      return { message: `The tab "${tab2.label}" is already in a split view.` };
    }

    try {
      gBrowser.addTabSplitView?.([tab1, tab2], {
        insertBefore: tab1,
      });

      const title1 = tabTitle(tab1);
      const title2 = tabTitle(tab2);
      return {
        message: `I've set up a split view with "${title1}" and "${title2}" for you.`,
      };
    } catch (e) {
      return { message: `I'm sorry, I failed to create the split view: ${e}` };
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
    if (!currentTab) return { message: "I couldn't find an active tab." };
    const splitview = currentTab.splitview;

    if (!splitview?.unsplitTabs) {
      return { message: "This tab isn't in a split view." };
    }

    try {
      splitview.unsplitTabs();
      return {
        message: "I've removed the split view and separated your tabs.",
      };
    } catch (e) {
      return { message: `I couldn't remove the split view: ${e}` };
    }
  }
}

export class SplitTabsCommand implements Command {
  commandName = "split_tabs";
  description =
    "Split specified tabs into side-by-side windows. Accepts arguments: { indices: number[] }.";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const { topWin, gBrowser } = getChrome();
    if (!gBrowser || !topWin?.OpenBrowserWindow)
      return { message: "Browser UI not available." };

    const indices = numberArrayArg(args, "indices");
    if (indices.length < 2) {
      return {
        message:
          "Please tell me at least two tab indices to split (for example: 1 and 2).",
      };
    }

    // Validate all indices first
    const tabs: BrowserTabLike[] = [];
    for (const idx of indices) {
      const i = Math.max(1, Math.floor(idx));
      const tab = tabByIndex(gBrowser, i);
      if (!tab) return { message: `I couldn't find tab ${i}.` };
      tabs.push(tab);
    }

    // Get screen dimensions
    const screen = topWin.screen;
    const availWidth = screen.availWidth;
    const availHeight = screen.availHeight;
    const availLeft = screen.availLeft || 0;
    const availTop = screen.availTop || 0;

    const numTabs = tabs.length;
    const windows: Array<{
      win: BrowserWindowLike;
      tab: BrowserTabLike;
      title: string;
    }> = [];

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
        const sidebar = win.document?.getElementById("sidebar-box") as {
          hidden?: boolean;
        } | null;
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
    return {
      message: `I've split ${numTabs} tabs side-by-side for you: ${tabTitles}.`,
    };
  }
}

export class SummarizePageCommand implements Command {
  commandName = "summarize_page";
  description =
    "Read the current page and answer from it. Use for explicit summaries, questions about the active page, and grounded evaluations based on the page content. Arguments: { index?: number, query?: string }. Use index only when the user explicitly refers to a numbered tab. If index is omitted, always use the current active tab. Put the user's page-grounded question or task in query.";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const { gBrowser } = getChrome();
    if (!gBrowser) return { message: "Browser UI not available." };

    const idx = numberArg(args, "index");
    let tab = tabByIndexOrCurrent(gBrowser, idx);

    // Allow specifying tab by index
    if (idx != null && !tab) return { message: `I couldn't find tab ${idx}.` };

    const browser = tab?.linkedBrowser;
    if (!browser) return { message: "I couldn't find an active tab." };

    const userQuery = (stringArg(args, "query") || "").trim();

    try {
      const extracted = await extractPageContentFromTab(tab);
      if (extracted.status === "skipped") {
        return {
          message: "I'm sorry, I can't read internal browser pages.",
        };
      }
      if (extracted.status !== "ok" || !extracted.content) {
        return {
          message:
            extracted.failureReason ||
            "I didn't find enough content on this page to answer from.",
        };
      }

      return {
        message: buildPageContextRequestMessage({
          title: extracted.title,
          url: extracted.url,
          userQuery,
          content: extracted.content,
        }),
      };
    } catch (e) {
      return {
        message: `I'm sorry, I couldn't extract the page content: ${e}`,
      };
    }
  }
}

function normalizeResearchScope(raw: string | undefined): ResearchScope {
  const scope = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (scope === "tabs" || scope === "tab") {
    return "tabs";
  }
  if (
    scope === "window" ||
    scope === "current-window" ||
    scope === "this-window"
  ) {
    return "window";
  }
  return "tab-group";
}

function researchBriefClarificationFromScopePreview(
  preview: ResolveResearchTabsResult,
  args: CommandArgs
): CmdResult | null {
  if (!preview.ok && preview.code === "ambiguous_group" && preview.candidates) {
    const candidates = preview.candidates.map(c => ({
      id: `brief_group:${encodeURIComponent(c.name)}`,
      label: `${c.label} (${c.tabCount} tabs)`,
      name: c.name,
      tabCount: c.tabCount,
    }));
    const { options, message } = buildAmbiguousGroupClarification(
      String(args.name || "group"),
      candidates
    );
    setResearchBriefResume({
      args: { ...args, scope_confirmed: true },
      reason: "ambiguous_group",
    });
    setPendingClarification({
      originalMessage: String(args.topic || "research brief"),
      options,
    });
    return { message };
  }
  return null;
}

function researchBriefClarificationFromBuildFailure(
  result: {
    ok: false;
    message: string;
    code?: string;
    estimate?: number;
    remaining?: number;
    suggestedTabCount?: number;
  },
  args: CommandArgs
): CmdResult | null {
  if (
    result.code === "over_quota" &&
    result.estimate != null &&
    result.remaining != null &&
    result.suggestedTabCount != null
  ) {
    const stashArgs = {
      ...args,
      scope_confirmed: true,
      suggested_max_tabs: result.suggestedTabCount,
    };
    const { options, message } = buildOverQuotaClarification({
      estimate: result.estimate,
      remaining: result.remaining,
      suggestedTabCount: result.suggestedTabCount,
    });
    setResearchBriefResume({ args: stashArgs, reason: "over_quota" });
    setPendingClarification({
      originalMessage: String(args.topic || "research brief"),
      options,
    });
    return { message };
  }
  return null;
}

function buildResearchBriefOptionsFromArgs(
  args: CommandArgs,
  gBrowser: GBrowserLike | null
): BuildResearchBriefOptions {
  const quotaRaw = stringArg(args, "quota_mode");
  const quotaMode =
    quotaRaw === "truncate" || quotaRaw === "fewer_tabs"
      ? quotaRaw
      : "default";
  return {
    gBrowser,
    scope: normalizeResearchScope(stringArg(args, "scope")),
    name: stringArg(args, "name"),
    topic: stringArg(args, "topic")?.trim(),
    inferTopicFromContent: booleanArg(args, "infer_topic_from_content") === true,
    tabQueries: stringArrayArg(args, "tab_queries"),
    tabIndices: numberArrayArg(args, "tab_indices"),
    outlineHint: stringArg(args, "outline_hint"),
    maxTabs: numberArg(args, "max_tabs"),
    excludeIndices: numberArrayArg(args, "exclude_indices"),
    excludeQueries: stringArrayArg(args, "exclude_queries"),
    scopeConfirmed: booleanArg(args, "scope_confirmed") === true,
    quotaMode,
    useActiveTabGroup: booleanArg(args, "use_active_tab_group") === true,
  };
}

export class BuildResearchBriefCommand implements Command {
  commandName = "build_research_brief";
  description =
    "Build a structured research brief (outline, themes, sourced quotes) from open tabs. Arguments: { topic?: string, infer_topic_from_content?: boolean, scope?: 'tab-group'|'window'|'tabs', name?: string, use_active_tab_group?: boolean, tab_queries?: string[], tab_indices?: number[], outline_hint?: string, max_tabs?: number, exclude_indices?: number[], exclude_queries?: string[], scope_confirmed?: boolean, quota_mode?: 'truncate'|'fewer_tabs' }. scope=tabs uses tab_queries (title/URL substrings) and/or tab_indices (1-based window positions). When infer_topic_from_content is true, topic may be omitted and will be derived from page content after extraction.";
  async execute(args: CommandArgs): Promise<CmdResult> {
    const { gBrowser } = getChrome();
    const options = buildResearchBriefOptionsFromArgs(args, gBrowser);
    const topic = options.topic;
    const inferTopicFromContent = options.inferTopicFromContent === true;

    if (!topic && !inferTopicFromContent) {
      return {
        message: "What topic should the research brief focus on?",
      };
    }

    if (
      options.scope === "tabs" &&
      (options.tabQueries?.length ?? 0) === 0 &&
      (options.tabIndices?.length ?? 0) === 0
    ) {
      return {
        message:
          "Which tabs should I use? Provide tab_queries (title/URL keywords) or tab_indices (positions).",
      };
    }

    if (!options.scopeConfirmed) {
      const preview = previewResearchBriefScope(options);
      const scopeClarify = researchBriefClarificationFromScopePreview(
        preview,
        args
      );
      if (scopeClarify) {
        return scopeClarify;
      }
      if (preview.ok && shouldConfirmResearchBriefScope(preview)) {
        const confirmArgs = {
          ...args,
          scope_confirmed: true,
        };
        setPendingConfirmation({
          command: this.commandName,
          args: confirmArgs,
          description: buildScopePreviewDescription({
            scopeLabel: preview.scopeLabel,
            tabs: preview.tabs,
            tabsOmittedByLimit: preview.tabsOmittedByLimit,
            urlsDeduplicated: preview.urlsDeduplicated,
          }),
        });
        return {
          message: buildScopePreviewDescription({
            scopeLabel: preview.scopeLabel,
            tabs: preview.tabs,
            tabsOmittedByLimit: preview.tabsOmittedByLimit,
            urlsDeduplicated: preview.urlsDeduplicated,
          }),
          requiresConfirmation: true,
        };
      }
    }

    const signal = beginResearchBriefRun();
    const onProgress = createResearchBriefProgressReporter(signal);
    try {
      const result = await buildResearchBrief({
        ...options,
        onProgress,
        signal,
      });

      if (!result.ok) {
        const quotaClarify = researchBriefClarificationFromBuildFailure(
          result,
          args
        );
        if (quotaClarify) {
          return quotaClarify;
        }
        return { message: result.message };
      }

      const cached = getCachedResearchBriefRun(result.briefId);
      return {
        message: buildResearchBriefToolMessage({
          markdown: result.markdown,
          brief: result.brief,
          briefId: result.briefId,
          digests: cached?.digests ?? [],
        }),
      };
    } finally {
      endResearchBriefRun();
    }
  }
}

export class RegenerateResearchBriefSectionCommand implements Command {
  commandName = "regenerate_research_brief_section";
  description =
    'Regenerate one section of a stored research brief. Arguments: { brief_id?: string, section: "executiveSummary"|"outline"|"themes"|"sources"|"gapsAndContradictions" }.';
  async execute(args: CommandArgs): Promise<CmdResult> {
    const section = stringArg(args, "section");
    const briefId = stringArg(args, "brief_id");
    const cached = getCachedResearchBriefRun(briefId);
    if (!cached) {
      return {
        message:
          "No stored research brief found. Build a research brief first, then ask to regenerate a section.",
      };
    }
    const allowed = new Set([
      "executiveSummary",
      "outline",
      "themes",
      "sources",
      "gapsAndContradictions",
    ]);
    if (!section || !allowed.has(section)) {
      return {
        message: `Which section should I regenerate? Use one of: ${[...allowed].join(", ")}.`,
      };
    }

    const signal = beginResearchBriefRun();
    const onProgress = createResearchBriefProgressReporter(signal);
    try {
      onProgress({ phase: "synthesizing", label: `Regenerating ${section}…` });
      const sectionPayload = await synthesizeResearchBriefSection({
        section: section as
          | "executiveSummary"
          | "outline"
          | "themes"
          | "sources"
          | "gapsAndContradictions",
        topic: cached.brief.topic,
        scopeLabel: cached.brief.scopeLabel,
        digests: cached.digests,
        existingBrief: cached.brief,
        signal,
      });
      const merged = mergeSectionIntoBrief(
        cached.brief,
        section as
          | "executiveSummary"
          | "outline"
          | "themes"
          | "sources"
          | "gapsAndContradictions",
        sectionPayload
      );
      const markdown = researchBriefToMarkdown(merged);
      storeResearchBriefRun({
        briefId: cached.briefId,
        brief: merged,
        digests: cached.digests,
        markdown,
      });
      return {
        message: buildResearchBriefToolMessage({
          markdown,
          brief: merged,
          briefId: cached.briefId,
          digests: cached.digests,
        }),
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return { message: "Research brief cancelled." };
      }
      return {
        message:
          error instanceof Error
            ? error.message
            : "Could not regenerate that section.",
      };
    } finally {
      endResearchBriefRun();
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
    const sourceScope =
      source === "bookmark-folder" ? "bookmark-folder" : undefined;
    if (!query)
      return { message: "Please tell me what you'd like to search for." };

    let results = await localMemory.search(
      query,
      10,
      folder ? { folder } : undefined
    );

    if (hasBookmarkFolderCandidates(results)) {
      const snapshot = await bookmarkFolders.getAllReadOnly();
      if (snapshot.ok) {
        const folderToUrls = buildFolderUrlMap(snapshot.folders);
        const filtered = filterStaleBookmarkFolderResults(
          results,
          folderToUrls
        );
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
    const requiresBookmarkFolderOnly =
      folderScoped || sourceScope === "bookmark-folder";
    if (requiresBookmarkFolderOnly) {
      const before = results.length;
      results = results.filter(
        r => getMemoryDocSource(r) === "bookmark-folder"
      );
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
            `I couldn't find any local matches for "${query}". ` +
            `Would you like me to try a web search for you?`,
          requiresConfirmation: true,
          confirmationData: { query, url: toWebSearchUrl(query) },
        };
      }
      const guidance = folder
        ? ` Try asking me to "list tabs in bookmark folder ${folder}" to see what's saved there.`
        : "";
      return {
        message: `I didn't find any matches for "${query}"${scopeSuffix}.${guidance}`,
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
          (source === "history"
            ? "Browsing History"
            : source === "bookmark"
              ? "Bookmarks"
              : source === "bookmark-folder"
                ? `Bookmark Folder: ${r.metadata?.hubName || "unknown"}`
                : source === "tab"
                  ? "Open Tab"
                  : source === "tab-group"
                    ? "Tab Group"
                    : "Memory"),
        snippet:
          r.text.length > 120 ? r.text.substring(0, 120) + "..." : r.text,
      };
    });
    setRecentSearchResults(structured);

    const resultsBySource: Record<string, SearchResultItem[]> = {};
    for (const r of structured) {
      const bucket = (resultsBySource[r.source] ??= []);
      bucket.push({
        title: r.title,
        url: r.url,
        snippet: r.snippet ?? "",
        bookmarkGuid: r.bookmarkGuid,
      });
    }

    const sourceCounts = Object.entries(resultsBySource)
      .map(([src, items]) => `${items.length} from ${src}`)
      .join(", ");
    const summary = `I've found ${structured.length} result(s) for "${query}"${scopeSuffix}: ${sourceCounts}.`;

    return {
      message: JSON.stringify({
        summary,
        resultsBySource,
        results: structured,
      }),
    };
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
          summary: "I don't have any recent search results to show you.",
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
        summary: `I've found ${results.length} cached recent search result(s) for you.`,
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
            "I don't have any recent search results available. Would you like me to run a search first?",
        };
      }
      const targetIndex = index != null ? Math.max(1, Math.floor(index)) : 1;
      const selected = recent[targetIndex - 1];
      if (!selected?.url) {
        return {
          message:
            `I'm sorry, result index ${targetIndex} is out of range. ` +
            `I only have ${recent.length} recent result(s).`,
        };
      }
      url = selected.url;
      bookmarkGuid = bookmarkGuid || selected.bookmarkGuid;
      if (!type && selected.source === "tab") {
        type = "tab";
      }
    }

    const { topWin, gBrowser, PlacesUtils } = getChrome();
    if (!topWin?.openTrustedLinkIn || !gBrowser)
      return { message: "Browser UI not available." };

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

    if (!url) return { message: "I'm sorry, I couldn't find a URL to open." };

    // If it's an open tab, try to find and switch to it
    if (type === "tab") {
      const foundTab = getTabs(gBrowser).find(tab => tabUrl(tab) === url);

      if (foundTab) {
        gBrowser.selectedTab = foundTab;
        return { message: `I've switched you over to the tab: ${url}` };
      }
    }

    // Otherwise (or if tab not found), open in new tab
    topWin.openTrustedLinkIn(url, "tab");
    return { message: `I've opened that in a new tab for you: ${url}` };
  }
}

export class ShowSubscriptionCommand implements Command {
  commandName = "show_subscription";
  description = "Show the current subscription plan and usage options.";
  async execute(_args: CommandArgs): Promise<CmdResult> {
    const { topWin } = getChrome();
    if (!topWin?.openTrustedLinkIn)
      return { message: "Browser UI not available." };

    const stats = await subscriptionService.checkAvailability();
    const url = subscriptionService.getSubscriptionUrl();

    topWin.openTrustedLinkIn(url, "tab");

    return {
      message: `I've opened your subscription page. Your usage this month is ${stats.totalUnits} units out of a ${stats.limit} limit.`,
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
      if (!newTab)
        return { message: "Failed to open a tab for the new group." };
      tabsToGroup = [newTab];
      createdNewTab = true;
    } else {
      const currentTab = gBrowser.selectedTab || null;
      // If current tab is already in a group, create a new tab instead of moving it
      if (currentTab?.group) {
        const newTab = gBrowser.addTrustedTab?.("about:newtab");
        if (!newTab)
          return { message: "Failed to create a tab for the new group." };
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
        msg = `I've created the tab group "${name}" and opened ${openUrl} in it for you.`;
      } else if (createdNewTab) {
        msg = `I've created the tab group "${name}" with a new tab.`;
      } else {
        msg = `I've created the tab group "${name}" with ${groupableTabs.length} tab(s).`;
      }
      return { message: msg };
    } catch (e) {
      return { message: `I'm sorry, I couldn't create the tab group: ${e}` };
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
    if (!name)
      return { message: "Which tab group would you like me to delete?" };

    const group = findGroupByName(gBrowser, name);

    if (!group) {
      return { message: `I couldn't find a tab group named "${name}".` };
    }

    const tabCount = (group.tabs || []).length;
    const closeTabs = booleanArg(args, "closeTabs") === true;

    if (booleanArg(args, "confirmed") !== true) {
      const closeMsg = closeTabs
        ? " and close all its tabs"
        : " (your tabs will be ungrouped)";
      setPendingConfirmation({
        command: "delete_tab_group",
        args: { ...args, confirmed: true },
        description: `Delete tab group "${name}"${closeMsg}?`,
      });
      return {
        message: `Are you sure you want to delete the tab group "${name}" (${tabCount} tabs)${closeMsg}?`,
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
        message: `I've deleted the tab group "${name}"${closeTabs ? " and closed its tabs" : ""}.`,
      };
    } catch (e) {
      return { message: `I'm sorry, I couldn't delete the tab group: ${e}` };
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
        return {
          message: `No tabs found matching "${stringArg(args, "query") || ""}".`,
        };
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
      return {
        message:
          "No groupable tabs found (pinned tabs cannot be grouped, or all tabs are already in groups).",
      };
    }

    // Check if any tabs are already in OTHER groups (not the target group)
    const tabsInOtherGroups = groupableTabs.filter(
      tab => tab.group && tab.group !== group
    );
    if (
      tabsInOtherGroups.length > 0 &&
      booleanArg(args, "confirmed") !== true
    ) {
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
      return {
        message: `Added ${groupableTabs.length} tab(s) to group "${name}": ${titles}`,
      };
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
    if (!tab)
      return { message: idx != null ? `No tab ${idx}.` : "No active tab." };

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
      existingGroup =>
        normalizeName(existingGroup.label || "") === normalizeName(to)
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
      const allowed = new Set<AmbiguityTarget>(
        pending.choices || ["tab", "tab-group", "bookmark-folder"]
      );
      if (!target || !allowed.has(target as AmbiguityTarget)) {
        const optionLabels = Array.from(allowed).map(opt => {
          if (opt === "tab-group") return "tab group";
          if (opt === "bookmark-folder") return "bookmark folder";
          return "tab";
        });
        const choicesText =
          optionLabels.length > 1
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
    assistantLogger.debug("confirm-action", "Received confirmation input", {
      hasPending: !!pending,
    });
    if (!pending) {
      assistantLogger.debug("confirm-action", "No pending confirmation found");
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

function formatRelativeVisitTime(visitDate: number): string {
  const diff = Date.now() - visitDate;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(visitDate).toLocaleDateString();
}

export class SearchHistorySemanticCommand implements Command {
  commandName = "search_history";
  description =
    'Search the user\'s recent browsing history (AI semantic search). Use for pages visited, articles read, topics in history. Arguments: { query: string }. If the user asks to list or show their history without a topic, pass query as "" to return recent visits.';

  async execute(args: CommandArgs): Promise<CmdResult> {
    const qVal = (args as Record<string, unknown>)?.query;
    const query = typeof qVal === "string" ? qVal.trim() : "";

    if (!query) {
      try {
        const entries = await fetchRecentHistory(15, false);
        if (entries.length === 0) {
          return {
            message:
              "No browsing history found yet, or history could not be read. Open a few websites, then try again.",
          };
        }
        const formatted = entries.map((r, i) => ({
          index: i + 1,
          title: r.title,
          url: r.url,
          visited: new Date(r.visitDate).toLocaleDateString(),
        }));
        return { message: JSON.stringify(formatted) };
      } catch (e: any) {
        console.error("[SearchHistorySemantic] Recent list failed:", e);
        return {
          message:
            "Could not read browsing history. If this persists, check the Browser Console for [HistoryCollector] errors.",
        };
      }
    }

    try {
      const results = await semanticHistorySearch.search(query, 10);

      const MIN_RELEVANCE = 0.3;
      const MAX_RESULTS = 5;
      const filtered = results
        .filter(r => r.score >= MIN_RELEVANCE)
        .slice(0, MAX_RESULTS);

      if (filtered.length === 0) {
        let recent: Awaited<ReturnType<typeof fetchRecentHistory>> = [];
        try {
          recent = await fetchRecentHistory(50, false);
        } catch {
          recent = [];
        }
        if (recent.length === 0) {
          return {
            message:
              "No browsing history is available in this profile (0 visits from Places). " +
              "That usually means Firefox's history database did not load — try ./mach run --temp-profile, or delete obj-*/tmp/profile-default and rebuild, then visit a few https sites and retry. " +
              `Searched for: "${query}".`,
          };
        }
        return {
          message:
            `No history entries matched "${query}" among recent visits (Places has ${recent.length} recent URLs indexed for lookup). ` +
            "Try a shorter keyword (e.g. domain name), visit the page again, or check Library → History.",
        };
      }

      const formatted = filtered.map((r, i) => ({
        index: i + 1,
        title: r.title,
        url: r.url,
        relevance: Math.round(r.score * 100) + "%",
        visited: formatRelativeVisitTime(r.visitDate),
      }));

      return { message: JSON.stringify(formatted) };
    } catch (e: any) {
      console.error("[SearchHistorySemantic] Search failed:", e);
      return {
        message: `History search failed: ${e.message || "Unknown error"}. The embedding model may still be loading — please try again in a moment.`,
      };
    }
  }
}
