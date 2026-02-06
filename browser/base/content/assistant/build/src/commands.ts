import { hubs, CreateHubOpts, DeleteHubOpts } from "./hubs";
import { localMemory } from "./services/localMemory";
import { subscriptionService } from "./services/subscription";

export type CmdResult = {
  message: string;
  requiresConfirmation?: boolean;
  confirmationData?: any;
};

export interface Command {
  commandName: string;
  description: string;
  execute(args: any): Promise<CmdResult>;
}

type PendingConfirmation = {
  command: string;
  args: any;
  description: string;
};

let pendingConfirmation: PendingConfirmation | null = null;

export function getPendingConfirmation(): PendingConfirmation | null {
  return pendingConfirmation;
}

export function setPendingConfirmation(pc: PendingConfirmation | null): void {
  pendingConfirmation = pc;
  console.log("📝 setPendingConfirmation called with:", pc ? `${pc.command}: ${pc.description}` : "null");
  try {
    // Try the relay function first (set by UI)
    const relay = (window as any).oasisSetPendingConfirmationRelay;
    if (typeof relay === "function") {
      relay(pc);
      console.log("✅ Relay function called successfully");
    } else {
      console.warn("⚠️ Relay function not available");
    }
    // Also dispatch event as backup
    window.dispatchEvent(
      new CustomEvent("oasis-confirmation-update", { detail: pc })
    );
  } catch (e) {
    console.error("Failed to set pending confirmation:", e);
  }
}

export function clearPendingConfirmation(): void {
  pendingConfirmation = null;
  try {
    // Try the relay function first (set by UI)
    const relay = (window as any).oasisSetPendingConfirmationRelay;
    if (typeof relay === "function") {
      relay(null);
    }
    // Also dispatch event as backup
    window.dispatchEvent(
      new CustomEvent("oasis-confirmation-update", { detail: null })
    );
  } catch (e) {
    console.error("Failed to clear pending confirmation:", e);
  }
}

(window as any).oasisGetPendingConfirmation = getPendingConfirmation;
(window as any).oasisClearPendingConfirmation = clearPendingConfirmation;

/** Get the privileged top-level browser window/objects */
function getChrome() {
  const topWin = window.top as any;
  const gBrowser = topWin?.gBrowser;
  return { topWin, gBrowser };
}

/* ===========================
 * Tab Commands
 * =========================== */

export class ListTabsCommand implements Command {
  commandName = "list_tabs";
  description =
    "List titles of tabs in the current window. Accepts no arguments.";
  async execute(_args: any): Promise<CmdResult> {
    const { gBrowser } = getChrome();
    if (!gBrowser) return { message: "Browser UI (gBrowser) not available." };
    const titles = Array.from(gBrowser.tabs).map(
      (t: any) =>
        t.label ||
        t.linkedBrowser?.contentTitle ||
        t.linkedBrowser?.currentURI?.spec ||
        "(untitled)"
    );
    // Return structured JSON for the AI to format
    const out = JSON.stringify(titles.slice(0, 50));
    return { message: out };
  }
}

export class NewWindowCommand implements Command {
  commandName = "new_window";
  description = "Open a new browser window.";
  async execute(args: any): Promise<CmdResult> {
    const { topWin } = getChrome();
    if (!topWin) return { message: "Browser UI not available." };

    topWin.OpenBrowserWindow();
    return { message: "Successfully opened a new window." };
  }
}

