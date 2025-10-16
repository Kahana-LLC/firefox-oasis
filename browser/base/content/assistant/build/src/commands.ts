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
    let url = typeof input === "string" ? input : input?.url;
    if (!url) return { message: "Missing 'url'." };
    if (!topWin?.openTrustedLinkIn) return { message: "Cannot open tab (openTrustedLinkIn not found)." };
    
    // Normalize the URL
    url = this.normalizeUrl(url);
    
    topWin.openTrustedLinkIn(url, "tab");
    return { message: `Opened ${url}` };
  }
  
  private normalizeUrl(input: string): string {
    // Remove common prefixes that users might include
    let url = input.trim();
    
    // Remove "go to", "navigate to", "open", etc.
    url = url.replace(/^(go to|navigate to|open|visit)\s+/i, '');
    
    // If it already has a protocol, use as-is
    if (url.match(/^https?:\/\//i)) {
      return url;
    }
    
    // If it looks like a domain (contains dots but no spaces), add https://
    if (url.includes('.') && !url.includes(' ')) {
      return `https://${url}`;
    }
    
    // For common sites, convert to proper URLs
    const commonSites: { [key: string]: string } = {
      'youtube': 'https://youtube.com',
      'google': 'https://google.com',
      'github': 'https://github.com',
      'stackoverflow': 'https://stackoverflow.com',
      'reddit': 'https://reddit.com',
      'twitter': 'https://twitter.com',
      'facebook': 'https://facebook.com',
      'instagram': 'https://instagram.com',
      'linkedin': 'https://linkedin.com',
      'amazon': 'https://amazon.com',
      'netflix': 'https://netflix.com',
      'spotify': 'https://spotify.com',
      'gmail': 'https://gmail.com',
      'outlook': 'https://outlook.com',
      'yahoo': 'https://yahoo.com',
      'bing': 'https://bing.com',
      'duckduckgo': 'https://duckduckgo.com',
      'wikipedia': 'https://wikipedia.org',
      'medium': 'https://medium.com',
      'dev.to': 'https://dev.to',
      'hackernews': 'https://news.ycombinator.com',
      'producthunt': 'https://producthunt.com',
      'figma': 'https://figma.com',
      'notion': 'https://notion.so',
      'slack': 'https://slack.com',
      'discord': 'https://discord.com',
      'zoom': 'https://zoom.us',
      'dropbox': 'https://dropbox.com',
      'drive': 'https://drive.google.com',
      'docs': 'https://docs.google.com',
      'sheets': 'https://sheets.google.com',
      'slides': 'https://slides.google.com',
    };
    
    const lowerInput = url.toLowerCase();
    if (commonSites[lowerInput]) {
      return commonSites[lowerInput];
    }
    
    // If it contains spaces, treat it as a search query
    if (url.includes(' ')) {
      return `https://google.com/search?q=${encodeURIComponent(url)}`;
    }
    
    // Default: try to add https://
    return `https://${url}`;
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
