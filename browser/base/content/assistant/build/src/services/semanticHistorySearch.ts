/**
 * Semantic History Search — Orchestrator
 *
 * Ties together the History Collector, Embedding Service, and
 * Orama Vector Store into a single search API.
 *
 * Key behaviors:
 * - Lazy indexing: history is only fetched & embedded on first search
 * - IndexedDB persistence: index survives browser restarts
 * - Incremental indexing: subsequent searches only embed NEW history entries
 * - Singleton indexing: concurrent calls share one indexing pass
 * - Embeddings generated in a separate content process (WASM isolation)
 */

import { embeddingService } from "./embeddingService";
import { historyVectorStore, type SearchResult } from "./historyVectorStore";
import { fetchRecentHistory } from "./historyCollector";

const MAX_HISTORY_ENTRIES = 500;

function buildEmbeddingText(title: string, url: string, snippet?: string): string {
    if (snippet) {
        return `${title} ${snippet}`;
    }
    try {
        const parsed = new URL(url);
        const domain = parsed.hostname.replace(/^www\./, "");
        const pathWords = parsed.pathname
            .split(/[\/\-_.]/)
            .filter(w => w.length > 2 && !/^[0-9a-f]{8,}$/i.test(w))
            .join(" ");
        const searchParams = parsed.searchParams.get("q")
            || parsed.searchParams.get("query")
            || "";
        return `${title} ${domain} ${pathWords} ${searchParams}`.replace(/\s+/g, " ").trim();
    } catch {
        return `${title} ${url}`;
    }
}

function mergeSearchResults(
    primary: SearchResult[],
    secondary: SearchResult[],
    limit: number
): SearchResult[] {
    const seen = new Set(primary.map(r => r.url));
    const merged = [...primary];
    for (const result of secondary) {
        if (!seen.has(result.url)) {
            merged.push(result);
            seen.add(result.url);
        }
    }
    return merged.slice(0, limit);
}

class SemanticHistorySearch {
    private indexed = false;
    private indexingPromise: Promise<void> | null = null;
    private indexedUrls = new Set<string>(); // Track what's already indexed
    private lastIndexTime = 0; // Timestamp of last indexing

    /**
     * Ensure history is indexed. On first call, tries to restore from
     * IndexedDB. If no saved data, does a full index. On subsequent
     * calls, incrementally indexes only NEW entries.
     */
    async ensureIndexed(): Promise<void> {
        if (this.indexingPromise) {
            await this.indexingPromise;
            return;
        }

        // First time: try restore, then full index if needed
        if (!this.indexed) {
            this.indexingPromise = this.tryRestoreOrFullIndex();
            try {
                await this.indexingPromise;
            } finally {
                this.indexingPromise = null;
            }
            return;
        }

        // Subsequent calls: incremental update (only new entries)
        this.indexingPromise = this.doIncrementalIndex();
        try {
            await this.indexingPromise;
        } finally {
            this.indexingPromise = null;
        }
    }

    /**
     * Try to restore from IndexedDB first. If no saved data, do full index.
     * After indexing, save to IndexedDB for next session.
     */
    private async tryRestoreOrFullIndex(): Promise<void> {
        // Step 1: Try restoring from IndexedDB
        console.log("[SemanticSearch] Checking IndexedDB for saved index...");
        console.time("[SemanticSearch] Restore from IndexedDB");

        const restoredUrls = await historyVectorStore.restoreFromStorage();

        if (restoredUrls && restoredUrls.size > 0) {
            console.timeEnd("[SemanticSearch] Restore from IndexedDB");
            this.indexedUrls = restoredUrls;
            this.indexed = true;
            console.log(`[SemanticSearch] ✅ Restored ${restoredUrls.size} entries from IndexedDB — skipping full index`);

            // Do incremental to pick up any new pages since last save
            await this.doIncrementalIndex();
            return;
        }

        console.timeEnd("[SemanticSearch] Restore from IndexedDB");
        console.log("[SemanticSearch] No saved index found — starting full index");

        // Step 2: No saved data — do full index
        await this.doFullIndex();

        // Step 3: Save to IndexedDB for next session
        await this.persistToStorage();
    }

    /**
     * Full index — happens on first search when no saved data exists.
     */
    private async doFullIndex(): Promise<void> {
        console.log("[SemanticSearch] Starting full history indexing...");
        console.time("[SemanticSearch] Total indexing time");

        try {
            const entries = await fetchRecentHistory(MAX_HISTORY_ENTRIES, true);

            if (entries.length === 0) {
                console.warn("[SemanticSearch] No history entries found to index");
                this.indexed = true;
                return;
            }

            console.log(
                `[SemanticSearch] Generating embeddings for ${entries.length} entries...`
            );

            let successCount = 0;
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];

                try {
                    const textToEmbed = buildEmbeddingText(entry.title, entry.url, entry.snippet);
                    const embedding = await embeddingService.embed(textToEmbed);

                    await historyVectorStore.addItem({
                        title: entry.title,
                        url: entry.url,
                        snippet: entry.snippet || entry.title,
                        visitDate: entry.visitDate,
                        embedding,
                    });

                    this.indexedUrls.add(entry.url);
                    successCount++;

                    if ((i + 1) % 50 === 0) {
                        console.log(
                            `[SemanticSearch] Indexed ${i + 1}/${entries.length} entries...`
                        );
                    }
                } catch (err) {
                    console.warn(
                        `[SemanticSearch] Failed to embed entry "${entry.title}":`,
                        err
                    );
                }
            }

