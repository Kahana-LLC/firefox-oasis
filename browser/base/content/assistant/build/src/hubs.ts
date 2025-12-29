// Persistent (per-profile) "hub" manager using Firefox Bookmarks.
// - A "hub" is a bookmark folder under "Oasis Hubs" root folder.
// - We badge open tabs whose host matches any bookmark in a hub.
// - Assistant commands call into this manager.

type FxTab = any;

// Helper to get the correct browser window, even if running in a sidebar
function getBrowserWindow() {
  const Services = (window as any).Services || (window.top as any)?.Services;
  if (Services?.wm) {
    return Services.wm.getMostRecentWindow("navigator:browser");
  }
  return window.top;
}

function getChrome() {
  const topWin = getBrowserWindow();
  const gBrowser = topWin?.gBrowser;
  const PlacesUtils = topWin?.PlacesUtils;
  const PlacesTransactions = topWin?.PlacesTransactions;
  return { topWin, gBrowser, PlacesUtils, PlacesTransactions };
}

type HubItem = { url: string; title?: string; host: string; id: string };

const ROOT_FOLDER_NAME = "Oasis Hubs";

// Get or create the root "Oasis Hubs" folder using Firefox Places API
async function getRootFolder(): Promise<string> {
  try {
    const { PlacesUtils } = getChrome();
    if (!PlacesUtils) throw new Error("PlacesUtils not available");

    // Search for existing "Oasis Hubs" folder that's under "Other Bookmarks"
    const bookmarks = await PlacesUtils.bookmarks.search({ title: ROOT_FOLDER_NAME });
    const existing = bookmarks.find((b: any) => 
      b.type === PlacesUtils.bookmarks.TYPE_FOLDER && 
      b.parentGuid === PlacesUtils.bookmarks.unfiledGuid
    );
    if (existing) {
      return existing.guid;
    }

    // Create root folder under "Other Bookmarks"
    const root = await PlacesUtils.bookmarks.insert({
      title: ROOT_FOLDER_NAME,
      type: PlacesUtils.bookmarks.TYPE_FOLDER,
      parentGuid: PlacesUtils.bookmarks.unfiledGuid,
    });
    return root.guid;
  } catch (e) {
    console.error("Failed to get/create root folder:", e);
    throw e;
  }
}

function hostOf(u: string): string {
  try { return new URL(u).host.toLowerCase(); } catch { return ""; }
}

// Helper functions to wrap PlacesUtils API
async function getBookmarkChildren(guid: string): Promise<any[]> {
  const { PlacesUtils } = getChrome();
  if (!PlacesUtils) return [];
  try {
    // Fetch bookmarks using PlacesUtils.bookmarks.fetch
    const parent = await PlacesUtils.bookmarks.fetch(guid);
    if (!parent) return [];
    
    // Search for children
    const children: any[] = [];
    await PlacesUtils.bookmarks.fetch({ parentGuid: guid }, (bookmark: any) => {
      let u = bookmark.url;
      if (u && typeof u === "object") {
        // Handle nsIURI or URL object
        u = u.spec || u.href || u.toString();
      }
      children.push({
        guid: bookmark.guid,
        title: bookmark.title,
        type: bookmark.type,
        uri: u,
      });
    });
    
    return children;
  } catch (e) {
    console.error("Failed to get bookmark children:", e);
    return [];
  }
}

async function createBookmark(details: { parentGuid: string; title: string; url?: string; type?: number }): Promise<any> {
  const { PlacesUtils } = getChrome();
  if (!PlacesUtils) throw new Error("PlacesUtils not available");
  return await PlacesUtils.bookmarks.insert({
    parentGuid: details.parentGuid,
    title: details.title,
    url: details.url,
    type: details.type || (details.url ? PlacesUtils.bookmarks.TYPE_BOOKMARK : PlacesUtils.bookmarks.TYPE_FOLDER),
  });
}

async function removeBookmark(guid: string): Promise<void> {
  const { PlacesUtils } = getChrome();
  if (!PlacesUtils) return;
  await PlacesUtils.bookmarks.remove(guid);
}

