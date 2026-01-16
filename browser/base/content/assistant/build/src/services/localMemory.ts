import { openDB, DBSchema, IDBPDatabase } from "idb";
import MiniSearch from "minisearch";

// Full-text search using MiniSearch
// Provides better fuzzy matching and prefix search than Fuse.js for documents.

interface MemoryDoc {
  id?: number;
  text: string;
  tokens: string[]; // Kept for compatibility
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
      fields: ["text", "title", "description"], // fields to index for full-text search
      storeFields: ["text", "metadata", "url", "timestamp"], // fields to return with results
      extractField: (doc, fieldName) => {
        if (fieldName === "title") return doc.metadata?.title;
        if (fieldName === "description") return doc.metadata?.description;
        return doc[fieldName];
      },
      tokenize: (text) => this.tokenize(text), // Use consistent tokenizer
      searchOptions: {
        boost: { title: 2 },
        fuzzy: 0.2,
        prefix: true,
        tokenize: (text) => this.tokenize(text) // Use consistent tokenizer for queries too
      }
    });
    
    // Initialize index immediately
    this.ensureIndex().catch(console.error);
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

  async search(query: string, limit = 5, filter?: { hub?: string }): Promise<{ text: string; score: number; metadata: any }[]> {
    await this.ensureIndex();

    const results = this.miniSearch.search(query, {
      filter: (result) => {
        if (filter?.hub) {
          // Case-insensitive hub matching
          return (result.metadata?.hubName || "").toLowerCase() === filter.hub.toLowerCase();
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
}

export const localMemory = new LocalMemoryService();