            const dbCount = await historyVectorStore.getCount();
            console.timeEnd("[SemanticSearch] Total indexing time");
            console.log(
                `[SemanticSearch] Indexing complete. ${successCount}/${entries.length} entries indexed (${dbCount} in DB)`
            );

            this.indexed = true;
            this.lastIndexTime = Date.now();
        } catch (err) {
            console.error("[SemanticSearch] Indexing failed:", err);
            throw err;
        }
    }

    /**
     * Incremental index — only embed entries not already in the index.
     * Runs quickly since it only processes new pages visited since last index.
     * Saves to IndexedDB if new entries were added.
     */
    private async doIncrementalIndex(): Promise<void> {
        try {
            // First, quick check for new URLs (no snippet fetching — fast!)
            const entries = await fetchRecentHistory(MAX_HISTORY_ENTRIES, false);

            // Filter to only entries NOT already indexed
            const newUrls = entries.filter(e => !this.indexedUrls.has(e.url));

            if (newUrls.length === 0) {
                return; // Nothing new to index — fast path
            }

            // Now fetch again with snippets only for the new entries
            // (re-fetch is needed because we need snippet content for embedding)
            const newEntries = await Promise.all(
                newUrls.map(async (entry) => {
                    try {
                        const response = await fetch(entry.url, {
                            signal: AbortSignal.timeout(5000),
                            headers: { "Accept": "text/html" },
                        });
                        if (!response.ok) return entry;
                        const ct = response.headers.get("content-type") || "";
                        if (!ct.includes("text/html")) return entry;
                        const html = await response.text();
                        entry.snippet = html
                            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
                            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
                            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
                            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
                            .replace(/<[^>]+>/g, " ")
                            .replace(/&[a-zA-Z]+;/g, " ")
                            .replace(/\s+/g, " ")
                            .trim()
                            .substring(0, 1000);
                    } catch {
                        // Snippet fetch failed — use empty snippet (title+url fallback)
                    }
                    return entry;
                })
            );

            console.log(
                `[SemanticSearch] Incremental update: ${newEntries.length} new entries to index`
            );

            let successCount = 0;
            for (const entry of newEntries) {
                try {
                    const textToEmbed = buildEmbeddingText(entry.title, entry.url, entry.snippet);
                    const embedding = await embeddingService.embed(textToEmbed);

                    await historyVectorStore.addItem({
                        title: entry.title,
                        url: entry.url,
                        snippet: entry.snippet || entry.title,
                        visitDate: entry.visitDate,
                        embedding,
                    });

                    this.indexedUrls.add(entry.url);
                    successCount++;
                } catch (err) {
                    console.warn(
                        `[SemanticSearch] Failed to embed entry "${entry.title}":`,
                        err
                    );
                }
            }

            const dbCount = await historyVectorStore.getCount();
            console.log(
                `[SemanticSearch] Incremental update done. ${successCount} new entries added (${dbCount} total in DB)`
            );
            this.lastIndexTime = Date.now();

            // Persist updated index to IndexedDB
            if (successCount > 0) {
                await this.persistToStorage();
            }
        } catch (err) {
            console.error("[SemanticSearch] Incremental indexing failed:", err);
            // Don't throw — incremental failure shouldn't break search
        }
    }
    /**
     * Save current state to IndexedDB for persistence across restarts.
     */
    private async persistToStorage(): Promise<void> {
        try {
            await historyVectorStore.saveToStorage(this.indexedUrls);
        } catch (err) {
            console.warn("[SemanticSearch] Failed to persist to storage:", err);
        }
    }

    async search(query: string, limit = 10): Promise<SearchResult[]> {
        await this.ensureIndexed();

        console.time("[SemanticSearch] Search");
        const queryEmbedding = await embeddingService.embed(query);
        let results = await historyVectorStore.hybridSearch(query, queryEmbedding, limit);

        if (results.length === 0) {
            console.log("[SemanticSearch] Hybrid returned 0 — trying keyword fallback");
            const keywordResults = await historyVectorStore.keywordSearch(query, limit);
            results = mergeSearchResults(results, keywordResults, limit);
        }

        if (results.length === 0) {
            console.log("[SemanticSearch] Still 0 — trying pure vector with low threshold");
            const vectorResults = await historyVectorStore.search(queryEmbedding, limit, 0.05);
            results = mergeSearchResults(results, vectorResults, limit);
        }

        console.timeEnd("[SemanticSearch] Search");
        console.log(
            `[SemanticSearch] Found ${results.length} results for "${query}"`
        );

        return results;
    }

    async reindex(): Promise<void> {
        this.indexed = false;
        this.indexedUrls.clear();
        await historyVectorStore.clear();
        await historyVectorStore.clearStorage();
        await this.ensureIndexed();
    }

    isReady(): boolean {
        return this.indexed;
    }
}

export const semanticHistorySearch = new SemanticHistorySearch();
(window as any).semanticHistorySearch = semanticHistorySearch;
