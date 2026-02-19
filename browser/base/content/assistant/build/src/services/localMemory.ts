import { openDB, DBSchema, IDBPDatabase } from "idb";
import MiniSearch from "minisearch";

function getChrome() {
  const topWin = (window as any).Services?.wm?.getMostRecentWindow("navigator:browser") || window.top;
  const gBrowser = topWin?.gBrowser;
  const PlacesUtils = topWin?.PlacesUtils;
  return { topWin, gBrowser, PlacesUtils };
}

// Full-text search using MiniSearch.

interface MemoryDoc {
  id?: number;
  text: string;
  tokens: string[];
  metadata: any;
  timestamp: number;
  url?: string;
}

interface MemoryDB extends DBSchema {
  documents: {
    key: number;
    value: MemoryDoc;
    indexes: { "by-timestamp": number; "by-url": string };
  };
  usage: {
    key: string;
    value: { userId: string; count: number; timestamp: number };
  };
}

class LocalMemoryService {
  private dbPromise: Promise<IDBPDatabase<MemoryDB>>;
  private miniSearch: MiniSearch;
  private isIndexDirty: boolean = true;

  constructor() {
    this.dbPromise = openDB<MemoryDB>("oasis-memory", 2, {
      upgrade(db, oldVersion, newVersion, transaction) {
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
      },
    });

    this.miniSearch = new MiniSearch({
      fields: ["text", "title", "description"],
      storeFields: ["text", "metadata", "url", "timestamp"],
      extractField: (doc, fieldName) => {
        if (fieldName === "title") return doc.metadata?.title;
        if (fieldName === "description") return doc.metadata?.description;
        return doc[fieldName];
      },
      tokenize: (text) => this.tokenize(text),
      searchOptions: {
        boost: { title: 2 },
        fuzzy: 0.2,
        prefix: true,
        tokenize: (text) => this.tokenize(text)
      }
    });
    
    // Initialize index immediately
    this.ensureIndex().then(() => {
        // Index fresh content from browser
        setTimeout(() => this.indexAll(), 5000); // Wait for browser to settle
    }).catch(console.error);
  }

