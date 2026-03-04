/**
 * Semantic History Search — Orchestrator
 *
 * Ties together the History Collector, Embedding Service, and
 * Orama Vector Store into a single search API.
 *
 * Key behaviors:
 * - Lazy indexing: history is only fetched & embedded on first search
 * - Incremental indexing: subsequent searches only embed NEW history entries
 * - Singleton indexing: concurrent calls share one indexing pass
 * - Embeddings generated in a separate content process (WASM isolation)
 */

import { embeddingService } from "./embeddingService";
import { historyVectorStore, type SearchResult } from "./historyVectorStore";
import { fetchRecentHistory } from "./historyCollector";

const MAX_HISTORY_ENTRIES = 200;

class SemanticHistorySearch {
    private indexed = false;
    private indexingPromise: Promise<void> | null = null;
    private indexedUrls = new Set<string>(); // Track what's already indexed
    private lastIndexTime = 0; // Timestamp of last indexing

    /**
     * Ensure history is indexed. On first call, indexes everything.
     * On subsequent calls, incrementally indexes only NEW entries.
     */
    async ensureIndexed(): Promise<void> {
        if (this.indexingPromise) {
            await this.indexingPromise;
            return;
        }

        // First time: full indexing
        if (!this.indexed) {
            this.indexingPromise = this.doFullIndex();
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
     * Full index — happens on first search only.
     */
    private async doFullIndex(): Promise<void> {
        console.log("[SemanticSearch] Starting full history indexing...");
        console.time("[SemanticSearch] Total indexing time");

        try {
            const entries = await fetchRecentHistory(MAX_HISTORY_ENTRIES);

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
                    const textToEmbed = `${entry.title} ${entry.url}`;
                    const embedding = await embeddingService.embed(textToEmbed);

                    await historyVectorStore.addItem({
                        title: entry.title,
                        url: entry.url,
                        snippet: entry.title,
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
     */
    private async doIncrementalIndex(): Promise<void> {
        try {
            const entries = await fetchRecentHistory(MAX_HISTORY_ENTRIES);

            // Filter to only entries NOT already indexed
            const newEntries = entries.filter(e => !this.indexedUrls.has(e.url));

            if (newEntries.length === 0) {
                return; // Nothing new to index — fast path
            }

            console.log(
                `[SemanticSearch] Incremental update: ${newEntries.length} new entries to index`
            );

            let successCount = 0;
            for (const entry of newEntries) {
                try {
                    const textToEmbed = `${entry.title} ${entry.url}`;
                    const embedding = await embeddingService.embed(textToEmbed);

                    await historyVectorStore.addItem({
                        title: entry.title,
                        url: entry.url,
                        snippet: entry.title,
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
        } catch (err) {
            console.error("[SemanticSearch] Incremental indexing failed:", err);
            // Don't throw — incremental failure shouldn't break search
        }
    }

    async search(query: string, limit = 5): Promise<SearchResult[]> {
        await this.ensureIndexed();

        console.time("[SemanticSearch] Search");
        const queryEmbedding = await embeddingService.embed(query);
        const results = await historyVectorStore.search(queryEmbedding, limit);
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
        await this.ensureIndexed();
    }

    isReady(): boolean {
        return this.indexed;
    }
}

export const semanticHistorySearch = new SemanticHistorySearch();
(window as any).semanticHistorySearch = semanticHistorySearch;
