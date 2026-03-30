/**
 * History Vector Store — Orama In-Memory Vector Database with IndexedDB Persistence
 *
 * Creates and manages an Orama database with a schema designed for
 * browser history entries. Supports:
 * - Inserting history items with pre-computed embeddings
 * - Vector similarity search
 * - Full reset for re-indexing
 * - Save/restore to IndexedDB for persistence across browser restarts
 */

import { create, insert, search, count, save, load } from "@orama/orama";
import { VECTOR_DIMENSIONS } from "./embeddingService";

// IndexedDB constants
const IDB_NAME = "oasis-semantic-search";
const IDB_STORE = "vector-index";
const IDB_KEY_SNAPSHOT = "orama-snapshot";
const IDB_KEY_URLS = "indexed-urls";

export interface HistoryItem {
    title: string;
    url: string;
    snippet: string;
    visitDate: number;
    embedding: number[];
}

export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
    visitDate: number;
    score: number;
}

class HistoryVectorStore {
    private db: any = null;

    async init(): Promise<void> {
        if (this.db) return;

        this.db = create({
            schema: {
                title: "string",
                url: "string",
                snippet: "string",
                visitDate: "number",
                embedding: `vector[${VECTOR_DIMENSIONS}]` as any,
            },
        });

        console.log("[HistoryVectorStore] Orama DB created");
    }

    async addItem(item: HistoryItem): Promise<void> {
        await this.init();
        await insert(this.db, {
            title: item.title,
            url: item.url,
            snippet: item.snippet,
            visitDate: item.visitDate,
            embedding: item.embedding,
        });
    }

    async search(
        queryEmbedding: number[],
        limit = 5,
        minSimilarity = 0.35
    ): Promise<SearchResult[]> {
        await this.init();

        const results = await search(this.db, {
            mode: "vector",
            vector: {
                value: queryEmbedding,
                property: "embedding",
            },
            similarity: minSimilarity,
            limit,
            includeVectors: false,
        });

        return results.hits.map((hit: any) => ({
            title: hit.document.title,
            url: hit.document.url,
            snippet: hit.document.snippet,
            visitDate: hit.document.visitDate,
            score: hit.score,
        }));
    }

    async getCount(): Promise<number> {
        await this.init();
        return count(this.db);
    }

    async clear(): Promise<void> {
        this.db = null;
        await this.init();
    }

    // ─── IndexedDB Persistence ─────────────────────────────────

    /**
     * Save the current Orama DB state + indexed URLs to IndexedDB.
     */
    async saveToStorage(indexedUrls: Set<string>): Promise<void> {
        if (!this.db) return;

        try {
            const snapshot = save(this.db);
            const snapshotJson = JSON.stringify(snapshot);
            const urlsJson = JSON.stringify([...indexedUrls]);

            await this.idbPut(IDB_KEY_SNAPSHOT, snapshotJson);
            await this.idbPut(IDB_KEY_URLS, urlsJson);

            console.log(
                `[HistoryVectorStore] Saved to IndexedDB (${(snapshotJson.length / 1024).toFixed(1)} KB snapshot, ${indexedUrls.size} URLs)`
            );
        } catch (err) {
            console.warn("[HistoryVectorStore] Failed to save to IndexedDB:", err);
        }
    }

    /**
     * Restore the Orama DB + indexed URLs from IndexedDB.
     * Returns the set of indexed URLs if restore was successful, null if not.
     */
    async restoreFromStorage(): Promise<Set<string> | null> {
        try {
            const snapshotJson = await this.idbGet(IDB_KEY_SNAPSHOT);
            const urlsJson = await this.idbGet(IDB_KEY_URLS);

            if (!snapshotJson) {
                console.log("[HistoryVectorStore] No saved data in IndexedDB");
                return null;
            }

            await this.init(); // Create empty DB with schema
            const snapshot = JSON.parse(snapshotJson);
            load(this.db, snapshot);

            const itemCount = await count(this.db);
            console.log(
                `[HistoryVectorStore] Restored ${itemCount} entries from IndexedDB`
            );

            // Restore indexed URLs
            const urls = urlsJson ? new Set<string>(JSON.parse(urlsJson)) : new Set<string>();
            return urls;
        } catch (err) {
            console.warn("[HistoryVectorStore] Failed to restore from IndexedDB:", err);
            // Reset DB in case of partial load
            this.db = null;
            return null;
        }
    }

    /**
     * Clear the persisted data from IndexedDB.
     */
    async clearStorage(): Promise<void> {
        try {
            await this.idbDelete(IDB_KEY_SNAPSHOT);
            await this.idbDelete(IDB_KEY_URLS);
            console.log("[HistoryVectorStore] Cleared IndexedDB storage");
        } catch (err) {
            console.warn("[HistoryVectorStore] Failed to clear IndexedDB:", err);
        }
    }

    // ─── IndexedDB Helpers ─────────────────────────────────────

    private openIDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            if (typeof indexedDB === "undefined" || !indexedDB) {
                reject(new Error("IndexedDB not available"));
                return;
            }
            const request = indexedDB.open(IDB_NAME, 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(IDB_STORE)) {
                    request.result.createObjectStore(IDB_STORE);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    private async idbPut(key: string, value: string): Promise<void> {
        const db = await this.openIDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, "readwrite");
            tx.objectStore(IDB_STORE).put(value, key);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
        });
    }

    private async idbGet(key: string): Promise<string | null> {
        const db = await this.openIDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, "readonly");
            const getReq = tx.objectStore(IDB_STORE).get(key);
            getReq.onsuccess = () => { db.close(); resolve(getReq.result || null); };
            getReq.onerror = () => { db.close(); reject(getReq.error); };
        });
    }

    private async idbDelete(key: string): Promise<void> {
        const db = await this.openIDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, "readwrite");
            tx.objectStore(IDB_STORE).delete(key);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
        });
    }
}

export const historyVectorStore = new HistoryVectorStore();
