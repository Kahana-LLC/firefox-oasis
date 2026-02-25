import { localMemory } from "./localMemory.js";
import { SearchMemoryResult } from "../utils/searchMemoryUtils.js";
// @ts-ignore
import { ChromeUtils } from "resource://gre/modules/ChromeUtils.sys.mjs";
// @ts-ignore
import { Services } from "resource://gre/modules/Services.sys.mjs";
// @ts-ignore
import { placesUtils } from "resource://gre/modules/PlacesUtils.sys.mjs";

interface SemanticHistoryResult {
  title: string;
  score: number;
  url: string;
  visit_time: number;
}

class SearchService {
    public async search(query: string, limit: number = 10, filter?: { hub?: string; folder?: string, tags?: string[] }): Promise<SearchMemoryResult[]> {
        const localMemoryResults = await localMemory.search(query, limit, filter);

        const semanticHistoryResults = await this.semanticHistorySearch(query);

        const bookmarkResults = await this.searchBookmarks(query);

        const tabGroupResults = await this.searchTabGroups(query);

        const combinedResults = [...localMemoryResults, ...bookmarkResults, ...tabGroupResults];
        const seenUrls = new Set(combinedResults.map(r => r.url));

        for (const result of semanticHistoryResults) {
            if (!seenUrls.has(result.url)) {
                combinedResults.push(result);
                seenUrls.add(result.url);
            }
        }

        return combinedResults;
    }

    private async searchBookmarks(query: string): Promise<SearchMemoryResult[]> {
        const results: SearchMemoryResult[] = [];
        const bookmarks = await placesUtils.bookmarks.search({ query }, {sort: placesUtils.bookmarks.SORT_BY_RELEVANCY_DESC});
        for (const bookmark of bookmarks) {
            results.push({
                text: bookmark.title,
                url: bookmark.url.href,
                score: 0.5,
                metadata: {
                    type: "bookmark",
                    title: bookmark.title,
                    url: bookmark.url.href,
                    context: "Bookmarks"
                }
            });
        }
        return results;
    }

    private async searchTabGroups(query: string): Promise<SearchMemoryResult[]> {
        const results: SearchMemoryResult[] = [];
        const TabGroups = ChromeUtils.importESModule(
            "resource://gre/modules/sessionstore/TabGroups.sys.mjs"
        ).TabGroups;
        const groups = await TabGroups.getGroups();
        for (const group of groups) {
            for (const tab of group.tabs) {
                if (tab.title.includes(query) || tab.url.includes(query)) {
                    results.push({
                        text: tab.title,
                        url: tab.url,
                        score: 0.5,
                        metadata: {
                            type: "tab-group",
                            title: tab.title,
                            url: tab.url,
                            context: `Tab Group: ${group.title}`
                        }
                    });
                }
            }
        }
        return results;
    }

    private async semanticHistorySearch(query: string): Promise<SearchMemoryResult[]> {
        try {
            Services.prefs.setBoolPref("places.semanticHistory.featureGate", true);
            Services.prefs.setBoolPref("browser.ml.enable", true);

            const { getPlacesSemanticHistoryManager } = ChromeUtils.importESModule(
              "resource://gre/modules/PlacesSemanticHistoryManager.sys.mjs"
            );

            const semanticManager = getPlacesSemanticHistoryManager();
            if (!semanticManager.canUseSemanticSearch) {
                console.warn("Semantic search is not available.");
                return [];
            }

            const queryContext = { searchString: query };
            const res = await semanticManager.infer(queryContext);

            if (!res?.results) {
                return [];
            }

            return res.results.map((result: any) => ({
                text: result.title,
                score: result.score,
                url: result.url,
                metadata: {
                    type: "history",
                    title: result.title,
                    url: result.url,
                    timestamp: result.visit_time,
                    context: "Browsing History (Semantic)"
                }
            }));
        } catch (e) {
            console.error("Semantic history search failed:", e);
            return [];
        }
    }
}

export const searchService = new SearchService();