async function updateBookmark(guid: string, changes: { title?: string }): Promise<any> {
  const { PlacesUtils } = getChrome();
  if (!PlacesUtils) throw new Error("PlacesUtils not available");
  return await PlacesUtils.bookmarks.update(guid, changes);
}

export type CreateHubOpts = { include?: "none" | "current" | "all" };
export type DeleteHubOpts = { closeTabs?: boolean };

class HubManager {
  private wired = false;
  private rootFolderId: string | null = null;

  private async ensureRootFolder(): Promise<string> {
    if (this.rootFolderId) return this.rootFolderId;
    this.rootFolderId = await getRootFolder();
    return this.rootFolderId;
  }

  async list(): Promise<Array<{ name: string; count: number }>> {
    try {
      const rootId = await this.ensureRootFolder();
      const children = await getBookmarkChildren(rootId);
      const { PlacesUtils } = getChrome();
      const folders = children.filter((c: any) => c.type === PlacesUtils?.bookmarks.TYPE_FOLDER);
      
      const result = [];
      for (const folder of folders) {
        const items = await getBookmarkChildren(folder.guid);
        result.push({ name: folder.title || "Untitled", count: items.length });
      }
      return result;
    } catch (e) {
      console.error("Failed to list hubs:", e);
      return [];
    }
  }

  async getAll(): Promise<Array<{ name: string; items: HubItem[] }>> {
    try {
      const rootId = await this.ensureRootFolder();
      const children = await getBookmarkChildren(rootId);
      const { PlacesUtils } = getChrome();
      const folders = children.filter((c: any) => c.type === PlacesUtils?.bookmarks.TYPE_FOLDER);
      
      const result = [];
      for (const folder of folders) {
        const bookmarks = await getBookmarkChildren(folder.guid);
        const items: HubItem[] = bookmarks
          .filter((b: any) => b.uri)
          .map((b: any) => ({
            id: b.guid,
            url: b.uri,
            title: b.title,
            host: hostOf(b.uri),
          }));
        result.push({ name: folder.title || "Untitled", items });
      }
      return result;
    } catch (e) {
      console.error("Failed to get all hubs:", e);
      return [];
    }
  }

  async create(name: string, opts?: CreateHubOpts) {
    try {
      name = (name || "").trim() || this.suggestName();
      const rootId = await this.ensureRootFolder();
      
      // Strict Case-insensitive check
      const children = await getBookmarkChildren(rootId);
      const { PlacesUtils } = getChrome();
      const existing = children.find((c: any) => 
        c.type === PlacesUtils?.bookmarks.TYPE_FOLDER && 
        c.title.toLowerCase() === name.toLowerCase()
      );

      let folder;
      if (existing) {
        folder = existing;
      } else {
        // Create the hub folder
        folder = await createBookmark({
          parentGuid: rootId,
          title: name,
        });
      }

      const include = opts?.include || "none";
      const { gBrowser } = getChrome();
      let count = 0;

      if (gBrowser) {
        if (include === "current") {
          const tab = gBrowser.selectedTab;
          await this.addTabs(folder.title, [tab]);
          count = 1;
        } else if (include === "all") {
          const tabs = Array.from(gBrowser.tabs);
          await this.addTabs(folder.title, tabs);
          count = tabs.length;
        }
      }

      this.updateAllTabMarkers();
      return { name: folder.title, count };
    } catch (e) {
      console.error("Failed to create hub:", e);
      throw e;
    }
  }

