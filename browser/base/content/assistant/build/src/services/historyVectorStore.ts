/**
 * History Vector Store — Orama In-Memory Vector Database
 *
 * Creates and manages an Orama database with a schema designed for
 * browser history entries. Supports:
 * - Inserting history items with pre-computed embeddings
 * - Vector similarity search
 * - Full reset for re-indexing
 *
 * The DB is in-memory only — destroyed when the sidebar session ends.
 * No data is persisted to disk or sent over the network.
 */

import { create, insert, search, count } from "@orama/orama";
import { VECTOR_DIMENSIONS } from "./embeddingService";

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
        minSimilarity = 0.3
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
}

export const historyVectorStore = new HistoryVectorStore();
