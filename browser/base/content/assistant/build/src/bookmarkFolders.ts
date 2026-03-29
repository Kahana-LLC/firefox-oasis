/**
 * Bookmark folder manager — CRUD operations for managed bookmark folders.
 *
 * Creates/deletes/renames bookmark folders under a root "Oasis Hubs" folder
 * in Firefox's bookmarks system (PlacesUtils). Handles tab-to-bookmark
 * operations, content extraction, and syncs changes to localMemory.
 * Listens for Places events to keep the routing state cache in sync.
 */
import {
  localMemory,
  type BookmarkFolderMemoryEntry,
} from "./services/localMemory.js";
import {
  fetchBookmarkByGuid,
  fetchChildrenBookmarks,
  getChromeContext,
  getSystemPrincipal,
  getTabs,
  normalizeName,
  tabTitle,
  tabUrl,
  toUrlString,
} from "./services/firefoxFacade.js";
import type {
  BrowserTabLike,
  PlacesBookmarkEntry,
  PlacesUtilsLike,
} from "./types/runtime.js";
import { assistantLogger } from "./utils/assistantLogger.js";
import { OASIS_EVENT_BOOKMARK_FOLDERS_CHANGED } from "../../shared/contracts.js";

type FolderItem = { url: string; title?: string; host: string; id: string };
type BookmarkNode = PlacesBookmarkEntry & { uri?: string };
type PlacesEventLike = {
  guid?: string;
  parentGuid?: string;
  oldParentGuid?: string;
};

const ROOT_FOLDER_NAME = "Oasis Hubs";

function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
}

function bookmarkUri(bookmark: PlacesBookmarkEntry): string {
  return toUrlString(bookmark.url) || String(bookmark.uri || "").trim();
}

function isFolderNode(
  places: PlacesUtilsLike | null,
  bookmark: PlacesBookmarkEntry
): boolean {
  return bookmark.type === places?.bookmarks?.TYPE_FOLDER;
}

function isBookmarkNode(
  places: PlacesUtilsLike | null,
  bookmark: PlacesBookmarkEntry
): boolean {
  return bookmark.type === places?.bookmarks?.TYPE_BOOKMARK;
}

async function findRootFolderId(
  places: PlacesUtilsLike | null
): Promise<string | null> {
  if (!places?.bookmarks?.search || !places.bookmarks.unfiledGuid) return null;
  const results = await places.bookmarks.search({ title: ROOT_FOLDER_NAME });
  const existing = results.find(
    bookmark =>
      isFolderNode(places, bookmark) &&
      bookmark.parentGuid === places.bookmarks?.unfiledGuid
  );
  return existing?.guid || null;
}

async function ensureRootFolderId(
  places: PlacesUtilsLike | null
): Promise<string> {
  if (!places?.bookmarks)
    throw new Error("PlacesUtils.bookmarks not available");
  const existing = await findRootFolderId(places);
  if (existing) return existing;
  if (!places.bookmarks.insert)
    throw new Error("Bookmarks insert API not available");

  const root = await places.bookmarks.insert({
    title: ROOT_FOLDER_NAME,
    type: places.bookmarks.TYPE_FOLDER,
    parentGuid: places.bookmarks.unfiledGuid,
  });
  return root.guid;
}

async function getBookmarkChildren(
  places: PlacesUtilsLike | null,
  guid: string
): Promise<BookmarkNode[]> {
  if (!places?.bookmarks?.fetch || !guid) return [];
  const parent = await fetchBookmarkByGuid(places, guid);
  if (!parent) return [];

  const children = await fetchChildrenBookmarks(places, guid);
  return children.map(child => ({
    ...child,
    uri: bookmarkUri(child),
  }));
}

async function createBookmark(
  places: PlacesUtilsLike | null,
  details: {
    parentGuid: string;
    title: string;
    url?: string;
    type?: number;
  }
): Promise<BookmarkNode> {
  if (!places?.bookmarks?.insert)
    throw new Error("Bookmarks insert API not available");
  const created = await places.bookmarks.insert({
    parentGuid: details.parentGuid,
    title: details.title,
    url: details.url,
    type:
      details.type ||
      (details.url
        ? places.bookmarks.TYPE_BOOKMARK
        : places.bookmarks.TYPE_FOLDER),
  });
  return { ...created, uri: bookmarkUri(created) };
}

