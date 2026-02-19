// Managed bookmark folder system using Firefox Places API.
// Folders live under "Oasis Bookmark Folders" root in Other Bookmarks.

import { localMemory } from "./services/localMemory";

type FxTab = any;

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
  return { topWin, gBrowser, PlacesUtils };
}

type FolderItem = { url: string; title?: string; host: string; id: string };

const ROOT_FOLDER_NAME = "Oasis Hubs";

async function getRootFolder(): Promise<string> {
  const { PlacesUtils } = getChrome();
  if (!PlacesUtils) throw new Error("PlacesUtils not available");

  const bookmarks = await PlacesUtils.bookmarks.search({
    title: ROOT_FOLDER_NAME,
  });
  const existing = bookmarks.find(
    (b: any) =>
      b.type === PlacesUtils.bookmarks.TYPE_FOLDER &&
      b.parentGuid === PlacesUtils.bookmarks.unfiledGuid
  );
  if (existing) return existing.guid;

  const root = await PlacesUtils.bookmarks.insert({
    title: ROOT_FOLDER_NAME,
    type: PlacesUtils.bookmarks.TYPE_FOLDER,
    parentGuid: PlacesUtils.bookmarks.unfiledGuid,
  });
  return root.guid;
}

function hostOf(u: string): string {
  try {
    return new URL(u).host.toLowerCase();
  } catch {
    return "";
  }
}