  // Simple tokenizer: lowercase, replace punctuation with spaces, split by whitespace
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ") // Replace punctuation with space to preserve words
      .split(/\s+/)
      .filter((t) => t.length > 2); // Ignore tiny words
  }

  private async ensureIndex() {
    if (!this.isIndexDirty) return;
    
    const db = await this.dbPromise;
    const docs = await db.getAll("documents");
    
    this.miniSearch.removeAll();
    if (docs.length > 0) {
      this.miniSearch.addAll(docs.map(d => ({
        id: d.id!,
        text: d.text,
        metadata: d.metadata,
        url: d.url,
        timestamp: d.timestamp
      })));
    }
    
    this.isIndexDirty = false;
    console.log(`[LocalMemory] Index rebuilt with ${docs.length} documents`);
  }

  async addDocument(text: string, metadata: any = {}, url?: string) {
    // Deduplicate by URL
    if (url) {
      await this.removeDocumentByUrl(url);
    }

    const tokens = this.tokenize(text);
    
    const doc: MemoryDoc = {
      text,
      tokens,
      metadata,
      timestamp: Date.now(),
      url
    };
    const db = await this.dbPromise;
    await db.add("documents", doc);
    this.isIndexDirty = true;
    console.log(`Added document to memory: "${text.substring(0, 20)}..."`);
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
    console.log(`Removed documents for URL: ${url}`);
  }

  async search(query: string, limit = 5, filter?: { hub?: string; folder?: string }): Promise<{ text: string; score: number; metadata: any }[]> {
    await this.ensureIndex();

    const folderFilter = filter?.folder || filter?.hub;
    const results = this.miniSearch.search(query, {
      filter: (result) => {
        if (folderFilter) {
          const name = (result.metadata?.folderName || result.metadata?.hubName || "").toLowerCase();
          return name === folderFilter.toLowerCase();
        }
        return true;
      }
    });

    // Deduplicate results by URL
    const seenUrls = new Set<string>();
    const uniqueResults = [];
    
    for (const r of results) {
      const url = r.url || r.metadata?.url;
      if (url) {
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);
      }
      uniqueResults.push(r);
      if (uniqueResults.length >= limit) break;
    }

    return uniqueResults.map((r) => ({
      text: r.text,
      score: r.score,
      metadata: r.metadata,
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
    console.log(`[LocalMemory] Saved usage for ${userId}: ${count}`);
  }

  // --- Indexing from Browser ---

  async indexHistory(maxItems = 1000) {
    const PlacesUtils = (window as any).PlacesUtils || getChrome().PlacesUtils;
    if (!PlacesUtils) return;

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
            { type: "history", title: node.title, url: node.uri, timestamp: node.time, context: "Browsing History" },
            node.uri
          );
        }
      }
      root.containerOpen = false;
      console.log(`[LocalMemory] Indexed ${root.childCount} history items.`);
    } catch (e) {
      console.error("[LocalMemory] Failed to index history:", e);
    }
  }

  async indexBookmarks() {
    const { PlacesUtils } = getChrome();
    const PM = (window as any).PlacesUtils || (window.top as any)?.PlacesUtils;
    if (!PlacesUtils && !PM) return;
    const PU = PlacesUtils || PM;

    try {
      const processFolder = async (folderGuid: string, folderName: string) => {
        try {
          const children = await PU.bookmarks.fetch({ parentGuid: folderGuid });
          if (!children) return;

          for (const child of children) {
            if (child.type === PU.bookmarks.TYPE_FOLDER) {
               await processFolder(child.guid, child.title);
            } else if (child.type === PU.bookmarks.TYPE_BOOKMARK && child.url) {
               await this.addDocument(
                  (child.title || "") + " " + child.url,
                  {
                    type: "bookmark",
                    title: child.title,
                    url: child.url,
                    timestamp: child.dateAdded,
                    context: `Bookmark Folder: ${folderName}`,
                    folderName,
                    hubName: folderName,
                  },
                  child.url
               );
            }
          }
        } catch (e) {
             console.warn(`Failed to fetch bookmarks for ${folderGuid}:`, e);
        }
      };

      if (PU.bookmarks) {
          await processFolder(PU.bookmarks.menuGuid, "Bookmarks Menu");
          await processFolder(PU.bookmarks.toolbarGuid, "Bookmarks Toolbar");
          await processFolder(PU.bookmarks.unfiledGuid, "Other Bookmarks");
          console.log("[LocalMemory] Bookmarks indexed.");
      }
    } catch (e) {
      console.error("[LocalMemory] Failed to index bookmarks:", e);
    }
  }

  async indexTabGroups() {
    const { gBrowser } = getChrome();
    if (!gBrowser) return;

    try {
      const groups = gBrowser.tabGroups || [];
      // Index groups
      for (const group of groups) {
          const groupName = group.label || "(unnamed group)";
          await this.addDocument(
             `Tab Group: ${groupName}`,
             { type: "tab-group", title: groupName, id: group.id },
             `about:tab-group?id=${group.id}`
          );
      }

      // Index open tabs with group context
      const tabs = gBrowser.tabs || [];
      for (const tab of tabs) {
          const url = tab.linkedBrowser?.currentURI?.spec;
          const title = tab.label || "(untitled)";
          
          let context = "Open Tab";
          if (tab.group) {
              const gName = tab.group.label || "Unnamed Group";
              context = `Tab Group: ${gName}`;
          }

          if (url && !url.startsWith("about:")) {
             await this.addDocument(
                 title + " " + url,
                 { 
                    type: "tab", 
                    title, 
                    url, 
                    timestamp: Date.now(),
                    context: context
                 },
                 url
             );
          }
      }
      console.log(`[LocalMemory] Indexed tabs and groups.`);
    } catch (e) {
       console.error("[LocalMemory] Failed to index tab groups:", e);
    }
  }

  async indexAll() {
    await this.indexTabGroups();
    await this.indexBookmarks();
    await this.indexHistory();
  }
}

export const localMemory = new LocalMemoryService();

