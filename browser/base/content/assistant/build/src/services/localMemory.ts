/**
 * Local memory — full-text search engine (MiniSearch + IndexedDB).
 *
 * Indexes open tabs, tab groups, bookmarks, browsing history, and
 * managed bookmark folders into a searchable local database. Supports
 * fuzzy matching, prefix search, and title boosting. Deduplicates
 * entries via computed dedupe keys.
 *
 * Auto-indexes on startup: tab groups, bookmarks, then history (5s delay).
 * Used by the search_memory and related commands.
 */
import { openDB, DBSchema, IDBPDatabase } from "idb";
import MiniSearch, { type SearchResult } from "minisearch";
import {
  computeMemoryDedupeKey,
  getMemoryDocFolderName,
  getMemoryDocSource,
  getMemoryDocUrl,
  type MemoryMetadata,
  normalizeMemoryName,
} from "../utils/localMemoryUtils.js";
import {
  getBrowserWindow,
  type BrowserUriLike,
  type BrowserTabLike,
  type BrowserTabGroupLike,
  type PlacesUtilsLike,
} from "../types/runtime.js";
import { assistantLogger } from "../utils/assistantLogger.js";

function getChrome() {
  const topWin = getBrowserWindow();
  const gBrowser = topWin?.gBrowser;
  const PlacesUtils = topWin?.PlacesUtils;
  return { topWin, gBrowser, PlacesUtils };
}

function toUrlString(value: string | BrowserUriLike | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  const fromSpec = String(value.spec || "").trim();
  if (fromSpec) return fromSpec;
  const fromHref = String(value.href || "").trim();
  if (fromHref) return fromHref;
  return String(value.toString?.() || "").trim();
}

const logDebug = (message: unknown, ...meta: unknown[]): void => {
  assistantLogger.debug(
    "local-memory",
    String(message ?? ""),
    meta.length === 0 ? undefined : meta.length === 1 ? meta[0] : meta
  );
};

const logWarn = (message: unknown, ...meta: unknown[]): void => {
  assistantLogger.warn(
    "local-memory",
    String(message ?? ""),
    meta.length === 0 ? undefined : meta.length === 1 ? meta[0] : meta
  );
};

const logError = (message: unknown, ...meta: unknown[]): void => {
  assistantLogger.error(
    "local-memory",
    String(message ?? ""),
    meta.length === 0 ? undefined : meta.length === 1 ? meta[0] : meta
  );
};

// Full-text search using MiniSearch.

interface MemoryDoc {
  id?: number;
  text: string;
  tokens: string[];
  metadata: MemoryMetadata;
  timestamp: number;
  url?: string;
  dedupeKey?: string;
}

type SearchIndexedDoc = {
  id: number;
  text: string;
  metadata: MemoryMetadata;
  url?: string;
  timestamp: number;
  dedupeKey?: string;
  title?: string;
  description?: string;
};

export type BookmarkFolderMemoryEntry = {
  bookmarkGuid: string;
  parentGuid: string;
  folderName: string;
  title: string;
  url: string;
  description?: string;
};

const OASIS_MANAGED_BOOKMARK_ROOT = "Oasis Hubs";

interface MemoryDB extends DBSchema {
  documents: {
    key: number;
    value: MemoryDoc;
    indexes: {
      "by-timestamp": number;
      "by-url": string;
      "by-dedupe-key": string;
    };
  };
  usage: {
    key: string;
    value: { userId: string; count: number; timestamp: number };
  };
}

class LocalMemoryService {
  private dbPromise: Promise<IDBPDatabase<MemoryDB>>;
  private miniSearch: MiniSearch<SearchIndexedDoc>;
  private isIndexDirty: boolean = true;

