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
  description = "Create a hub (tab group). Accepts arguments: { name: string, include?: 'none'|'current'|'all' }.";
  async execute(args: any): Promise<CmdResult> {
    const name = args?.name || "";
    const include = args?.include || "none";
    const res = hubs.create(name, { include });
    return { message: `Created hub "${res.name}" (${res.count} items).` };
  }
}

export class DeleteHubCommand implements Command {
  commandName = "delete_hub";
  description = "Delete a hub by name. Accepts arguments: { name: string, closeTabs?: boolean }.";
  async execute(args: any): Promise<CmdResult> {
    const name = args?.name;
    if (!name) return { message: "Which hub should I delete?" };
    const closeTabs = args?.closeTabs || false;
    const res = hubs.delete(name, { closeTabs });
    if (res.removed === 0) return { message: `No hub named "${name}".` };
    return { message: `Deleted hub "${res.name}" (${res.removed} items${closeTabs ? "; tabs closed" : ""}).` };
  }
}

export class ListHubsCommand implements Command {
  commandName = "list_hubs";
  description = "List all hubs with counts. Accepts no arguments.";
  async execute(_args: any): Promise<CmdResult> {
    const items = hubs.list();
    if (!items.length) return { message: "No hubs yet." };
    return { message: items.map(h => `• ${h.name} (${h.count})`).join("\n") };
  }
}

export class RenameHubCommand implements Command {
  commandName = "rename_hub";
  description = "Rename a hub. Accepts arguments: { from: string, to: string }.";
  async execute(args: any): Promise<CmdResult> {
    const from = args?.from;
    const to = args?.to;
    if (!from || !to) return { message: "Please provide old and new hub names." };
    const r = hubs.rename(from, to);
    return { message: r.ok ? `Renamed hub "${from}" → "${to}".` : `Could not rename "${from}". ${r.msg || ""}` };
  }
}

export class AddTabToHubCommand implements Command {
  commandName = "add_tab_to_hub";
  description = "Add the current tab to a hub. Accepts arguments: { name: string }.";
  async execute(args: any): Promise<CmdResult> {
    const name = args?.name;
    if (!name) return { message: "Which hub should I add this tab to?" };
    const r = hubs.addCurrentTab(name);
    return { message: r.ok ? `Added current tab to "${name}".` : "Failed to add tab." };
  }
}

export class OpenHubCommand implements Command {
  commandName = "open_hub";
  description = "Open all items from a hub in tabs or a new window. Accepts arguments: { name: string, where?: 'tabs'|'window' }.";
  async execute(args: any): Promise<CmdResult> {
    const name = args?.name;
    if (!name) return { message: "Which hub should I open?" };
    const where = args?.where || "tabs";
    const r = hubs.openHub(name, where);
    return { message: r.ok ? `Opened hub "${name}" in ${where}.` : `Failed to open "${name}".` };
  }
}
