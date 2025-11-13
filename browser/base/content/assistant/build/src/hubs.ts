// Persistent (per-profile) "hub" manager using Firefox Bookmarks.
// - A "hub" is a bookmark folder under "Oasis Hubs" root folder.
// - We badge open tabs whose host matches any bookmark in a hub.
// - Assistant commands call into this manager.

type FxTab = any;

function getChrome() {
  const topWin = (window.top as any);
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
      console.log("Found existing Oasis Hubs folder:", existing.guid);
      return existing.guid;
    }

    // Create root folder under "Other Bookmarks"
    const root = await PlacesUtils.bookmarks.insert({
      title: ROOT_FOLDER_NAME,
      type: PlacesUtils.bookmarks.TYPE_FOLDER,
      parentGuid: PlacesUtils.bookmarks.unfiledGuid,
    });
    console.log("Created new Oasis Hubs folder:", root.guid);
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
      children.push({
        guid: bookmark.guid,
        title: bookmark.title,
        type: bookmark.type,
        uri: bookmark.url,
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
      console.log("Listing hubs under root folder:", rootId);
      
      const children = await getBookmarkChildren(rootId);
      console.log("Found children:", children.length, children.map((c: any) => ({ title: c.title, type: c.type, guid: c.guid })));
      
      const { PlacesUtils } = getChrome();
      const folders = children.filter((c: any) => c.type === PlacesUtils?.bookmarks.TYPE_FOLDER);
      console.log("Filtered folders:", folders.length, folders.map((f: any) => f.title));
      
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
      
      // Create the hub folder
      const folder = await createBookmark({
        parentGuid: rootId,
        title: name,
      });

      const include = opts?.include || "none";
      const { gBrowser } = getChrome();
      let count = 0;

      if (gBrowser) {
        if (include === "current") {
          const tab = gBrowser.selectedTab;
          await this.addTabToFolder(folder.guid, tab);
          count = 1;
        } else if (include === "all") {
          for (const t of Array.from(gBrowser.tabs)) {
            await this.addTabToFolder(folder.guid, t as any);
          }
          const items = await getBookmarkChildren(folder.guid);
          count = items.length;
        }
      }

      this.updateAllTabMarkers();
      return { name, count };
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
      const folder = children.find((c: any) => c.type === PlacesUtils?.bookmarks.TYPE_FOLDER && c.title === name);
      
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
      return { name, removed: bookmarks.length };
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
      const folder = children.find((c: any) => c.type === PlacesUtils?.bookmarks.TYPE_FOLDER && c.title === oldName);
      
      if (!folder) return { ok: false };

      // Check if target name already exists
      const existing = children.find((c: any) => c.type === PlacesUtils?.bookmarks.TYPE_FOLDER && c.title === newName);
      if (existing) return { ok: false, msg: "Target exists" };

      await updateBookmark(folder.guid, { title: newName });
      this.updateAllTabMarkers();
      return { ok: true };
    } catch (e) {
      console.error("Failed to rename hub:", e);
      return { ok: false };
    }
  }

  async addCurrentTab(name: string) {
    try {
      const { gBrowser, PlacesUtils } = getChrome();
      if (!gBrowser) return { ok: false, msg: "Browser UI unavailable" };

      const rootId = await this.ensureRootFolder();
      const children = await getBookmarkChildren(rootId);
      const folder = children.find((c: any) => c.type === PlacesUtils?.bookmarks.TYPE_FOLDER && c.title === name);
      
      if (!folder) return { ok: false, msg: "Hub not found" };

      await this.addTabToFolder(folder.guid, gBrowser.selectedTab);
      this.updateAllTabMarkers();
      return { ok: true };
    } catch (e) {
      console.error("Failed to add tab to hub:", e);
      return { ok: false };
    }
  }

  async removeUrl(name: string, url: string) {
    try {
      name = (name || "").trim();
      const rootId = await this.ensureRootFolder();
      const children = await getBookmarkChildren(rootId);
      const { PlacesUtils } = getChrome();
      const folder = children.find((c: any) => c.type === PlacesUtils?.bookmarks.TYPE_FOLDER && c.title === name);
      
      if (!folder) return { ok: false };

      const bookmarks = await getBookmarkChildren(folder.guid);
      const toRemove = bookmarks.filter((b: any) => b.uri === url);
      
      for (const bookmark of toRemove) {
        await removeBookmark(bookmark.guid);
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
      const folder = children.find((c: any) => c.type === PlacesUtils?.bookmarks.TYPE_FOLDER && c.title === name);
      
      if (!folder) return { ok: false };

      const bookmarks = await getBookmarkChildren(folder.guid);
      const items = bookmarks.filter((b: any) => b.uri);

      if (!topWin?.openTrustedLinkIn) return { ok: false };

      if (where === "window") {
        const w = topWin.OpenBrowserWindow();
        setTimeout(() => {
          for (const it of items) (w as any).openTrustedLinkIn(it.uri, "tab");
        }, 250);
      } else {
        for (const it of items) topWin.openTrustedLinkIn(it.uri, "tab");
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