  async delete(name: string, opts?: DeleteHubOpts) {
    try {
      name = (name || "").trim();
      const rootId = await this.ensureRootFolder();
      const children = await getBookmarkChildren(rootId);
      const { PlacesUtils } = getChrome();
      const folder = children.find((c: any) => 
        c.type === PlacesUtils?.bookmarks.TYPE_FOLDER && 
        c.title.toLowerCase() === name.toLowerCase()
      );
      
      if (!folder) {
        return { name, removed: 0 };
      }

      const items = await getBookmarkChildren(folder.guid);
      const bookmarks = items.filter((b: any) => b.uri);

      if (opts?.closeTabs) {
        const { gBrowser } = getChrome();
        if (gBrowser) {
          const hostSet = new Set(bookmarks.map((b: any) => hostOf(b.uri)));
          for (const t of Array.from(gBrowser.tabs) as any[]) {
            const u = t?.linkedBrowser?.currentURI?.spec || "";
            if (hostSet.has(hostOf(u))) {
              try { gBrowser.removeTab(t); } catch {}
            }
          }
        }
      }

      // Delete the entire folder
      await removeBookmark(folder.guid);
      this.updateAllTabMarkers();
      return { name: folder.title, removed: bookmarks.length };
    } catch (e) {
      console.error("Failed to delete hub:", e);
      return { name, removed: 0 };
    }
  }

  async rename(oldName: string, newName: string) {
    try {
      oldName = (oldName || "").trim();
      newName = (newName || "").trim();
      if (!oldName || !newName) return { ok: false };

      const rootId = await this.ensureRootFolder();
      const children = await getBookmarkChildren(rootId);
      const { PlacesUtils } = getChrome();
      const folder = children.find((c: any) => 
        c.type === PlacesUtils?.bookmarks.TYPE_FOLDER && 
        c.title.toLowerCase() === oldName.toLowerCase()
      );
      
      if (!folder) return { ok: false };

      // Check if target name already exists
      const existing = children.find((c: any) => 
        c.type === PlacesUtils?.bookmarks.TYPE_FOLDER && 
        c.title.toLowerCase() === newName.toLowerCase()
      );
      if (existing) return { ok: false, msg: "Target exists" };

      await updateBookmark(folder.guid, { title: newName });
      this.updateAllTabMarkers();
      return { ok: true };
    } catch (e) {
      console.error("Failed to rename hub:", e);
      return { ok: false };
    }
  }

  async addTabs(name: string, tabs: FxTab[]) {
    try {
      const { PlacesUtils, gBrowser } = getChrome();
      const rootId = await this.ensureRootFolder();
      const children = await getBookmarkChildren(rootId);
      
      // Case-insensitive match for bookmark folder
      let folder = children.find((c: any) => 
        c.type === PlacesUtils?.bookmarks.TYPE_FOLDER && 
        c.title.toLowerCase() === name.toLowerCase()
      );
      
      // If folder doesn't exist, create it
      if (!folder) {
        folder = await createBookmark({
          parentGuid: rootId,
          title: name,
        });
      }

      // 1. Add to bookmark folder
      for (const tab of tabs) {
        await this.addTabToFolder(folder.guid, tab);
      }
      
      this.updateAllTabMarkers();

      // 2. Visual Grouping using gBrowser native methods
      if (gBrowser) {
        try {
          console.log(`Attempting to group tabs for hub "${name}"`);
          // Find existing group by label (case-insensitive)
          const groups = gBrowser.tabGroups || [];
          let group = Array.from(groups).find((g: any) => (g.label || "").toLowerCase() === name.toLowerCase());
          
          // Filter out pinned tabs as they cannot be grouped
          const groupableTabs = tabs.filter((t: any) => !t.pinned);
          
          if (groupableTabs.length > 0) {
            if (group) {
              console.log(`Found existing group "${(group as any).label}", adding tabs.`);
              // Add tabs to existing group
              (group as any).addTabs(groupableTabs);
            } else {
              console.log(`Creating new group "${folder.title}" with tabs.`);
              // Create new group with these tabs
              gBrowser.addTabGroup(groupableTabs, { label: folder.title });
            }
          } else {
             console.warn("No groupable tabs (all pinned?)");
          }
        } catch (e) {
          console.error("Failed to group tabs visually:", e);
        }
      } else {
          console.error("gBrowser not available for grouping.");
      }

      return { ok: true };
    } catch (e) {
      console.error("Failed to add tabs to hub:", e);
      return { ok: false };
    }
  }