async function removeBookmark(
  places: PlacesUtilsLike | null,
  guid: string
): Promise<void> {
  if (!places?.bookmarks?.remove) return;
  await places.bookmarks.remove(guid);
}

async function updateBookmark(
  places: PlacesUtilsLike | null,
  guid: string,
  changes: { title?: string }
): Promise<BookmarkNode> {
  if (!places?.bookmarks?.update)
    throw new Error("Bookmarks update API not available");
  const updated = await places.bookmarks.update({ guid, ...changes });
  return { ...updated, uri: bookmarkUri(updated) };
}

export type CreateFolderOpts = { include?: "none" | "current" | "all" };
export type DeleteFolderOpts = { closeTabs?: boolean };

class BookmarkFolderManager {
  private rootFolderId: string | null = null;
  private placesObserverRegistered = false;
  private managedFolderGuids = new Set<string>();
  private syncTimer: number | null = null;
  private syncInFlight = false;

  constructor() {
    this.ensurePlacesObserver();
    this.scheduleManagedFolderSync("startup");
  }

  private emitFoldersChanged(folderNames: string[] = []): void {
    try {
      window.dispatchEvent(
        new CustomEvent(OASIS_EVENT_BOOKMARK_FOLDERS_CHANGED, {
          detail: { folderNames },
        })
      );
    } catch (error) {
      assistantLogger.warn(
        "bookmark-folders",
        "failed to emit folder change event",
        error
      );
    }
  }

  private ensurePlacesObserver(): void {
    if (this.placesObserverRegistered) return;
    const { PlacesUtils } = getChromeContext();
    if (!PlacesUtils?.observers?.addListener) return;

    PlacesUtils.observers.addListener(
      [
        "bookmark-added",
        "bookmark-removed",
        "bookmark-moved",
        "bookmark-title-changed",
        "bookmark-url-changed",
      ],
      this.handlePlacesEvents
    );
    this.placesObserverRegistered = true;
  }

  private handlePlacesEvents = async (events: unknown[]): Promise<void> => {
    try {
      const rootId = await this.ensureExistingRootFolder();
      if (!rootId) return;

      let isRelevant = false;
      for (const rawEvent of events || []) {
        const event = (rawEvent || {}) as PlacesEventLike;
        const guid = String(event.guid || "");
        const parentGuid = String(event.parentGuid || "");
        const oldParentGuid = String(event.oldParentGuid || "");
        if (
          guid === rootId ||
          parentGuid === rootId ||
          oldParentGuid === rootId ||
          this.managedFolderGuids.has(guid) ||
          this.managedFolderGuids.has(parentGuid) ||
          this.managedFolderGuids.has(oldParentGuid)
        ) {
          isRelevant = true;
          break;
        }
      }

      if (!isRelevant) return;
      this.scheduleManagedFolderSync("places-event");
    } catch (error) {
      assistantLogger.warn(
        "bookmark-folders",
        "places event processing failed",
        error
      );
    }
  };

  private scheduleManagedFolderSync(reason: string): void {
    this.ensurePlacesObserver();
    if (this.syncTimer != null) return;
    this.syncTimer = window.setTimeout(() => {
      this.syncTimer = null;
      void this.syncManagedFolderMemoryFromBookmarks(reason);
    }, 250);
  }

  private async ensureRootFolder(): Promise<string> {
    this.ensurePlacesObserver();
    if (this.rootFolderId) return this.rootFolderId;
    const { PlacesUtils } = getChromeContext();
    this.rootFolderId = await ensureRootFolderId(PlacesUtils);
    return this.rootFolderId;
  }

  private async ensureExistingRootFolder(): Promise<string | null> {
    this.ensurePlacesObserver();
    const { PlacesUtils } = getChromeContext();
    if (!PlacesUtils?.bookmarks?.fetch) {
      this.rootFolderId = null;
      return null;
    }

    if (this.rootFolderId) {
      const existing = await fetchBookmarkByGuid(
        PlacesUtils,
        this.rootFolderId
      );
      if (existing) return this.rootFolderId;
      this.rootFolderId = null;
    }

    const rootId = await findRootFolderId(PlacesUtils);
    if (rootId) this.rootFolderId = rootId;
    return rootId;
  }

