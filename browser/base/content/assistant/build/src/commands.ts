import { hubs, CreateHubOpts, DeleteHubOpts } from "./hubs";

export type CmdResult = { message: string };

export interface Command {
  commandName: string;
  description: string;
  execute(input: any): Promise<CmdResult>;
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
  description = "List titles of tabs in the current window.";
  async execute(): Promise<CmdResult> {
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
  description = "Open a new tab with a given URL. Input can be a string or { url: string }.";
  async execute(input: any): Promise<CmdResult> {
    const { topWin } = getChrome();
    const url = typeof input === "string" ? input : input?.url;
    if (!url) return { message: "Missing 'url'." };
    if (!topWin?.openTrustedLinkIn) return { message: "Cannot open tab (openTrustedLinkIn not found)." };
    topWin.openTrustedLinkIn(url, "tab");
    return { message: `Opened ${url}` };
  }
}

export class CloseTabCommand implements Command {
  commandName = "close_tab";
  description = "Close the active tab (or a tab by index via { index: number }, 1-based).";
  async execute(input: any): Promise<CmdResult> {
    const { gBrowser } = getChrome();
    if (!gBrowser) return { message: "Browser UI (gBrowser) not available." };
    let tab = gBrowser.selectedTab;
    const idx = typeof input === "object" && typeof input.index === "number" ? input.index : null;
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
  description = "Move the active tab (or { index }) to a new window.";
  async execute(input: any): Promise<CmdResult> {
    const { topWin, gBrowser } = getChrome();
    if (!gBrowser || !topWin) return { message: "Browser UI not available." };

    let tab = gBrowser.selectedTab;
    const idx = typeof input === "object" && typeof input.index === "number" ? input.index : null;
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
  description = "Copy all tab URLs in the current window to the clipboard (one per line).";
  async execute(): Promise<CmdResult> {
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

function extractQuoted(input: string): string | null {
  const m = input.match(/"([^"]+)"/) || input.match(/'([^']+)'/);
  return m?.[1]?.trim() || null;
}

function extractHubName(input: any): string {
  if (!input) return "";
  if (typeof input === "string") {
    const q = extractQuoted(input);
    if (q) return q;
    // If user wrote "hub Work" or "group Work", take the part after that
    const mm = input.match(/\b(?:hub|group)\b\s+(.+)$/i);
    if (mm?.[1]) return mm[1].trim();
    return input.trim();
  }
  return String(input?.name || input?.hub || input?.group || "").trim();
}

function extractInclude(input: any): CreateHubOpts["include"] {
  const s = (typeof input === "string" ? input : String(input?.include || "")).toLowerCase();
  if (/all/.test(s)) return "all";
  if (/current|this/.test(s)) return "current";
  return "none";
}

function extractCloseTabs(input: any): boolean {
  if (typeof input === "object" && typeof input.closeTabs === "boolean") return input.closeTabs;
  const s = (typeof input === "string" ? input : String(input?.closeTabs ?? input?.close ?? "")).toLowerCase();
  return /true|yes|close\s+tabs|delete\s+tabs/.test(s);
}

function extractOpenWhere(input: any): "tabs" | "window" {
  const s = (typeof input === "string" ? input : String(input?.where || "")).toLowerCase();
  if (/window|new\s+window/.test(s)) return "window";
  return "tabs";
}


export class CreateHubCommand implements Command {
  commandName = "create_hub";
  description = "Create a hub (tab group). Input can be a string name or { name, include: 'none'|'current'|'all' }.";
  async execute(input: any): Promise<CmdResult> {
    const name = extractHubName(input) || "";
    const include = extractInclude(input);
    const res = hubs.create(name, { include });
    return { message: `Created hub "${res.name}" (${res.count} items).` };
  }
}

export class DeleteHubCommand implements Command {
  commandName = "delete_hub";
  description = "Delete a hub by name. Input can be a string name or { name, closeTabs?: boolean }.";
  async execute(input: any): Promise<CmdResult> {
    const name = extractHubName(input);
    if (!name) return { message: "Which hub should I delete?" };
    const closeTabs = extractCloseTabs(input);
    const res = hubs.delete(name, { closeTabs });
    if (res.removed === 0) return { message: `No hub named "${name}".` };
    return { message: `Deleted hub "${res.name}" (${res.removed} items${closeTabs ? "; tabs closed" : ""}).` };
  }
}

export class ListHubsCommand implements Command {
  commandName = "list_hubs";
  description = "List all hubs with counts.";
  async execute(): Promise<CmdResult> {
    const items = hubs.list();
    if (!items.length) return { message: "No hubs yet." };
    return { message: items.map(h => `• ${h.name} (${h.count})`).join("\n") };
  }
}

export class RenameHubCommand implements Command {
  commandName = "rename_hub";
  description = "Rename a hub. Input can be { from, to } or a string like \"rename hub 'Old' to 'New'\".";
  async execute(input: any): Promise<CmdResult> {
    let from = "", to = "";
    if (typeof input === "string") {
      // Try to capture “rename hub 'Old' to 'New'”
      const q = input.match(/rename\s+(?:hub|group)\s+(['"].+?['"]|[^\s]+)\s+to\s+(['"].+?['"]|.+)$/i);
      if (q) {
        const unq = (s: string) => s.replace(/^['"]|['"]$/g, "").trim();
        from = unq(q[1]); to = unq(q[2]);
      } else {
        // Fallback: split around 'to'
        const parts = input.split(/\bto\b/i);
        if (parts.length === 2) {
          const left = extractHubName(parts[0]);
          const right = extractHubName(parts[1]);
          from = left; to = right;
        }
      }
    } else {
      from = String(input?.from || input?.old || "").trim();
      to   = String(input?.to   || input?.name || input?.new || "").trim();
    }
    if (!from || !to) return { message: "Please provide old and new hub names." };
    const r = hubs.rename(from, to);
    return { message: r.ok ? `Renamed hub "${from}" → "${to}".` : `Could not rename "${from}". ${r.msg || ""}` };
  }
}

export class AddTabToHubCommand implements Command {
  commandName = "add_tab_to_hub";
  description = "Add the current tab to a hub. Input can be a string hub name or { name }.";
  async execute(input: any): Promise<CmdResult> {
    let name = "";
    if (typeof input === "string") {
      const q = extractQuoted(input);
      if (q) name = q;
      else {
        // try tail after 'to'
        const m = input.match(/\bto\b\s+(.+)$/i);
        name = (m?.[1] || input).replace(/^(hub|group)\s+/i, "").trim();
      }
    } else {
      name = String(input?.name || input?.hub || "").trim();
    }
    if (!name) return { message: "Which hub should I add this tab to?" };
    const r = hubs.addCurrentTab(name);
    return { message: r.ok ? `Added current tab to "${name}".` : "Failed to add tab." };
  }
}

export class OpenHubCommand implements Command {
  commandName = "open_hub";
  description = "Open all items from a hub in tabs or a new window. Input can be a string name or { name, where: 'tabs'|'window' }.";
  async execute(input: any): Promise<CmdResult> {
    const name = extractHubName(input);
    if (!name) return { message: "Which hub should I open?" };
    const where = extractOpenWhere(input);
    const r = hubs.openHub(name, where);
    return { message: r.ok ? `Opened hub "${name}" in ${where}.` : `Failed to open "${name}".` };
  }
}