  async removeUrl(name: string, url: string) {
    try {
      name = (name || "").trim();
      
      const rootId = await this.ensureRootFolder();
      const children = await getBookmarkChildren(rootId);
      const { PlacesUtils, gBrowser } = getChrome();
      
      const folder = children.find((c: any) => 
        c.type === PlacesUtils?.bookmarks.TYPE_FOLDER && 
        c.title.toLowerCase() === name.toLowerCase()
      );
      
      if (!folder) return { ok: false };

      const bookmarks = await getBookmarkChildren(folder.guid);
      const toRemove = bookmarks.filter((b: any) => b.uri === url);
      
      for (const bookmark of toRemove) {
        await removeBookmark(bookmark.guid);
      }

      if (gBrowser) {
        try {
          const groups = gBrowser.tabGroups || [];
          const group = Array.from(groups).find((g: any) => (g.label || "").toLowerCase() === name.toLowerCase());
          if (group) {
             const tabs = (group as any).tabs || [];
             // Find tabs with matching URL
             const tabsToRemove = tabs.filter((t: any) => t.linkedBrowser?.currentURI?.spec === url);
             for (const t of tabsToRemove) {
                 // Ungroup each tab
                 if (gBrowser.ungroupTab) {
                     gBrowser.ungroupTab(t);
                 } else {
                     console.warn("gBrowser.ungroupTab not available");
                 }
             }
          }
        } catch (e) {
          console.error("Failed to visually ungroup tabs:", e);
        }
      }

      this.updateAllTabMarkers();
      return { ok: toRemove.length > 0 };
    } catch (e) {
      console.error("Failed to remove URL from hub:", e);
      return { ok: false };
    }
  }

  async openHub(name: string, where: "tabs" | "window" = "tabs") {
    try {
      name = (name || "").trim();
      const rootId = await this.ensureRootFolder();
      const children = await getBookmarkChildren(rootId);
      const { PlacesUtils, topWin } = getChrome();
      
      const folder = children.find((c: any) => 
        c.type === PlacesUtils?.bookmarks.TYPE_FOLDER && 
        c.title.toLowerCase() === name.toLowerCase()
      );
      
      if (!folder) return { ok: false };

      const bookmarks = await getBookmarkChildren(folder.guid);
      const items = bookmarks.filter((b: any) => b.uri);
      const urls = items.map((it: any) => it.uri);
      console.log(`OpenHub: Found ${urls.length} URLs for hub "${name}":`, urls);

      if (urls.length === 0) return { ok: true };

      let targetBrowser: any;
      if (where === "window") {
        const w = topWin.OpenBrowserWindow();
        // A bit of a wait for the new window to be ready
        await new Promise(resolve => setTimeout(resolve, 250));
        targetBrowser = w.gBrowser;
      } else {
        // Use the current gBrowser from getChrome() which uses Services.wm
        targetBrowser = getChrome().gBrowser;
      }

      if (!targetBrowser) return { ok: false };

      // Helper to get Services
      let Services = (window as any).Services || (window.top as any)?.Services;
      if (!Services && (window as any).ChromeUtils) {
          try { Services = (window as any).ChromeUtils.import("resource://gre/modules/Services.jsm").Services; } catch (e) { console.error("Failed to import Services", e); }
      }
      const triggeringPrincipal = Services?.scriptSecurityManager?.getSystemPrincipal();
      if (!triggeringPrincipal) console.error("FATAL: Could not get system principal for addTab");

      // Check if group already exists in this window
      const groups = targetBrowser.tabGroups || [];
      let group = Array.from(groups).find((g: any) => (g.label || "").toLowerCase() === name.toLowerCase());

      if (group) {
          console.log(`OpenHub: Found existing group "${(group as any).label}", checking for duplicates.`);
          
          // Get URLs of tabs currently in this group
          const existingTabs = (group as any).tabs || [];
          const existingUrls = new Set(existingTabs.map((t: any) => t.linkedBrowser?.currentURI?.spec));
          
          // Filter out URLs that are already in the group
          const newUrls = urls.filter(u => !existingUrls.has(u));
          
          if (newUrls.length === 0) {
              console.log("OpenHub: All tabs for this hub are already open in the group.");
              // Optionally verify they are focused? For now just ensure we select the group?
              // Maybe select the first tab of the group?
              if (existingTabs.length > 0) {
                  targetBrowser.selectedTab = existingTabs[0];
              }
              return { ok: true };
          }

          console.log(`OpenHub: Opening ${newUrls.length} new tabs (skipped ${urls.length - newUrls.length} duplicates).`);
          
          // Group exists, load ONLY new tabs into it
          targetBrowser.loadTabs(newUrls, { 
              triggeringPrincipal, 
              tabGroup: group,
              inBackground: false
          });
      } else {
          console.log(`OpenHub: Group not found. Creating new group "${folder.title || name}".`);
          // Group doesn't exist.
          // Open first tab to create the group
          const firstUrl = urls[0];
          const remainingUrls = urls.slice(1);
          
          // addTab is synchronous in returning the tab object
          const tab = targetBrowser.addTab(firstUrl, { triggeringPrincipal, triggerPrimaryAction: false });
          
          // Create group with this first tab
          // ensure label is set correctly
          group = targetBrowser.addTabGroup([tab], { label: folder.title || name });
          
          // Open remaining tabs into this group
          if (remainingUrls.length > 0) {
              targetBrowser.loadTabs(remainingUrls, { 
                  triggeringPrincipal, 
                  tabGroup: group,
                  inBackground: true 
              });
          }
           targetBrowser.selectedTab = tab;
      }

      return { ok: true };
    } catch (e) {
      console.error("Failed to open hub:", e);
      return { ok: false };
    }
  }