  private async getFolderNodes(rootId: string): Promise<BookmarkNode[]> {
    const { PlacesUtils } = getChromeContext();
    const children = await getBookmarkChildren(PlacesUtils, rootId);
    return children.filter(child => isFolderNode(PlacesUtils, child));
  }

  private async findFolderNode(
    rootId: string,
    name: string
  ): Promise<BookmarkNode | null> {
    const target = normalizeName(name);
    if (!target) return null;
    const folders = await this.getFolderNodes(rootId);
    return (
      folders.find(folder => normalizeName(folder.title || "") === target) ||
      null
    );
  }

  private async collectFolders(
    rootId: string
  ): Promise<Array<{ name: string; items: FolderItem[] }>> {
    const { PlacesUtils } = getChromeContext();
    const folders = await this.getFolderNodes(rootId);
    const result: Array<{ name: string; items: FolderItem[] }> = [];

    for (const folder of folders) {
      const bookmarks = await getBookmarkChildren(PlacesUtils, folder.guid);
      const items: FolderItem[] = bookmarks
        .filter(bookmark => !!bookmark.uri)
        .map(bookmark => ({
          id: bookmark.guid,
          url: String(bookmark.uri),
          title: bookmark.title,
          host: hostOf(String(bookmark.uri)),
        }));
      result.push({ name: folder.title || "Untitled", items });
    }

    return result;
  }

  private async syncManagedFolderMemoryFromBookmarks(
    reason: string
  ): Promise<void> {
    if (this.syncInFlight) return;
    this.syncInFlight = true;
    try {
      const { PlacesUtils } = getChromeContext();
      const rootId = await this.ensureExistingRootFolder();
      if (!rootId) {
        this.managedFolderGuids.clear();
        const removed = await localMemory.removeAllBookmarkFolderDocuments();
        if (removed > 0) {
          assistantLogger.debug(
            "bookmark-folders",
            `managed folder root missing; removed ${removed} memory docs`
          );
        }
        this.emitFoldersChanged([]);
        return;
      }

      const folders = await this.getFolderNodes(rootId);
      this.managedFolderGuids = new Set(folders.map(folder => folder.guid));

      const folderNames: string[] = [];
      const entries: BookmarkFolderMemoryEntry[] = [];

      for (const folder of folders) {
        const folderName = folder.title || "Untitled";
        folderNames.push(folderName);
        const bookmarks = await getBookmarkChildren(PlacesUtils, folder.guid);
        for (const bookmark of bookmarks) {
          if (!bookmark.uri || !isBookmarkNode(PlacesUtils, bookmark)) continue;
          entries.push({
            bookmarkGuid: bookmark.guid,
            parentGuid: folder.guid,
            folderName,
            title: bookmark.title || bookmark.uri,
            url: bookmark.uri,
          });
        }
      }

      const syncResult = await localMemory.syncBookmarkFolderDocuments(entries);
      this.emitFoldersChanged(folderNames);
      assistantLogger.debug(
        "bookmark-folders",
        `sync complete reason=${reason} folders=${folderNames.length} added=${syncResult.added} updated=${syncResult.updated} removed=${syncResult.removed}`
      );
    } catch (error) {
      assistantLogger.warn(
        "bookmark-folders",
        "managed folder sync failed",
        error
      );
    } finally {
      this.syncInFlight = false;
    }
  }

  async list(): Promise<Array<{ name: string; count: number }>> {
    try {
      const { PlacesUtils } = getChromeContext();
      const rootId = await this.ensureRootFolder();
      const folders = await this.getFolderNodes(rootId);
      const result: Array<{ name: string; count: number }> = [];

      for (const folder of folders) {
        const items = await getBookmarkChildren(PlacesUtils, folder.guid);
        result.push({ name: folder.title || "Untitled", count: items.length });
      }
      return result;
    } catch (error) {
      assistantLogger.error(
        "bookmark-folders",
        "Failed to list bookmark folders",
        error
      );
      return [];
    }
  }