async function getBookmarkChildren(guid: string): Promise<any[]> {
  const { PlacesUtils } = getChrome();
  if (!PlacesUtils) return [];
  try {
    const parent = await PlacesUtils.bookmarks.fetch(guid);
    if (!parent) return [];

    const children: any[] = [];
    await PlacesUtils.bookmarks.fetch({ parentGuid: guid }, (bookmark: any) => {
      let u = bookmark.url;
      if (u && typeof u === "object") {
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

async function createBookmark(details: {
  parentGuid: string;
  title: string;
  url?: string;
  type?: number;
}): Promise<any> {
  const { PlacesUtils } = getChrome();
  if (!PlacesUtils) throw new Error("PlacesUtils not available");
  return await PlacesUtils.bookmarks.insert({
    parentGuid: details.parentGuid,
    title: details.title,
    url: details.url,
    type:
      details.type ||
      (details.url
        ? PlacesUtils.bookmarks.TYPE_BOOKMARK
        : PlacesUtils.bookmarks.TYPE_FOLDER),
  });
}

async function removeBookmark(guid: string): Promise<void> {
  const { PlacesUtils } = getChrome();
  if (!PlacesUtils) return;
  await PlacesUtils.bookmarks.remove(guid);
}

async function updateBookmark(
  guid: string,
  changes: { title?: string }
): Promise<any> {
  const { PlacesUtils } = getChrome();
  if (!PlacesUtils) throw new Error("PlacesUtils not available");
  return await PlacesUtils.bookmarks.update({ guid, ...changes });
}

export type CreateFolderOpts = { include?: "none" | "current" | "all" };
export type DeleteFolderOpts = { closeTabs?: boolean };

class BookmarkFolderManager {
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
      const folders = children.filter(
        (c: any) => c.type === PlacesUtils?.bookmarks.TYPE_FOLDER
      );

      const result = [];
      for (const folder of folders) {
        const items = await getBookmarkChildren(folder.guid);
        result.push({ name: folder.title || "Untitled", count: items.length });
      }
      return result;
    } catch (e) {
      console.error("Failed to list bookmark folders:", e);
      return [];
    }
  }

  async getAll(): Promise<Array<{ name: string; items: FolderItem[] }>> {
    try {
      const rootId = await this.ensureRootFolder();
      const children = await getBookmarkChildren(rootId);
      const { PlacesUtils } = getChrome();
      const folders = children.filter(
        (c: any) => c.type === PlacesUtils?.bookmarks.TYPE_FOLDER
      );

      const result = [];
      for (const folder of folders) {
        const bookmarks = await getBookmarkChildren(folder.guid);
        const items: FolderItem[] = bookmarks
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
      console.error("Failed to get all bookmark folders:", e);
      return [];
    }
  }

  async create(name: string, opts?: CreateFolderOpts) {
    name = (name || "").trim() || this.suggestName();
    const rootId = await this.ensureRootFolder();

    const children = await getBookmarkChildren(rootId);
    const { PlacesUtils } = getChrome();
    const existing = children.find(
      (c: any) =>
        c.type === PlacesUtils?.bookmarks.TYPE_FOLDER &&
        c.title.toLowerCase() === name.toLowerCase()
    );

    let folder;
    if (existing) {
      folder = existing;
    } else {
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

    return { name: folder.title, count };
  }

  async delete(name: string, opts?: DeleteFolderOpts) {
    name = (name || "").trim();
    const rootId = await this.ensureRootFolder();
    const children = await getBookmarkChildren(rootId);
    const { PlacesUtils } = getChrome();
    const folder = children.find(
      (c: any) =>
        c.type === PlacesUtils?.bookmarks.TYPE_FOLDER &&
        c.title.toLowerCase() === name.toLowerCase()
    );

    if (!folder) return { name, removed: 0 };

    const items = await getBookmarkChildren(folder.guid);
    const bookmarks = items.filter((b: any) => b.uri);

    if (opts?.closeTabs) {
      const { gBrowser } = getChrome();
      if (gBrowser) {
        const hostSet = new Set(bookmarks.map((b: any) => hostOf(b.uri)));
        for (const t of Array.from(gBrowser.tabs) as any[]) {
          const u = t?.linkedBrowser?.currentURI?.spec || "";
          if (hostSet.has(hostOf(u))) {
            try {
              gBrowser.removeTab(t);
            } catch {}
          }
        }
      }
    }

    await removeBookmark(folder.guid);
    return { name: folder.title, removed: bookmarks.length };
  }

  async rename(oldName: string, newName: string) {
    oldName = (oldName || "").trim();
    newName = (newName || "").trim();
    if (!oldName || !newName) return { ok: false };

    const rootId = await this.ensureRootFolder();
    const children = await getBookmarkChildren(rootId);
    const { PlacesUtils } = getChrome();
    const folder = children.find(
      (c: any) =>
        c.type === PlacesUtils?.bookmarks.TYPE_FOLDER &&
        c.title.toLowerCase() === oldName.toLowerCase()
    );

    if (!folder) return { ok: false };

    const existing = children.find(
      (c: any) =>
        c.type === PlacesUtils?.bookmarks.TYPE_FOLDER &&
        c.title.toLowerCase() === newName.toLowerCase()
    );
    if (existing) return { ok: false, msg: "Target exists" };

    await updateBookmark(folder.guid, { title: newName });
    return { ok: true };
  }

  async addTabs(name: string, tabs: FxTab[]) {
    const { PlacesUtils } = getChrome();
    const rootId = await this.ensureRootFolder();
    const children = await getBookmarkChildren(rootId);
    const folder = children.find(
      (c: any) =>
        c.type === PlacesUtils?.bookmarks.TYPE_FOLDER &&
        (c.title || "").toLowerCase() === name.toLowerCase()
    );

    let targetFolder = folder;
    if (!targetFolder) {
      targetFolder = await createBookmark({
        parentGuid: rootId,
        title: name,
      });
    }

    for (const tab of tabs) {
      await this.addTabToFolder(targetFolder.guid, tab, targetFolder.title);
    }

    return { ok: true };
  }

  async removeUrl(name: string, url: string) {
    name = (name || "").trim();
    const rootId = await this.ensureRootFolder();
    const children = await getBookmarkChildren(rootId);
    const { PlacesUtils } = getChrome();

    const folder = children.find(
      (c: any) =>
        c.type === PlacesUtils?.bookmarks.TYPE_FOLDER &&
        c.title.toLowerCase() === name.toLowerCase()
    );

    if (!folder) return { ok: false };

    const bookmarks = await getBookmarkChildren(folder.guid);
    const toRemove = bookmarks.filter((b: any) => b.uri === url);

    for (const bookmark of toRemove) {
      await removeBookmark(bookmark.guid);
    }

    return { ok: toRemove.length > 0 };
  }

  async openFolder(name: string, where: "tabs" | "window" | "tabgroup" = "tabs") {
    name = (name || "").trim();
    const rootId = await this.ensureRootFolder();
    const children = await getBookmarkChildren(rootId);
    const { PlacesUtils, topWin } = getChrome();

    const folder = children.find(
      (c: any) =>
        c.type === PlacesUtils?.bookmarks.TYPE_FOLDER &&
        c.title.toLowerCase() === name.toLowerCase()
    );

    if (!folder) return { ok: false };

    const bookmarks = await getBookmarkChildren(folder.guid);
    const items = bookmarks.filter((b: any) => b.uri);
    const urls = items.map((it: any) => it.uri);

    if (urls.length === 0) return { ok: true };

    let targetBrowser: any;
    if (where === "window") {
      const w = topWin.OpenBrowserWindow();
      await new Promise(resolve => setTimeout(resolve, 250));
      targetBrowser = w.gBrowser;
    } else {
      targetBrowser = getChrome().gBrowser;
    }

    if (!targetBrowser) return { ok: false };

    let Services = (window as any).Services || (window.top as any)?.Services;
    if (!Services && (window as any).ChromeUtils) {
      try {
        Services = (window as any).ChromeUtils.import(
          "resource://gre/modules/Services.jsm"
        ).Services;
      } catch (e) {
        console.error("Failed to import Services", e);
      }
    }
    const triggeringPrincipal =
      Services?.scriptSecurityManager?.getSystemPrincipal();

    const openedTabs: any[] = [];

    for (const url of urls) {
      try {
        const tab = targetBrowser.addTrustedTab(url, {
          triggeringPrincipal,
          relatedToCurrent: false,
        });
        if (tab) openedTabs.push(tab);
      } catch (e) {
        console.error("Failed to open tab for URL:", url, e);
      }
    }

    if (where === "tabgroup" && openedTabs.length > 0) {
      try {
        targetBrowser.addTabGroup(openedTabs, { label: name });
      } catch (e) {
        console.warn("Failed to group opened tabs:", e);
      }
    }

    return { ok: true };
  }

  private async addTabToFolder(
    folderGuid: string,
    tab: FxTab,
    folderName?: string
  ) {
    const url = tab?.linkedBrowser?.currentURI?.spec || "";
    if (!url) return;

    const title =
      tab?.label ||
      tab?.linkedBrowser?.contentTitle ||
      tab?.linkedBrowser?.currentURI?.spec ||
      "";

    const existing = await getBookmarkChildren(folderGuid);
    const alreadyExists = existing.some((b: any) => b.uri === url);
    if (alreadyExists) return;

    await createBookmark({
      parentGuid: folderGuid,
      title,
      url,
    });

    try {
      let content = "";
      try {
        const doc = tab.linkedBrowser?.contentDocument;
        if (doc && doc.body) {
          content = doc.body.innerText.substring(0, 5000);
        }
      } catch (e) {
        console.warn("Failed to extract tab content:", e);
      }

      const text = `Title: ${title}\nURL: ${url}\nContent: ${content}`;
      await localMemory.addDocument(
        text,
        {
          title,
          type: "bookmark_folder_item",
          hub: folderGuid,
          hubName: folderName,
          folderName,
          description: content.substring(0, 200),
        },
        url
      );
    } catch (e) {
      console.error("Failed to index bookmark folder item:", e);
    }
  }

  private suggestName(): string {
    return "Folder 1";
  }
}

export const bookmarkFolders = new BookmarkFolderManager();