  // ---- badges on tabs (first matched hub name; count if >1 hubs match) ----
  wireTabObservers() {
    if (this.wired) return;
    const { gBrowser } = getChrome();
    if (!gBrowser) return;
    const tb = gBrowser.tabContainer;
    const upd = () => this.updateAllTabMarkers();
    tb.addEventListener("TabOpen", upd);
    tb.addEventListener("TabAttrModified", upd);
    tb.addEventListener("TabSelect", upd);
    gBrowser.addTabsProgressListener({
      onLocationChange: (_b: any) => this.updateAllTabMarkers(),
    });
    this.wired = true;
  }

  updateAllTabMarkers() {
    const { gBrowser } = getChrome();
    if (!gBrowser) return;
    for (const t of Array.from(gBrowser.tabs)) this.updateMarkerForTab(t);
  }

  private async updateMarkerForTab(tab: FxTab) {
    try {
      const u = tab?.linkedBrowser?.currentURI?.spec || "";
      const h = hostOf(u);
      if (!h) {
        tab.removeAttribute("oasis-hub");
        tab.removeAttribute("oasis-hub-count");
        return;
      }

      const all = await this.getAll();
      const names: string[] = [];
      for (const hub of all) {
        if (hub.items.some((it: HubItem) => it.host === h)) names.push(hub.name);
      }

      if (names.length) {
        tab.setAttribute("oasis-hub", names[0]);
        tab.setAttribute("oasis-hub-count", String(names.length));
      } else {
        tab.removeAttribute("oasis-hub");
        tab.removeAttribute("oasis-hub-count");
      }
    } catch {}
  }

  private async addTabToFolder(folderGuid: string, tab: FxTab) {
    const url = tab?.linkedBrowser?.currentURI?.spec || "";
    if (!url) return;
    
    const title =
      tab?.label || tab?.linkedBrowser?.contentTitle || tab?.linkedBrowser?.currentURI?.spec || "";

    // Check if URL already exists in this folder
    const existing = await getBookmarkChildren(folderGuid);
    const alreadyExists = existing.some((b: any) => b.uri === url);
    if (alreadyExists) return;

    await createBookmark({
      parentGuid: folderGuid,
      title,
      url,
    });
  }

  private suggestName(): string {
    const base = "Hub";
    let i = 1;
    // Note: This is a simple implementation. For better UX, we'd check existing hub names.
    return `${base} ${i}`;
  }
}

export const hubs = new HubManager();
// Make sure observers are live
hubs.wireTabObservers();