  async getAll(): Promise<Array<{ name: string; items: FolderItem[] }>> {
    try {
      const rootId = await this.ensureRootFolder();
      return await this.collectFolders(rootId);
    } catch (error) {
      assistantLogger.error(
        "bookmark-folders",
        "Failed to get all bookmark folders",
        error
      );
      return [];
    }
  }

  async getAllReadOnly(): Promise<{
    ok: boolean;
    folders: Array<{ name: string; items: FolderItem[] }>;
  }> {
    try {
      const rootId = await this.ensureExistingRootFolder();
      if (!rootId) return { ok: true, folders: [] };
      const folders = await this.collectFolders(rootId);
      return { ok: true, folders };
    } catch (error) {
      assistantLogger.warn(
        "bookmark-folders",
        "read-only folder lookup failed",
        error
      );
      return { ok: false, folders: [] };
    }
  }

  async create(
    name: string,
    opts?: CreateFolderOpts
  ): Promise<{ name: string; count: number }> {
    const context = getChromeContext();
    const places = context.PlacesUtils;
    const normalizedName = (name || "").trim() || this.suggestName();
    const rootId = await this.ensureRootFolder();
    let folder = await this.findFolderNode(rootId, normalizedName);

    if (!folder) {
      folder = await createBookmark(places, {
        parentGuid: rootId,
        title: normalizedName,
      });
    }

    const include = opts?.include || "none";
    const tabs = getTabs(context.gBrowser);
    let count = 0;

    if (include === "current" && tabs.length > 0) {
      const current = context.gBrowser?.selectedTab || tabs[0];
      if (current) {
        await this.addTabs(folder.title || normalizedName, [current]);
        count = 1;
      }
    } else if (include === "all" && tabs.length > 0) {
      await this.addTabs(folder.title || normalizedName, tabs);
      count = tabs.length;
    }

    this.scheduleManagedFolderSync("create-folder");
    return { name: folder.title || normalizedName, count };
  }

  async delete(
    name: string,
    opts?: DeleteFolderOpts
  ): Promise<{ name: string; removed: number }> {
    const context = getChromeContext();
    const rootId = await this.ensureRootFolder();
    const folder = await this.findFolderNode(rootId, name);
    if (!folder) return { name, removed: 0 };

    const items = await getBookmarkChildren(context.PlacesUtils, folder.guid);
    const bookmarks = items.filter(bookmark => !!bookmark.uri);

    if (opts?.closeTabs) {
      const hostSet = new Set(
        bookmarks.map(bookmark => hostOf(String(bookmark.uri)))
      );
      for (const tab of getTabs(context.gBrowser)) {
        if (hostSet.has(hostOf(tabUrl(tab)))) {
          context.gBrowser?.removeTab?.(tab);
        }
      }
    }

    await removeBookmark(context.PlacesUtils, folder.guid);
    await localMemory.removeBookmarkFolderDocuments(folder.title || name);
    this.scheduleManagedFolderSync("delete-folder");
    return { name: folder.title || name, removed: bookmarks.length };
  }

  async rename(
    oldName: string,
    newName: string
  ): Promise<{ ok: boolean; msg?: string }> {
    const normalizedOld = (oldName || "").trim();
    const normalizedNew = (newName || "").trim();
    if (!normalizedOld || !normalizedNew) return { ok: false };

    const context = getChromeContext();
    const rootId = await this.ensureRootFolder();
    const folder = await this.findFolderNode(rootId, normalizedOld);
    if (!folder) return { ok: false };

    const existing = await this.findFolderNode(rootId, normalizedNew);
    if (existing) return { ok: false, msg: "Target exists" };

    await updateBookmark(context.PlacesUtils, folder.guid, {
      title: normalizedNew,
    });
    await localMemory.renameBookmarkFolderDocuments(
      folder.title || normalizedOld,
      normalizedNew
    );
    this.scheduleManagedFolderSync("rename-folder");
    return { ok: true };
  }

  async addTabs(
    name: string,
    tabs: BrowserTabLike[]
  ): Promise<{ ok: boolean }> {
    const context = getChromeContext();
    const rootId = await this.ensureRootFolder();
    let folder = await this.findFolderNode(rootId, name);

    if (!folder) {
      folder = await createBookmark(context.PlacesUtils, {
        parentGuid: rootId,
        title: name,
      });
    }

    for (const tab of tabs) {
      await this.addTabToFolder(folder.guid, tab, folder.title || name);
    }

    this.scheduleManagedFolderSync("add-tabs");
    return { ok: true };
  }

