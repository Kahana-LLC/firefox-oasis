/**
 * History Collector — Firefox Places API Reader
 *
 * Reads recent browser history entries from Firefox's internal
 * Places database using the privileged PlacesUtils API. This is the
 * same API used by hubs.ts for bookmark access.
 *
 * Returns cleaned, deduplicated { title, url, visitDate } items,
 * filtering out internal Firefox pages (about:, chrome://, etc.)
 */

export interface HistoryEntry {
    title: string;
    url: string;
    visitDate: number; // epoch ms
}

/**
 * Get PlacesUtils from the privileged browser window.
 * Follows the same pattern as hubs.ts / commands.ts.
 */
function getPlacesUtils(): any {
    const topWin = (window as any).top;
    const Services = topWin?.Services || (window as any).Services;

    if (Services?.wm) {
        const browserWin = Services.wm.getMostRecentWindow("navigator:browser");
        return browserWin?.PlacesUtils;
    }
    return topWin?.PlacesUtils;
}

/**
 * Internal URL prefixes that should be excluded from search results.
 */
const EXCLUDED_PREFIXES = [
    "about:",
    "chrome://",
    "moz-extension://",
    "resource://",
    "data:",
    "blob:",
    "javascript:",
    "view-source:",
];

/**
 * Search engine result page (SERP) URL patterns to exclude.
 * The actual destination pages are more valuable than the search pages.
 */
const SEARCH_ENGINE_PATTERNS = [
    /^https?:\/\/(www\.)?google\.\w+\/search\?/,
    /^https?:\/\/(www\.)?bing\.com\/search\?/,
    /^https?:\/\/(www\.)?duckduckgo\.com\/\?q=/,
    /^https?:\/\/(www\.)?yahoo\.com\/search/,
    /^https?:\/\/(www\.)?baidu\.com\/s\?/,
    /^https?:\/\/(www\.)?search\.yahoo\.com\//,
];

/**
 * Check if a URL is a search engine results page.
 */
function isSearchEnginePage(url: string): boolean {
    return SEARCH_ENGINE_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Check if a URL is a user-visible web page worth indexing.
 */
function isUserVisibleUrl(url: string): boolean {
    if (!url) return false;
    if (EXCLUDED_PREFIXES.some((prefix) => url.startsWith(prefix))) return false;
    if (isSearchEnginePage(url)) return false;
    return true;
}

/**
 * Fetch recent browsing history from Firefox Places API.
 *
 * @param maxResults - Maximum number of history entries to return (default 200)
 * @returns Array of history entries sorted by visit date (most recent first)
 */
export async function fetchRecentHistory(
    maxResults = 200
): Promise<HistoryEntry[]> {
    const PlacesUtils = getPlacesUtils();

    if (!PlacesUtils) {
        console.warn("[HistoryCollector] PlacesUtils not available");
        return [];
    }

    try {
        console.time("[HistoryCollector] Fetch history");

        const options = PlacesUtils.history.getNewQueryOptions();
        options.sortingMode = options.SORT_BY_DATE_DESCENDING;
        options.maxResults = maxResults * 2; // fetch extra to account for filtering/dedup
        options.includeHidden = false;

        const query = PlacesUtils.history.getNewQuery();
        const result = PlacesUtils.history.executeQuery(query, options);
        const root = result.root;
        root.containerOpen = true;

        const entries: HistoryEntry[] = [];
        const seenUrls = new Set<string>();

        for (let i = 0; i < root.childCount && entries.length < maxResults; i++) {
            const node = root.getChild(i);
            const url = node.uri;

            // Skip internal/non-user-visible pages
            if (!isUserVisibleUrl(url)) continue;

            // Deduplicate by URL (keep most recent visit)
            if (seenUrls.has(url)) continue;
            seenUrls.add(url);

            entries.push({
                title: node.title || url, // fallback to URL if no title
                url,
                // Places stores time in microseconds; convert to ms
                visitDate: Math.floor(node.time / 1000),
            });
        }

        root.containerOpen = false;

        console.timeEnd("[HistoryCollector] Fetch history");
        console.log(
            `[HistoryCollector] Fetched ${entries.length} unique history entries`
        );

        return entries;
    } catch (e) {
        console.error("[HistoryCollector] Failed to fetch history:", e);
        return [];
    }
}
