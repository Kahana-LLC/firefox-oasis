import { hubs, CreateHubOpts, DeleteHubOpts } from "./hubs";
import { localMemory } from "./services/localMemory";
import { subscriptionService } from "./services/subscription";

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
  return { topWin, gBrowser };
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
      if (!win.closed && win.document.documentElement.getAttribute("windowtype") === "navigator:browser") {
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
      if (win.windowState !== 1) { // 1 is STATE_NORMAL
          win.restore();
      }
      
      const xPos = availLeft + (windowWidth * i);
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
    return { message: `Opened ${url}` };
  }
}

export class OpenTabCommand implements Command {
  commandName = "open_tab";
  description = "Open a new tab with a given URL. Accepts arguments: { url: string }.";
  async execute(args: any): Promise<CmdResult> {
    const { topWin } = getChrome();
    let url = args?.url;
    if (!url) return { message: "Missing 'url' argument." };
    if (!topWin?.openTrustedLinkIn) return { message: "Cannot open tab (openTrustedLinkIn not found)." };

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
    return { message: `Opened ${display}` };
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
    return { message: `Created hub "${res.name}" with ${res.count} items.` };
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
    return { message: `Deleted hub "${res.name}" (${res.removed} items removed).` };
  }
}

export class ListHubsCommand implements Command {
  commandName = "list_hubs";
  description = "List all bookmark folder hubs. Accepts no arguments.";
  async execute(_args: any): Promise<CmdResult> {
    const items = await hubs.list();
    if (!items.length) return { message: "No bookmark folder hubs yet." };
    return { message: items.map(h => `- ${h.name} (${h.count})`).join("\n") };
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
    return { message: r.ok ? `Renamed "${from}" to "${to}".` : `Rename failed: ${r.msg || "unknown error"}` };
  }
}

export class AddTabToHubCommand implements Command {
  commandName = "add_tab_to_hub";
  description = "Add tabs to a bookmark folder hub. Accepts arguments: { name: string, query?: string } (query matches title/URL). If no query, adds current tab.";
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
  description = "Remove a tab from a bookmark folder hub. Accepts arguments: { name: string, url?: string } (defaults to current tab URL).";
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
    return { message: r.ok ? `Removed URL from hub "${name}" and ungrouped any matching tabs.` : `Failed to remove URL from hub "${name}" (maybe not found).` };
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
    return { message: r.ok ? `Opened hub "${name}" in ${where}.` : `Failed to open hub "${name}".` };
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

export class SearchMemoryCommand implements Command {
  commandName = "search_memory";
  description = "Search stored memory (bookmarks/hubs) for a query. Arguments: { query: string, hub?: string }.";
  async execute(args: any): Promise<CmdResult> {
    const query = args?.query;
    const hub = args?.hub;
    if (!query) return { message: "Missing 'query' argument." };
    
    const results = await localMemory.search(query, 5, hub ? { hub } : undefined);
    
    if (results.length === 0) {
      return { message: `No matches found for "${query}"${hub ? ` in hub "${hub}"` : ""}.` };
    }
    
    const out = results.map((r, i) => {
      const title = r.metadata?.title || "(no title)";
      const url = r.metadata?.url || "";
      // Show a snippet of the text
      const snippet = r.text.length > 100 ? r.text.substring(0, 100) + "..." : r.text;
      return `${i + 1}. ${title} (${url})\n   "${snippet}"`;
    }).join("\n\n");
    
    return { message: `Found ${results.length} matches:\n${out}` };
  }
}

export class ShowSubscriptionCommand implements Command {
  commandName = "show_subscription";
  description = "Show the current subscription plan and usage options.";
  async execute(_args: any): Promise<CmdResult> {
    const { topWin } = getChrome();
    if (!topWin) return { message: "Browser UI not available." };
    
    // Check usage simply to report it? Or just open the page?
    // Let's get stats first to show in the message before redirecting
    const stats = await subscriptionService.checkAvailability();
    const url = subscriptionService.getSubscriptionUrl();
    
    // Open the pricing/billing page
    topWin.openTrustedLinkIn(url, "tab");

    return { 
        message: `Opened subscription page.\nUsage this month: ${stats.totalUnits} units / ${stats.limit} limit.` 
    };
  }
}
