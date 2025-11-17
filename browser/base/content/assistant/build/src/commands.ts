import { hubs, CreateHubOpts, DeleteHubOpts } from "./hubs";

export type CmdResult = { message: string };

export interface Command {
  commandName: string;
  description: string;
  execute(args: any): Promise<CmdResult>;
}

/** Get the privileged top-level browser window/objects */
function getChrome() {
  const topWin = (window.top as any);
  const gBrowser = topWin?.gBrowser;
  const browser = topWin?.browser;
  return { topWin, gBrowser, browser };
}

/* ===========================
 * Tab Commands
 * =========================== */

export class ListTabsCommand implements Command {
  commandName = "list_tabs";
  description = "List titles of tabs in the current window. Accepts no arguments.";
  async execute(_args: any): Promise<CmdResult> {
    const { gBrowser } = getChrome();
    if (!gBrowser) return { message: "Browser UI (gBrowser) not available." };
    const titles = Array.from(gBrowser.tabs).map((t: any) =>
      t.label || t.linkedBrowser?.contentTitle || t.linkedBrowser?.currentURI?.spec || "(untitled)"
    );
    const out = titles.length
      ? titles.slice(0, 50).map((t, i) => `${i + 1}. ${t}`).join("\n")
      : "No tabs.";
    return { message: out };
  }
}

/* ===========================
 * Window Commands
 * =========================== */

export class NewWindowCommand implements Command {
  commandName = "new_window";
  description = "Open a new browser window.";
  async execute(args: any): Promise<CmdResult> {
    const { topWin } = getChrome();
    if (!topWin) return { message: "Browser UI not available." };

    topWin.OpenBrowserWindow();
    return { message: "Opened a new window." };
  }
}

export class OrganizeWindowsCommand implements Command {
  commandName = "organize_windows";
  description = "Arrange two or more windows side-by-side.";
  async execute(args: any): Promise<CmdResult> {
    const { topWin } = getChrome();
    if (!topWin) return { message: "Browser UI not available." };

    const windowManager = topWin.getServices().ww;
    const windows = windowManager.getWindowEnumerator();
    const browserWindows = [];

    while (windows.hasMoreElements()) {
      const win = windows.getNext();
      if (win.document.documentElement.getAttribute("windowtype") === "navigator:browser") {
        browserWindows.push(win);
      }
    }

    if (browserWindows.length < 2) {
      return { message: "You need at least two windows to organize." };
    }

    const screen = topWin.screen;
    const availWidth = screen.availWidth;
    const availHeight = screen.availHeight;
    const availLeft = screen.availLeft || 0;
    const availTop = screen.availTop || 0;
    const numWindows = browserWindows.length;
    const windowWidth = Math.floor(availWidth / numWindows);

    for (let i = 0; i < numWindows; i++) {
      const win = browserWindows[i];
      const xPos = availLeft + (windowWidth * i);
      win.resizeTo(windowWidth, availHeight);
      win.moveTo(xPos, availTop);
    }

    return { message: `Organized ${numWindows} windows.` };
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
    return { message: `Opened ${url}` };
  }
}

export class OpenTabCommand implements Command {
  commandName = "open_tab";
  description = "Open a new tab with a given URL. Accepts arguments: { url: string }.";
  async execute(args: any): Promise<CmdResult> {
    const { topWin } = getChrome();
    const url = args?.url;
    if (!url) return { message: "Missing 'url' argument." };
    if (!topWin?.openTrustedLinkIn) return { message: "Cannot open tab (openTrustedLinkIn not found)." };
    topWin.openTrustedLinkIn(url, "tab");
    return { message: `Opened ${url}` };
  }
}

export class CloseTabCommand implements Command {
  commandName = "close_tab";
  description = "Close the active tab (or a tab by index). Accepts arguments: { index?: number } (1-based).";
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
    gBrowser.removeTab(tab);
    return { message: `Closed: ${title}` };
  }
}

export class MoveTabToNewWindowCommand implements Command {
  commandName = "move_tab_to_new_window";
  description = "Move the active tab (or a tab by index) to a new window. Accepts arguments: { index?: number } (1-based).";
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
    const title = tab?.label || tab?.linkedBrowser?.currentURI?.spec || "(untitled)";
    const newWin = topWin.OpenBrowserWindow();
    await new Promise(r => setTimeout(r, 250)); // give it a tick
    (newWin as any).gBrowser.adoptTab(tab, 0);
    return { message: `Moved: ${title}` };
  }
}