export class OrganizeWindowsCommand implements Command {
  commandName = "organize_windows";
  description = "Arrange two or more windows side-by-side.";
  async execute(args: any): Promise<CmdResult> {
    const { topWin } = getChrome();
    if (!topWin) return { message: "Browser UI not available." };

    // Access Services.jsm via global Services or ChromeUtils
    const Services = (topWin as any).Services || (window as any).Services;

    if (!Services) {
      return { message: "Services module not available." };
    }

    const windowManager = Services.wm;
    const windows = windowManager.getEnumerator("navigator:browser");
    const browserWindows = [];

    while (windows.hasMoreElements()) {
      const win = windows.getNext();
      // Filter for visible, non-minimized windows if possible, or just all browser windows
      if (
        !win.closed &&
        win.document.documentElement.getAttribute("windowtype") ===
          "navigator:browser"
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
  async execute(args: any): Promise<CmdResult> {
    const { topWin } = getChrome();
    if (!topWin) return { message: "Browser UI not available." };

    const url = args?.url;
    if (!url) return { message: "Missing 'url' argument." };

    topWin.openTrustedLinkIn(url, "tab");
    return { message: `Successfully opened URL: ${url}` };
  }
}

export class OpenTabCommand implements Command {
  commandName = "open_tab";
  description =
    "Open a new tab with a given URL. Accepts arguments: { url: string }.";
  async execute(args: any): Promise<CmdResult> {
    const { topWin } = getChrome();
    let url = args?.url;
    if (!url) return { message: "Missing 'url' argument." };
    if (!topWin?.openTrustedLinkIn)
      return { message: "Cannot open tab (openTrustedLinkIn not found)." };

    // If it doesn't look like a URL (no dots, or has spaces), treat it as a "Smart Open" (I'm Feeling Lucky)
    // This allows "Open youtube music" to redirect to "music.youtube.com"
    const isUrlLike = url.includes(".") && !url.includes(" ");

    if (!isUrlLike) {
      // Use DuckDuckGo "I'm Feeling Ducky" (backslash) to redirect to the first result
      // Google's btnI often shows a "Redirect Notice" page. DDG is smoother.
      url = "https://duckduckgo.com/?q=\\" + encodeURIComponent(url);
    } else {
      // It looks like a URL (e.g. "google.com"), use Firefox's fixup (adds https://, etc.)
      try {
        const Services = (topWin as any).Services || (window as any).Services;
        if (Services?.uriFixup) {
          const flags = 2 | 4; // ALLOW_KEYWORD_LOOKUP | FIX_SCHEME_TYPOS
          const fixed = Services.uriFixup.getFixupURIInfo(url, flags);
          if (fixed?.preferredURI) {
            url = fixed.preferredURI.spec;
          }
        }
      } catch (e) {
        console.warn("Failed to fixup URI:", e);
      }
    }

    topWin.openTrustedLinkIn(url, "tab");
    const display = !isUrlLike ? args?.url : url;
    return { message: `Successfully opened tab to: ${display}` };
  }
}

export class CloseTabCommand implements Command {
  commandName = "close_tab";
  description =
    "Close the active tab (or a tab by index). Accepts arguments: { index?: number, confirmed?: boolean } (1-based).";
  async execute(args: any): Promise<CmdResult> {
    const { gBrowser } = getChrome();
    if (!gBrowser) return { message: "Browser UI (gBrowser) not available." };
    let tab = gBrowser.selectedTab;
    const idx = args?.index;
    if (idx != null) {
      const i = Math.max(1, Math.floor(idx));
      if (i > gBrowser.tabs.length) return { message: `No tab ${i}.` };
      tab = gBrowser.tabs[i - 1];
    }
    const title = tab?.label || "(untitled)";

    if (!args?.confirmed) {
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
    gBrowser.removeTab(tab);
    return { message: `Closed tab: ${title}` };
  }
}

export class MoveTabToNewWindowCommand implements Command {
  commandName = "move_tab_to_new_window";
  description =
    "Move the active tab (or a tab by index) to a new window. Accepts arguments: { index?: number } (1-based).";
  async execute(args: any): Promise<CmdResult> {
    const { topWin, gBrowser } = getChrome();
    if (!gBrowser || !topWin) return { message: "Browser UI not available." };

    let tab = gBrowser.selectedTab;
    const idx = args?.index;
    if (idx != null) {
      const i = Math.max(1, Math.floor(idx));
      if (i > gBrowser.tabs.length) return { message: `No tab ${i}.` };
      tab = gBrowser.tabs[i - 1];
    }
    const title =
      tab?.label || tab?.linkedBrowser?.currentURI?.spec || "(untitled)";
    const newWin = topWin.OpenBrowserWindow();
    await new Promise(r => setTimeout(r, 250)); // give it a tick
    (newWin as any).gBrowser.adoptTab(tab, 0);
    return { message: `Moved tab to new window: ${title}` };
  }
}

export class CopyTabUrlsCommand implements Command {
  commandName = "copy_tab_urls";
  description =
    "Copy all tab URLs in the current window to the clipboard (one per line). Accepts no arguments.";
  async execute(_args: any): Promise<CmdResult> {
    const { gBrowser } = getChrome();
    if (!gBrowser) return { message: "Browser UI (gBrowser) not available." };
    const urls = Array.from(gBrowser.tabs)
      .map((t: any) => t.linkedBrowser?.currentURI?.spec)
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
 * Hub Commands
 * =========================== */

export class CreateHubCommand implements Command {
  commandName = "create_hub";
  description =
    "Create a bookmark folder hub. Accepts arguments: { name: string, include?: 'none'|'current'|'all' }.";
  async execute(args: any): Promise<CmdResult> {
    const name = args?.name || "";
    const include = args?.include || "none";
    const res = await hubs.create(name, { include });
    return { message: `Created hub "${res.name}" with ${res.count} items.` };
  }
}

export class DeleteHubCommand implements Command {
  commandName = "delete_hub";
  description =
    "Delete a bookmark folder hub by name. Accepts arguments: { name: string, closeTabs?: boolean, confirmed?: boolean }.";
  async execute(args: any): Promise<CmdResult> {
    const name = args?.name;
    if (!name) return { message: "Which hub should I delete?" };

    if (!args?.confirmed) {
      const closeTabs = args?.closeTabs || false;
      const closeMsg = closeTabs ? " and close all associated tabs" : "";
      setPendingConfirmation({
        command: "delete_hub",
        args: { ...args, confirmed: true },
        description: `Delete hub "${name}"${closeMsg}?`,
      });
      return {
        message: `Requesting confirmation to delete hub "${name}"${closeMsg}...`,
        requiresConfirmation: true,
        confirmationData: { name, closeTabs },
      };
    }

    clearPendingConfirmation();
    const closeTabs = args?.closeTabs || false;
    const res = await hubs.delete(name, { closeTabs });
    if (res.removed === 0) return { message: `No hub named "${name}".` };
    return {
      message: `Deleted hub "${res.name}" (${res.removed} items removed).`,
    };
  }
}

export class ListHubsCommand implements Command {
  commandName = "list_hubs";
  description = "List all bookmark folder hubs. Accepts no arguments.";
  async execute(_args: any): Promise<CmdResult> {
    const items = await hubs.list();
    if (!items.length) return { message: "No bookmark folder hubs yet." };
    return {
      message: JSON.stringify(items.map(h => `${h.name} (${h.count})`)),
    };
  }
}

export class RenameHubCommand implements Command {
  commandName = "rename_hub";
  description =
    "Rename a bookmark folder hub. Accepts arguments: { from: string, to: string }.";
  async execute(args: any): Promise<CmdResult> {
    const from = args?.from;
    const to = args?.to;
    if (!from || !to)
      return { message: "Please provide old and new hub names." };
    const r = await hubs.rename(from, to);
    return {
      message: r.ok
        ? `Renamed "${from}" to "${to}".`
        : `Rename failed: ${r.msg || "unknown error"}`,
    };
  }
}

export class AddTabToHubCommand implements Command {
  commandName = "add_tab_to_hub";
  description =
    "Add tabs to a bookmark folder hub. Accepts arguments: { name: string, query?: string } (query matches title/URL). If no query, adds current tab.";
  async execute(args: any): Promise<CmdResult> {
    const name = args?.name;
    if (!name) return { message: "Which hub should I add tabs to?" };

    const { gBrowser } = getChrome();
    if (!gBrowser) return { message: "Browser UI not available." };

    const query = args?.query?.toLowerCase();
    let tabsToAdd: any[] = [];

    if (query) {
      // Find all tabs matching the query
      tabsToAdd = Array.from(gBrowser.tabs).filter((t: any) => {
        const title = (t.label || "").toLowerCase();
        const url = (t.linkedBrowser?.currentURI?.spec || "").toLowerCase();
        return title.includes(query) || url.includes(query);
      });

      if (tabsToAdd.length === 0) {
        return { message: `No tabs found matching "${args.query}".` };
      }
    } else {
      // Default to current tab
      tabsToAdd = [gBrowser.selectedTab];
    }

    const r = await hubs.addTabs(name, tabsToAdd);

    if (!r.ok) return { message: `Failed to add tabs to "${name}".` };

    const count = tabsToAdd.length;
    return { message: `Added ${count} tab(s) to hub "${name}".` };
  }
}

export class RemoveTabFromHubCommand implements Command {
  commandName = "remove_tab_from_hub";
  description =
    "Remove a tab from a bookmark folder hub. Accepts arguments: { name: string, url?: string } (defaults to current tab URL).";
  async execute(args: any): Promise<CmdResult> {
    const name = args?.name;
    if (!name) return { message: "Which hub?" };

    let url = args?.url;
    if (!url) {
      const { gBrowser } = getChrome();
      if (gBrowser) {
        url = gBrowser.selectedTab?.linkedBrowser?.currentURI?.spec;
      }
    }

    if (!url) return { message: "Could not determine URL to remove." };

    const r = await hubs.removeUrl(name, url);
    return {
      message: r.ok
        ? `Removed URL from hub "${name}" and ungrouped any matching tabs.`
        : `Failed to remove URL from hub "${name}" (maybe not found).`,
    };
  }
}

export class OpenHubCommand implements Command {
  commandName = "open_hub";
  description =
    "Open all bookmarks from a hub folder in tabs or a new window. Accepts arguments: { name: string, where?: 'tabs'|'window' }.";
  async execute(args: any): Promise<CmdResult> {
    const name = args?.name;
    if (!name) return { message: "Which hub should I open?" };
    const where = args?.where || "tabs";
    const r = await hubs.openHub(name, where);
    return {
      message: r.ok
        ? `Opened hub "${name}" in ${where}.`
        : `Failed to open hub "${name}".`,
    };
  }
}

export class AddSplitViewCommand implements Command {
  commandName = "add_split_view";
  description =
    "Add split view with tabs side-by-side. Accepts arguments: { indices?: [number, number], withIndex?: number, withQuery?: string }. Use 'indices' to specify two tabs by number. Use 'withIndex' or 'withQuery' to split current tab with another. If no arguments, opens split view with a new tab.";
  async execute(args: any): Promise<CmdResult> {
    const { topWin, gBrowser } = getChrome();
    if (!gBrowser || !topWin) return { message: "Browser UI not available." };

    const Services = (topWin as any).Services || (window as any).Services;
    const splitViewEnabled = Services?.prefs?.getBoolPref?.(
      "browser.tabs.splitView.enabled",
      false
    );
    if (!splitViewEnabled) {
      return { message: "Split view is not enabled in this browser." };
    }

    let tab1: any = null;
    let tab2: any = null;

    const indices = args?.indices;
    if (indices && Array.isArray(indices) && indices.length >= 2) {
      const i1 = Math.max(1, Math.floor(indices[0]));
      const i2 = Math.max(1, Math.floor(indices[1]));
      if (i1 > gBrowser.tabs.length) return { message: `No tab ${i1}.` };
      if (i2 > gBrowser.tabs.length) return { message: `No tab ${i2}.` };
      if (i1 === i2) return { message: "Cannot split a tab with itself." };
      tab1 = gBrowser.tabs[i1 - 1];
      tab2 = gBrowser.tabs[i2 - 1];
    } else {
      tab1 = gBrowser.selectedTab;
      const withIndex = args?.withIndex;
      const withQuery = args?.withQuery?.toLowerCase();

      if (withIndex != null) {
        const i = Math.max(1, Math.floor(withIndex));
        if (i > gBrowser.tabs.length) return { message: `No tab ${i}.` };
        tab2 = gBrowser.tabs[i - 1];
      } else if (withQuery) {
        tab2 = Array.from(gBrowser.tabs).find((t: any) => {
          const title = (t.label || "").toLowerCase();
          const url = (t.linkedBrowser?.currentURI?.spec || "").toLowerCase();
          return title.includes(withQuery) || url.includes(withQuery);
        });
        if (!tab2) {
          return { message: `No tab found matching "${args.withQuery}".` };
        }
      } else {
        tab2 = gBrowser.addTrustedTab("about:newtab");
      }
    }

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
      gBrowser.addTabSplitView([tab1, tab2], {
        insertBefore: tab1,
      });

      const title1 = tab1.label || "(untitled)";
      const title2 = tab2.label || "(new tab)";
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
  async execute(_args: any): Promise<CmdResult> {
    const { gBrowser } = getChrome();
    if (!gBrowser) return { message: "Browser UI not available." };

    const currentTab = gBrowser.selectedTab;
    const splitview = currentTab.splitview;

    if (!splitview) {
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
  async execute(args: any): Promise<CmdResult> {
    const { topWin, gBrowser } = getChrome();
    if (!gBrowser || !topWin) return { message: "Browser UI not available." };

    const indices = args?.indices;
    if (!indices || !Array.isArray(indices) || indices.length < 2) {
      return {
        message:
          "Please provide at least 2 tab indices to split (e.g., { indices: [1, 2] }).",
      };
    }

    // Validate all indices first
    const tabs: any[] = [];
    for (const idx of indices) {
      const i = Math.max(1, Math.floor(idx));
      if (i > gBrowser.tabs.length) {
        return { message: `No tab ${i}.` };
      }
      tabs.push(gBrowser.tabs[i - 1]);
    }

    // Get screen dimensions
    const screen = topWin.screen;
    const availWidth = screen.availWidth;
    const availHeight = screen.availHeight;
    const availLeft = screen.availLeft || 0;
    const availTop = screen.availTop || 0;

    const numTabs = tabs.length;
    const windows: any[] = [];

    // Create windows for each tab
    for (let i = 0; i < numTabs; i++) {
      const tab = tabs[i];
      const title =
        tab?.label || tab?.linkedBrowser?.currentURI?.spec || "(untitled)";

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
      const { win, tab, title } = windows[i];

      // Horizontal layout (side-by-side, left to right)
      const windowWidth = Math.floor(availWidth / numTabs);
      const windowHeight = availHeight;
      const xPos = availLeft + windowWidth * i;
      const yPos = availTop;

      win.resizeTo(windowWidth, windowHeight);
      win.moveTo(xPos, yPos);

      // Close the sidebar if it's open (since session storage isn't implemented yet)
      try {
        const sidebar = win.document.getElementById("sidebar-box");
        if (sidebar && !sidebar.hidden) {
          win.SidebarController?.hide();
        }
      } catch (e) {
        console.warn("Failed to close sidebar:", e);
      }

      // Move the tab to the new window
      win.gBrowser.adoptTab(tab, 0);
    }

    const tabTitles = windows.map(w => w.title).join(", ");
    return { message: `Split ${numTabs} tabs side-by-side: ${tabTitles}` };
  }
}

export class SearchMemoryCommand implements Command {
  commandName = "search_memory";
  description =
    "Search stored memory (bookmarks/hubs) for a query. Arguments: { query: string, hub?: string }.";
  async execute(args: any): Promise<CmdResult> {
    const query = args?.query;
    const hub = args?.hub;
    if (!query) return { message: "Missing 'query' argument." };

    const results = await localMemory.search(
      query,
      5,
      hub ? { hub } : undefined
    );

    if (results.length === 0) {
      return {
        message: `No matches found for "${query}"${hub ? ` in hub "${hub}"` : ""}.`,
      };
    }

    // Return structured data for the AI to format
    const structured = results.map((r, i) => ({
      index: i + 1,
      title: r.metadata?.title || "(no title)",
      url: r.metadata?.url || "",
      snippet: r.text.length > 100 ? r.text.substring(0, 100) + "..." : r.text,
    }));

    return { message: JSON.stringify(structured) };
  }
}

export class ShowSubscriptionCommand implements Command {
  commandName = "show_subscription";
  description = "Show the current subscription plan and usage options.";
  async execute(_args: any): Promise<CmdResult> {
    const { topWin } = getChrome();
    if (!topWin) return { message: "Browser UI not available." };

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
  async execute(_args: any): Promise<CmdResult> {
    const { gBrowser } = getChrome();
    if (!gBrowser) return { message: "Browser UI (gBrowser) not available." };

    const groups = gBrowser.tabGroups || [];
    if (groups.length === 0) {
      return { message: "No tab groups in this window." };
    }

    const groupInfo = Array.from(groups).map((g: any) => ({
      name: g.label || "(unnamed)",
      tabCount: (g.tabs || []).length,
      collapsed: g.collapsed || false,
    }));

    return { message: JSON.stringify(groupInfo) };
  }
}

export class CreateTabGroupCommand implements Command {
  commandName = "create_tab_group";
  description =
    "Create a new tab group from specified tabs. Accepts arguments: { name: string, indices?: number[], confirmed?: boolean }. If no indices provided, uses current tab.";
  async execute(args: any): Promise<CmdResult> {
    const { gBrowser } = getChrome();
    if (!gBrowser) return { message: "Browser UI (gBrowser) not available." };

    const name = args?.name || "New Group";
    const indices = args?.indices;

    let tabsToGroup: any[] = [];

    if (indices && Array.isArray(indices) && indices.length > 0) {
      for (const idx of indices) {
        const i = Math.max(1, Math.floor(idx));
        if (i > gBrowser.tabs.length) {
          return { message: `No tab ${i}.` };
        }
        tabsToGroup.push(gBrowser.tabs[i - 1]);
      }
    } else {
      tabsToGroup = [gBrowser.selectedTab];
    }

    const groupableTabs = tabsToGroup.filter((t: any) => !t.pinned);
    if (groupableTabs.length === 0) {
      return { message: "No groupable tabs (pinned tabs cannot be grouped)." };
    }

    // Check if any tabs are already in groups
    const tabsInGroups = groupableTabs.filter((t: any) => t.group);
    if (tabsInGroups.length > 0 && !args?.confirmed) {
      const affectedGroups = new Set<string>();
      for (const tab of tabsInGroups) {
        const groupName = tab.group?.label || "(unnamed)";
        affectedGroups.add(groupName);
      }
      const groupNames = Array.from(affectedGroups).join(", ");
      const willBeEmpty: string[] = [];
      
      // Check if any groups will be left empty
      for (const tab of tabsInGroups) {
        if (tab.group) {
          const groupTabs = tab.group.tabs || [];
          const tabsBeingMoved = groupTabs.filter((t: any) => tabsInGroups.includes(t));
          if (tabsBeingMoved.length === groupTabs.length) {
            const groupLabel = tab.group.label || "(unnamed)";
            if (!willBeEmpty.includes(groupLabel)) {
              willBeEmpty.push(groupLabel);
            }
          }
        }
      }

      let warningMsg = `${tabsInGroups.length} tab(s) will be moved from existing group(s): ${groupNames}.`;
      if (willBeEmpty.length > 0) {
        warningMsg += ` This will delete the following empty group(s): ${willBeEmpty.join(", ")}.`;
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
        confirmationData: { name, affectedGroups: Array.from(affectedGroups), willBeEmpty },
      };
    }

    clearPendingConfirmation();

    try {
      gBrowser.addTabGroup(groupableTabs, { label: name });
      return {
        message: `Created tab group "${name}" with ${groupableTabs.length} tab(s).`,
      };
    } catch (e) {
      return { message: `Failed to create tab group: ${e}` };
    }
  }
}

export class DeleteTabGroupCommand implements Command {
  commandName = "delete_tab_group";
  description =
    "Delete a tab group by name. Accepts arguments: { name: string, closeTabs?: boolean, confirmed?: boolean }.";
  async execute(args: any): Promise<CmdResult> {
    const { gBrowser } = getChrome();
    if (!gBrowser) return { message: "Browser UI (gBrowser) not available." };

    const name = args?.name;
    if (!name) return { message: "Which tab group should I delete?" };

    const groups = gBrowser.tabGroups || [];
    const group = Array.from(groups).find(
      (g: any) => (g.label || "").toLowerCase() === name.toLowerCase()
    );

    if (!group) {
      return { message: `No tab group named "${name}".` };
    }

    const tabCount = ((group as any).tabs || []).length;
    const closeTabs = args?.closeTabs || false;

    if (!args?.confirmed) {
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
      if (closeTabs) {
        const tabs = (group as any).tabs || [];
        for (const tab of tabs) {
          gBrowser.removeTab(tab);
        }
      } else {
        const tabs = (group as any).tabs || [];
        for (const tab of tabs) {
          if (gBrowser.ungroupTab) {
            gBrowser.ungroupTab(tab);
          }
        }
      }
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
  async execute(args: any): Promise<CmdResult> {
    const { gBrowser } = getChrome();
    if (!gBrowser) return { message: "Browser UI (gBrowser) not available." };

    const name = args?.name;
    if (!name) return { message: "Which tab group should I add the tab to?" };

    const groups = gBrowser.tabGroups || [];
    const group = Array.from(groups).find(
      (g: any) => (g.label || "").toLowerCase() === name.toLowerCase()
    );

    if (!group) {
      return {
        message: `No tab group named "${name}". Use create_tab_group to create one first.`,
      };
    }

    let tabsToAdd: any[] = [];
    const query = args?.query?.toLowerCase();
    const idx = args?.index;
    const all = args?.all;

    if (all === true) {
      tabsToAdd = Array.from(gBrowser.tabs).filter((t: any) => !t.group);
    } else if (query) {
      tabsToAdd = Array.from(gBrowser.tabs).filter((t: any) => {
        const title = (t.label || "").toLowerCase();
        const url = (t.linkedBrowser?.currentURI?.spec || "").toLowerCase();
        return title.includes(query) || url.includes(query);
      });

      if (tabsToAdd.length === 0) {
        return { message: `No tabs found matching "${args.query}".` };
      }
    } else if (idx != null) {
      const i = Math.max(1, Math.floor(idx));
      if (i > gBrowser.tabs.length) return { message: `No tab ${i}.` };
      tabsToAdd = [gBrowser.tabs[i - 1]];
    } else {
      tabsToAdd = [gBrowser.selectedTab];
    }

    const groupableTabs = tabsToAdd.filter((t: any) => !t.pinned);
    if (groupableTabs.length === 0) {
      return { message: "No groupable tabs found (pinned tabs cannot be grouped, or all tabs are already in groups)." };
    }

    // Check if any tabs are already in OTHER groups (not the target group)
    const tabsInOtherGroups = groupableTabs.filter((t: any) => t.group && t.group !== group);
    if (tabsInOtherGroups.length > 0 && !args?.confirmed) {
      const affectedGroups = new Set<string>();
      for (const tab of tabsInOtherGroups) {
        const groupName = tab.group?.label || "(unnamed)";
        affectedGroups.add(groupName);
      }
      const groupNames = Array.from(affectedGroups).join(", ");
      const willBeEmpty: string[] = [];
      
      // Check if any groups will be left empty
      for (const tab of tabsInOtherGroups) {
        if (tab.group) {
          const groupTabs = tab.group.tabs || [];
          const tabsBeingMoved = groupTabs.filter((t: any) => tabsInOtherGroups.includes(t));
          if (tabsBeingMoved.length === groupTabs.length) {
            const groupLabel = tab.group.label || "(unnamed)";
            if (!willBeEmpty.includes(groupLabel)) {
              willBeEmpty.push(groupLabel);
            }
          }
        }
      }

      let warningMsg = `${tabsInOtherGroups.length} tab(s) will be moved from existing group(s): ${groupNames}.`;
      if (willBeEmpty.length > 0) {
        warningMsg += ` This will delete the following empty group(s): ${willBeEmpty.join(", ")}.`;
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
        confirmationData: { name, affectedGroups: Array.from(affectedGroups), willBeEmpty },
      };
    }

    clearPendingConfirmation();

    try {
      (group as any).addTabs(groupableTabs);
      const titles = groupableTabs.map((t: any) => t.label || "(untitled)").join(", ");
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
  async execute(args: any): Promise<CmdResult> {
    const { gBrowser } = getChrome();
    if (!gBrowser) return { message: "Browser UI (gBrowser) not available." };

    let tab = gBrowser.selectedTab;
    const idx = args?.index;
    if (idx != null) {
      const i = Math.max(1, Math.floor(idx));
      if (i > gBrowser.tabs.length) return { message: `No tab ${i}.` };
      tab = gBrowser.tabs[i - 1];
    }

    const title = tab?.label || "(untitled)";

    if (!tab.group) {
      return { message: `Tab "${title}" is not in any group.` };
    }

    try {
      if (gBrowser.ungroupTab) {
        gBrowser.ungroupTab(tab);
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
  async execute(args: any): Promise<CmdResult> {
    const { gBrowser } = getChrome();
    if (!gBrowser) return { message: "Browser UI (gBrowser) not available." };

    const from = args?.from;
    const to = args?.to;
    if (!from || !to)
      return { message: "Please provide old and new group names." };

    const groups = gBrowser.tabGroups || [];
    const group = Array.from(groups).find(
      (g: any) => (g.label || "").toLowerCase() === from.toLowerCase()
    );

    if (!group) {
      return { message: `No tab group named "${from}".` };
    }

    const existingWithNewName = Array.from(groups).find(
      (g: any) => (g.label || "").toLowerCase() === to.toLowerCase()
    );
    if (existingWithNewName) {
      return { message: `A tab group named "${to}" already exists.` };
    }

    try {
      (group as any).label = to;
      return { message: `Renamed tab group "${from}" to "${to}".` };
    } catch (e) {
      return { message: `Failed to rename tab group: ${e}` };
    }
  }
}

export class ConfirmActionCommand implements Command {
  commandName = "confirm_action";
  description =
    "Confirm or cancel a pending action. Accepts arguments: { confirmed: boolean }.";
  async execute(args: any): Promise<CmdResult> {
    const pending = getPendingConfirmation();
    console.log("🔍 ConfirmActionCommand: pending confirmation =", pending);
    if (!pending) {
      console.warn("⚠️ ConfirmActionCommand: No pending confirmation found!");
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
      return { message: "Action cancelled." };
    }

    const commandMap: Record<string, Command> = {
      close_tab: new CloseTabCommand(),
      delete_hub: new DeleteHubCommand(),
      delete_tab_group: new DeleteTabGroupCommand(),
      create_tab_group: new CreateTabGroupCommand(),
      add_tab_to_group: new AddTabToGroupCommand(),
    };

    const cmd = commandMap[pending.command];
    if (!cmd) {
      clearPendingConfirmation();
      return { message: `Unknown command: ${pending.command}` };
    }

    return await cmd.execute(pending.args);
  }
}