  async removeUrl(name: string, url: string): Promise<{ ok: boolean }> {
    const normalizedName = (name || "").trim();
    const rootId = await this.ensureRootFolder();
    const folder = await this.findFolderNode(rootId, normalizedName);
    if (!folder) return { ok: false };

    const bookmarks = await getBookmarkChildren(
      getChromeContext().PlacesUtils,
      folder.guid
    );
    const toRemove = bookmarks.filter(bookmark => bookmark.uri === url);
    for (const bookmark of toRemove) {
      await removeBookmark(getChromeContext().PlacesUtils, bookmark.guid);
    }

    if (toRemove.length > 0) {
      await localMemory.removeBookmarkFolderDocumentByUrl(
        folder.title || normalizedName,
        url
      );
      this.scheduleManagedFolderSync("remove-url");
    }

    return { ok: toRemove.length > 0 };
  }

  async openFolder(
    name: string,
    where: "tabs" | "window" | "tabgroup" = "tabs"
  ): Promise<{ ok: boolean }> {
    const normalizedName = (name || "").trim();
    const context = getChromeContext();
    const rootId = await this.ensureRootFolder();
    const folder = await this.findFolderNode(rootId, normalizedName);
    if (!folder) return { ok: false };

    const bookmarks = await getBookmarkChildren(
      context.PlacesUtils,
      folder.guid
    );
    const urls = bookmarks
      .filter(bookmark => !!bookmark.uri)
      .map(bookmark => String(bookmark.uri));
    if (urls.length === 0) return { ok: true };

    let targetBrowser = context.gBrowser;
    if (where === "window") {
      const newWindow = context.topWin?.OpenBrowserWindow?.();
      if (!newWindow) return { ok: false };
      await new Promise(resolve => setTimeout(resolve, 250));
      targetBrowser = newWindow.gBrowser || null;
    }

    if (!targetBrowser?.addTrustedTab) return { ok: false };
    const principal = getSystemPrincipal(context.Services);
    const openedTabs: BrowserTabLike[] = [];

    for (const url of urls) {
      try {
        const tab = targetBrowser.addTrustedTab(url, {
          triggeringPrincipal: principal,
          relatedToCurrent: false,
        });
        if (tab) openedTabs.push(tab);
      } catch (error) {
        assistantLogger.error(
          "bookmark-folders",
          `Failed to open tab for URL: ${url}`,
          error
        );
      }
    }

    if (where === "tabgroup" && openedTabs.length > 0) {
      try {
        targetBrowser.addTabGroup?.(openedTabs, { label: normalizedName });
      } catch (error) {
        assistantLogger.warn(
          "bookmark-folders",
          "Failed to group opened tabs",
          error
        );
      }
    }

    return { ok: true };
  }

  private async addTabToFolder(
    folderGuid: string,
    tab: BrowserTabLike,
    folderName?: string
  ): Promise<void> {
    const url = tabUrl(tab);
    if (!url) return;

    const title = tabTitle(tab);
    const context = getChromeContext();
    const existing = await getBookmarkChildren(context.PlacesUtils, folderGuid);
    const alreadyExists = existing.some(bookmark => bookmark.uri === url);
    if (alreadyExists) return;

    const createdBookmark = await createBookmark(context.PlacesUtils, {
      parentGuid: folderGuid,
      title,
      url,
    });

    let content = "";
    try {
      const bodyText =
        tab.linkedBrowser?.contentDocument?.body?.innerText || "";
      content = String(bodyText).substring(0, 5000);
    } catch (error) {
      assistantLogger.warn(
        "bookmark-folders",
        "Failed to extract tab content",
        error
      );
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
        url,
        bookmarkGuid: createdBookmark.guid,
        parentGuid: folderGuid,
        description: content.substring(0, 200),
      },
      url
    );
  }

  private suggestName(): string {
    return "Folder 1";
  }
}

export const bookmarkFolders = new BookmarkFolderManager();