export class CopyTabUrlsCommand implements Command {
  commandName = "copy_tab_urls";
  description = "Copy all tab URLs in the current window to the clipboard (one per line). Accepts no arguments.";
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
  description = "Create a bookmark folder hub. Accepts arguments: { name: string, include?: 'none'|'current'|'all' }.";
  async execute(args: any): Promise<CmdResult> {
    const name = args?.name || "";
    const include = args?.include || "none";
    const res = await hubs.create(name, { include });
    return { message: `Created bookmark folder "${res.name}" (${res.count} items).` };
  }
}

export class DeleteHubCommand implements Command {
  commandName = "delete_hub";
  description = "Delete a bookmark folder hub by name. Accepts arguments: { name: string, closeTabs?: boolean }.";
  async execute(args: any): Promise<CmdResult> {
    const name = args?.name;
    if (!name) return { message: "Which hub should I delete?" };
    const closeTabs = args?.closeTabs || false;
    const res = await hubs.delete(name, { closeTabs });
    if (res.removed === 0) return { message: `No hub named "${name}".` };
    return { message: `Deleted bookmark folder "${res.name}" (${res.removed} items${closeTabs ? "; tabs closed" : ""}).` };
  }
}

export class ListHubsCommand implements Command {
  commandName = "list_hubs";
  description = "List all bookmark folder hubs. Accepts no arguments.";
  async execute(_args: any): Promise<CmdResult> {
    const items = await hubs.list();
    if (!items.length) return { message: "No bookmark folder hubs yet." };
    return { message: items.map(h => `• ${h.name} (${h.count})`).join("\n") };
  }
}

export class RenameHubCommand implements Command {
  commandName = "rename_hub";
  description = "Rename a bookmark folder hub. Accepts arguments: { from: string, to: string }.";
  async execute(args: any): Promise<CmdResult> {
    const from = args?.from;
    const to = args?.to;
    if (!from || !to) return { message: "Please provide old and new hub names." };
    const r = await hubs.rename(from, to);
    return { message: r.ok ? `Renamed bookmark folder "${from}" → "${to}".` : `Could not rename "${from}". ${r.msg || ""}` };
  }
}

export class AddTabToHubCommand implements Command {
  commandName = "add_tab_to_hub";
  description = "Add the current tab to a hub. Accepts arguments: { name: string }.";
  async execute(args: any): Promise<CmdResult> {
    const name = args?.name;
    if (!name) return { message: "Which hub should I add this tab to?" };

    const { gBrowser, browser } = getChrome();
    if (!gBrowser || !browser) return { message: "Browser UI not available." };

    const groups = await browser.tabGroups.query({ title: name });
    const currentTab = gBrowser.selectedTab;
    const currentTabId = gBrowser.getTabId(currentTab);

    if (groups.length > 0) {
      const groupId = groups[0].id;
      await browser.tabs.group({ tabIds: [currentTabId], groupId });
      return { message: `Added current tab to hub "${name}".` };
    } else {
      const groupId = await browser.tabs.group({ tabIds: [currentTabId] });
      await browser.tabGroups.update(groupId, { title: name });
      return { message: `Created new hub "${name}" with the current tab.` };
    }
  }
}

export class OpenHubCommand implements Command {
  commandName = "open_hub";
  description = "Open all bookmarks from a hub folder in tabs or a new window. Accepts arguments: { name: string, where?: 'tabs'|'window' }.";
  async execute(args: any): Promise<CmdResult> {
    const name = args?.name;
    if (!name) return { message: "Which hub should I open?" };
    const where = args?.where || "tabs";
    const r = await hubs.openHub(name, where);
    return { message: r.ok ? `Opened bookmark folder "${name}" in ${where}.` : `Failed to open "${name}".` };
  }
}

export class SplitTabsCommand implements Command {
  commandName = "split_tabs";
  description = "Split specified tabs into side-by-side windows. Accepts arguments: { indices: number[] }.";
  async execute(args: any): Promise<CmdResult> {
    const { topWin, gBrowser } = getChrome();
    if (!gBrowser || !topWin) return { message: "Browser UI not available." };

    const indices = args?.indices;
    if (!indices || !Array.isArray(indices) || indices.length < 2) {
      return { message: "Please provide at least 2 tab indices to split (e.g., { indices: [1, 2] })." };
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
      const title = tab?.label || tab?.linkedBrowser?.currentURI?.spec || "(untitled)";
      
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
      const xPos = availLeft + (windowWidth * i);
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