  constructor() {
    this.dbPromise = openDB<MemoryDB>("oasis-memory", 3, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          const store = db.createObjectStore("documents", {
            keyPath: "id",
            autoIncrement: true,
          });
          store.createIndex("by-timestamp", "timestamp");
          store.createIndex("by-url", "url", { unique: false });
        }
        if (oldVersion < 2) {
          db.createObjectStore("usage", { keyPath: "userId" });
        }
        if (oldVersion < 3) {
          const docsStore = transaction.objectStore("documents");
          if (!docsStore.indexNames.contains("by-dedupe-key")) {
            docsStore.createIndex("by-dedupe-key", "dedupeKey", {
              unique: true,
            });
          }
        }
      },
    });

    this.miniSearch = new MiniSearch<SearchIndexedDoc>({
      fields: ["text", "title", "description"],
      storeFields: ["text", "metadata", "url", "timestamp", "dedupeKey"],
      extractField: (doc, fieldName) => {
        if (fieldName === "title") return doc.metadata?.title;
        if (fieldName === "description") return doc.metadata?.description;
        return doc[fieldName as keyof SearchIndexedDoc];
      },
      tokenize: text => this.tokenize(text),
      searchOptions: {
        boost: { title: 2 },
        fuzzy: 0.2,
        prefix: true,
        tokenize: text => this.tokenize(text),
      },
    });

    this.backfillDedupeKeys()
      .then(() => this.ensureIndex())
      .then(() => {
        setTimeout(() => this.indexAll(), 5000);
      })
      .catch(error => {
        logError("[LocalMemory] initialization failed", error);
      });
  }

  // Simple tokenizer: lowercase, replace punctuation with spaces, split by whitespace
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ") // Replace punctuation with space to preserve words
      .split(/\s+/)
      .filter(t => t.length > 2); // Ignore tiny words
  }

  private async backfillDedupeKeys(): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction("documents", "readwrite");
    const store = tx.store;
    const winners = new Map<string, { id: number; timestamp: number }>();
    let cursor = await store.openCursor();
    let updated = 0;
    let removed = 0;

    while (cursor) {
      const id = Number(cursor.primaryKey);
      const doc = cursor.value as MemoryDoc;
      const dedupeKey = computeMemoryDedupeKey(doc);
      const timestamp = Number(doc.timestamp || 0);
      const winner = winners.get(dedupeKey);

      if (winner) {
        if (timestamp > winner.timestamp) {
          await store.delete(winner.id);
          winners.set(dedupeKey, { id, timestamp });
          if (doc.dedupeKey !== dedupeKey) {
            await cursor.update({ ...doc, dedupeKey });
            updated++;
          }
        } else {
          await cursor.delete();
        }
        removed++;
        cursor = await cursor.continue();
        continue;
      }

      winners.set(dedupeKey, { id, timestamp });
      if (doc.dedupeKey !== dedupeKey) {
        await cursor.update({ ...doc, dedupeKey });
        updated++;
      }
      cursor = await cursor.continue();
    }

    await tx.done;
    if (updated > 0 || removed > 0) {
      this.isIndexDirty = true;
      logDebug(
        `[LocalMemory] dedupe backfill updated=${updated} removed_duplicates=${removed}`
      );
    }
  }

  private async upsertDocumentByDedupeKey(
    doc: MemoryDoc
  ): Promise<"inserted" | "updated"> {
    const db = await this.dbPromise;
    const tx = db.transaction("documents", "readwrite");
    const docsStore = tx.store;
    const index = docsStore.index("by-dedupe-key");
    const existing = doc.dedupeKey ? await index.get(doc.dedupeKey) : null;

    if (existing?.id != null) {
      await docsStore.put({ ...doc, id: existing.id });
      await tx.done;
      return "updated";
    }

    await docsStore.add(doc);
    await tx.done;
    return "inserted";
  }

  private async mutateDocuments(
    mutator: (doc: MemoryDoc) => MemoryDoc | null
  ): Promise<number> {
    const db = await this.dbPromise;
    const tx = db.transaction("documents", "readwrite");
    let cursor = await tx.store.openCursor();
    let changed = 0;

    while (cursor) {
      const doc = cursor.value as MemoryDoc;
      const nextDoc = mutator(doc);
      if (nextDoc === null) {
        await cursor.delete();
        changed++;
      } else if (nextDoc !== doc) {
        await cursor.update(nextDoc);
        changed++;
      }
      cursor = await cursor.continue();
    }

    await tx.done;
    if (changed > 0) {
      this.isIndexDirty = true;
    }
    return changed;
  }

  private async ensureIndex() {
    if (!this.isIndexDirty) return;

    const db = await this.dbPromise;
    const docs = await db.getAll("documents");

    this.miniSearch.removeAll();
    if (docs.length > 0) {
      this.miniSearch.addAll(
        docs.map(d => ({
          id: d.id!,
          text: d.text,
          metadata: d.metadata,
          url: d.url,
          timestamp: d.timestamp,
          dedupeKey: d.dedupeKey,
        }))
      );
    }

    this.isIndexDirty = false;
    logDebug(`[LocalMemory] Index rebuilt with ${docs.length} documents`);
  }

  async addDocument(text: string, metadata: MemoryMetadata = {}, url?: string) {
    const tokens = this.tokenize(text);

    const doc: MemoryDoc = {
      text,
      tokens,
      metadata,
      timestamp: Date.now(),
      url,
      dedupeKey: computeMemoryDedupeKey({ text, metadata, url }),
    };

    const upsertResult = await this.upsertDocumentByDedupeKey(doc);
    this.isIndexDirty = true;
    if (upsertResult === "updated") {
      logDebug(
        `[LocalMemory] dedupe hit source=${getMemoryDocSource(doc)} key=${doc.dedupeKey}`
      );
    }
  }

  async removeDocumentByUrl(url: string) {
    const db = await this.dbPromise;
    const tx = db.transaction("documents", "readwrite");
    const index = tx.store.index("by-url");
    let cursor = await index.openCursor(url);

    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
    this.isIndexDirty = true;
    logDebug(`Removed documents for URL: ${url}`);
  }

  async removeBookmarkFolderDocuments(folderName: string): Promise<number> {
    const targetFolder = normalizeMemoryName(folderName);
    if (!targetFolder) return 0;
    const removed = await this.mutateDocuments(doc => {
      if (getMemoryDocSource(doc) !== "bookmark-folder") return doc;
      if (getMemoryDocFolderName(doc) !== targetFolder) return doc;
      return null;
    });
    if (removed > 0) {
      logDebug(
        `[LocalMemory] Removed ${removed} documents for folder: ${folderName}`
      );
    }
    return removed;
  }

  async removeAllBookmarkFolderDocuments(): Promise<number> {
    const removed = await this.mutateDocuments(doc => {
      if (getMemoryDocSource(doc) !== "bookmark-folder") return doc;
      return null;
    });
    if (removed > 0) {
      logDebug(
        `[LocalMemory] Removed all bookmark-folder documents: ${removed}`
      );
    }
    return removed;
  }

  async removeBookmarkFolderDocumentByUrl(
    folderName: string,
    url: string
  ): Promise<number> {
    const targetFolder = normalizeMemoryName(folderName);
    if (!targetFolder || !url) return 0;
    const removed = await this.mutateDocuments(doc => {
      if (getMemoryDocSource(doc) !== "bookmark-folder") return doc;
      if (getMemoryDocFolderName(doc) !== targetFolder) return doc;
      const docUrl = getMemoryDocUrl(doc);
      if (docUrl !== url) return doc;
      return null;
    });
    if (removed > 0) {
      logDebug(
        `[LocalMemory] Removed ${removed} folder documents for URL: ${url}`
      );
    }
    return removed;
  }

  async renameBookmarkFolderDocuments(
    oldName: string,
    newName: string
  ): Promise<number> {
    const from = normalizeMemoryName(oldName);
    const to = (newName || "").trim();
    const toNorm = normalizeMemoryName(newName);
    if (!from || !toNorm) return 0;

    const updated = await this.mutateDocuments(doc => {
      if (getMemoryDocSource(doc) !== "bookmark-folder") return doc;
      if (getMemoryDocFolderName(doc) !== from) return doc;
      const metadata = { ...(doc.metadata || {}) };
      metadata.folderName = to;
      metadata.hubName = to;
      if (
        typeof metadata.context === "string" &&
        metadata.context.toLowerCase().startsWith("bookmark folder:")
      ) {
        metadata.context = `Bookmark Folder: ${to}`;
      }
      return {
        ...doc,
        metadata,
        dedupeKey: computeMemoryDedupeKey({ ...doc, metadata }),
      };
    });
    if (updated > 0) {
      logDebug(
        `[LocalMemory] Renamed ${updated} folder documents: ${oldName} -> ${newName}`
      );
    }
    return updated;
  }

  async syncBookmarkFolderDocuments(
    entries: BookmarkFolderMemoryEntry[]
  ): Promise<{ added: number; updated: number; removed: number }> {
    const byGuid = new Map<string, BookmarkFolderMemoryEntry>();
    for (const entry of entries) {
      const guid = String(entry.bookmarkGuid || "").trim();
      const url = String(entry.url || "").trim();
      const folderName = String(entry.folderName || "").trim();
      if (!guid || !url || !folderName) continue;
      byGuid.set(guid, { ...entry, bookmarkGuid: guid, url, folderName });
    }

    const seen = new Set<string>();
    let updated = 0;
    let removed = 0;

    await this.mutateDocuments(doc => {
      if (getMemoryDocSource(doc) !== "bookmark-folder") return doc;

      const bookmarkGuid = String(doc.metadata?.bookmarkGuid || "").trim();
      if (!bookmarkGuid) {
        removed++;
        return null;
      }

      const nextEntry = byGuid.get(bookmarkGuid);
      if (!nextEntry) {
        removed++;
        return null;
      }
      seen.add(bookmarkGuid);

      const previousMetadata = doc.metadata || {};
      const nextMetadata = {
        ...previousMetadata,
        type: "bookmark_folder_item",
        title: nextEntry.title,
        url: nextEntry.url,
        hub: nextEntry.parentGuid,
        hubName: nextEntry.folderName,
        folderName: nextEntry.folderName,
        bookmarkGuid: nextEntry.bookmarkGuid,
        parentGuid: nextEntry.parentGuid,
        context: `Bookmark Folder: ${nextEntry.folderName}`,
        description:
          nextEntry.description ?? previousMetadata.description ?? "",
      };
      const nextText = `Title: ${nextEntry.title}\nURL: ${nextEntry.url}\nContent: ${nextMetadata.description || ""}`;
      const nextDoc: MemoryDoc = {
        ...doc,
        text: nextText,
        metadata: nextMetadata,
        url: nextEntry.url,
        dedupeKey: computeMemoryDedupeKey({
          text: nextText,
          metadata: nextMetadata,
          url: nextEntry.url,
        }),
      };

      const unchanged =
        doc.text === nextDoc.text &&
        doc.url === nextDoc.url &&
        doc.metadata?.title === nextMetadata.title &&
        doc.metadata?.folderName === nextMetadata.folderName &&
        doc.metadata?.bookmarkGuid === nextMetadata.bookmarkGuid &&
        doc.metadata?.parentGuid === nextMetadata.parentGuid;
      if (unchanged) return doc;
      updated++;
      return nextDoc;
    });

    let added = 0;
    for (const entry of byGuid.values()) {
      if (seen.has(entry.bookmarkGuid)) continue;
      const text = `Title: ${entry.title}\nURL: ${entry.url}\nContent: ${entry.description || ""}`;
      await this.addDocument(
        text,
        {
          type: "bookmark_folder_item",
          title: entry.title,
          url: entry.url,
          hub: entry.parentGuid,
          hubName: entry.folderName,
          folderName: entry.folderName,
          bookmarkGuid: entry.bookmarkGuid,
          parentGuid: entry.parentGuid,
          context: `Bookmark Folder: ${entry.folderName}`,
          description: entry.description || "",
        },
        entry.url
      );
      added++;
    }

    if (added > 0 || updated > 0 || removed > 0) {
      logDebug(
        `[LocalMemory] bookmark-folder sync added=${added} updated=${updated} removed=${removed}`
      );
    }
    return { added, updated, removed };
  }

  private async removeStaleBookmarkSourceDocuments(
    validDedupeKeys: Set<string>
  ): Promise<number> {
    const removed = await this.mutateDocuments(doc => {
      if (getMemoryDocSource(doc) !== "bookmark") return doc;
      const key = String(doc.dedupeKey || computeMemoryDedupeKey(doc));
      if (validDedupeKeys.has(key)) return doc;
      return null;
    });
    if (removed > 0) {
      logDebug(
        `[LocalMemory] Removed stale bookmark-source documents: ${removed}`
      );
    }
    return removed;
  }

  private async removeStaleLiveSourceDocuments(
    validDedupeKeys: Set<string>
  ): Promise<number> {
    const removed = await this.mutateDocuments(doc => {
      const source = getMemoryDocSource(doc);
      if (source !== "tab" && source !== "tab-group") return doc;
      const key = String(doc.dedupeKey || computeMemoryDedupeKey(doc));
      if (validDedupeKeys.has(key)) return doc;
      return null;
    });
    if (removed > 0) {
      logDebug(
        `[LocalMemory] Removed stale live tab/tab-group documents: ${removed}`
      );
    }
    return removed;
  }

  async search(
    query: string,
    limit = 5,
    filter?: { hub?: string; folder?: string }
  ): Promise<
    { text: string; score: number; metadata: MemoryMetadata; url?: string }[]
  > {
    await this.ensureIndex();

    const folderFilter = filter?.folder || filter?.hub;
    const results = this.miniSearch.search(query, {
      filter: result => {
        if (folderFilter) {
          const name = normalizeMemoryName(
            String(
              result.metadata?.folderName || result.metadata?.hubName || ""
            )
          );
          return name === normalizeMemoryName(folderFilter);
        }
        return true;
      },
    });

    // Deduplicate results by URL
    const seenKeys = new Set<string>();
    const uniqueResults: Array<SearchResult & Partial<SearchIndexedDoc>> = [];

    for (const r of results) {
      const stored = r as SearchResult & Partial<SearchIndexedDoc>;
      const metadata = (stored.metadata || {}) as MemoryMetadata;
      const key = String(
        stored.dedupeKey ||
          computeMemoryDedupeKey({
            text: stored.text || "",
            url: stored.url,
            metadata,
          })
      );
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      uniqueResults.push(stored);
      if (uniqueResults.length >= limit) break;
    }

    return uniqueResults.map(r => ({
      text: r.text || "",
      score: r.score,
      metadata: (r.metadata || {}) as MemoryMetadata,
      url: r.url,
    }));
  }
  async getUsage(userId: string): Promise<number> {
    const db = await this.dbPromise;
    const record = await db.get("usage", userId);
    return record?.count || 0;
  }

  async saveUsage(userId: string, count: number) {
    const db = await this.dbPromise;
    await db.put("usage", { userId, count, timestamp: Date.now() });
    logDebug(`[LocalMemory] Saved usage for ${userId}: ${count}`);
  }

  // --- Indexing from Browser ---

  async indexHistory(maxItems = 1000) {
    const win = window as Window & { PlacesUtils?: PlacesUtilsLike };
    const PlacesUtils = win.PlacesUtils || getChrome().PlacesUtils;
    if (!PlacesUtils?.history) return;

    try {
      const options = PlacesUtils.history.getNewQueryOptions();
      options.sortingMode = options.SORT_BY_DATE_DESCENDING;
      options.maxResults = maxItems;
      options.includeVisits = true;

      const query = PlacesUtils.history.getNewQuery();
      const result = PlacesUtils.history.executeQuery(query, options);
      const root = result.root;
      root.containerOpen = true;

      for (let i = 0; i < root.childCount; i++) {
        const node = root.getChild(i);
        if (node.uri) {
          await this.addDocument(
            (node.title || "") + " " + node.uri,
            {
              type: "history",
              title: node.title,
              url: node.uri,
              timestamp: node.time,
              context: "Browsing History",
            },
            node.uri
          );
        }
      }
      root.containerOpen = false;
      logDebug(`[LocalMemory] Indexed ${root.childCount} history items.`);
    } catch (e) {
      logError("[LocalMemory] Failed to index history:", e);
    }
  }

  async indexBookmarks() {
    const { PlacesUtils } = getChrome();
    const win = window as Window & {
      PlacesUtils?: PlacesUtilsLike;
      top?: Window & { PlacesUtils?: PlacesUtilsLike };
    };
    const PM = win.PlacesUtils || win.top?.PlacesUtils;
    if (!PlacesUtils?.bookmarks && !PM?.bookmarks) return;
    const PU = PlacesUtils || PM;
    if (!PU?.bookmarks) return;
    const bookmarksApi = PU.bookmarks;

    try {
      const validBookmarkKeys = new Set<string>();
      const unfiledGuid = bookmarksApi.unfiledGuid;
      let hadTraversalFailure = false;

      const processFolder = async (folderGuid: string, folderName: string) => {
        try {
          const fetched = await bookmarksApi.fetch({ parentGuid: folderGuid });
          const children = Array.isArray(fetched)
            ? fetched
            : fetched
              ? [fetched]
              : [];
          if (children.length === 0) return;

          for (const child of children) {
            if (child.type === bookmarksApi.TYPE_FOLDER) {
              const childName = String(child.title || "Untitled");
              const isManagedRoot =
                folderGuid === unfiledGuid &&
                normalizeMemoryName(childName) ===
                  normalizeMemoryName(OASIS_MANAGED_BOOKMARK_ROOT);
              if (isManagedRoot) {
                continue;
              }
              await processFolder(child.guid, childName);
            } else if (child.type === bookmarksApi.TYPE_BOOKMARK && child.url) {
              const url = toUrlString(child.url);
              if (!url) continue;

              const metadata: MemoryMetadata = {
                type: "bookmark",
                title: child.title,
                url,
                timestamp: child.dateAdded,
                context: `Bookmark Folder: ${folderName}`,
                folderName,
                hubName: folderName,
              };
              const text = (child.title || "") + " " + url;
              validBookmarkKeys.add(
                computeMemoryDedupeKey({
                  text,
                  metadata,
                  url,
                })
              );
              await this.addDocument(text, metadata, url);
            }
          }
        } catch (e) {
          hadTraversalFailure = true;
          logWarn(`Failed to fetch bookmarks for ${folderGuid}:`, e);
        }
      };

      await processFolder(bookmarksApi.menuGuid, "Bookmarks Menu");
      await processFolder(bookmarksApi.toolbarGuid, "Bookmarks Toolbar");
      await processFolder(bookmarksApi.unfiledGuid, "Other Bookmarks");
      if (!hadTraversalFailure) {
        await this.removeStaleBookmarkSourceDocuments(validBookmarkKeys);
      } else {
        logWarn(
          "[LocalMemory] Skipped stale bookmark cleanup due to traversal failures."
        );
      }
      logDebug("[LocalMemory] Bookmarks indexed.");
    } catch (e) {
      logError("[LocalMemory] Failed to index bookmarks:", e);
    }
  }

  async indexTabGroups() {
    const { gBrowser } = getChrome();
    if (!gBrowser) return;

    try {
      const validLiveKeys = new Set<string>();
      const groups = Array.from(
        gBrowser.tabGroups || []
      ) as BrowserTabGroupLike[];
      // Index groups
      for (const group of groups) {
        const groupName = group.label || "(unnamed group)";
        const groupMetadata: MemoryMetadata = {
          type: "tab-group",
          title: groupName,
          id: group.id,
        };
        const groupUrl = `about:tab-group?id=${group.id}`;
        const groupText = `Tab Group: ${groupName}`;
        validLiveKeys.add(
          computeMemoryDedupeKey({
            text: groupText,
            metadata: groupMetadata,
            url: groupUrl,
          })
        );
        await this.addDocument(groupText, groupMetadata, groupUrl);
      }

      // Index open tabs with group context
      const tabs = Array.from(gBrowser.tabs || []) as BrowserTabLike[];
      for (const tab of tabs) {
        const url = tab.linkedBrowser?.currentURI?.spec;
        const title = tab.label || "(untitled)";

        let context = "Open Tab";
        if (tab.group) {
          const gName = tab.group.label || "Unnamed Group";
          context = `Tab Group: ${gName}`;
        }

        if (url && !url.startsWith("about:")) {
          const tabMetadata: MemoryMetadata = {
            type: "tab",
            title,
            url,
            timestamp: Date.now(),
            context: context,
          };
          const tabText = title + " " + url;
          validLiveKeys.add(
            computeMemoryDedupeKey({
              text: tabText,
              metadata: tabMetadata,
              url,
            })
          );
          await this.addDocument(tabText, tabMetadata, url);
        }
      }
      await this.removeStaleLiveSourceDocuments(validLiveKeys);
      logDebug(`[LocalMemory] Indexed tabs and groups.`);
    } catch (e) {
      logError("[LocalMemory] Failed to index tab groups:", e);
    }
  }

  async indexAll() {
    await this.indexTabGroups();
    await this.indexBookmarks();
    await this.indexHistory();
  }
}

export const localMemory = new LocalMemoryService();
