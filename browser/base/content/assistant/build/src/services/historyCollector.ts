/**
 * History Collector — Firefox Places API Reader
 *
 * Reads recent browser history entries from Firefox's internal
 * Places database using the privileged PlacesUtils API. This is the
 * same API used by hubs.ts for bookmark access.
 *
 * Returns cleaned, deduplicated { title, url, visitDate, snippet } items,
 * filtering out internal Firefox pages (about:, chrome://, etc.)
 * and search engine result pages.
 */

export interface HistoryEntry {
  title: string;
  url: string;
  visitDate: number; // epoch ms
  snippet: string; // first ~500 chars of page body text
  matchField?: "title" | "url";
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
  return SEARCH_ENGINE_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * Check if a URL is a user-visible web page worth indexing.
 */
function isUserVisibleUrl(url: string): boolean {
  if (!url) return false;
  if (EXCLUDED_PREFIXES.some(prefix => url.startsWith(prefix))) return false;
  if (isSearchEnginePage(url)) return false;
  return true;
}

// ─── Snippet Extraction ────────────────────────────────────────

const SNIPPET_MAX_LENGTH = 500;
const SNIPPET_FETCH_TIMEOUT = 5000; // 5s max per page

/**
 * Fetch a URL and extract the first ~500 chars of readable body text.
 * Returns empty string on any failure (timeout, 404, CORS, etc.)
 * — the caller falls back to title+url for embedding.
 */
async function fetchPageSnippet(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SNIPPET_FETCH_TIMEOUT);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "text/html" },
    });
    clearTimeout(timeout);

    if (!response.ok) return "";

    const contentType = response.headers.get("content-type") || "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("text/plain")
    ) {
      return ""; // Skip PDFs, images, etc.
    }

    const html = await response.text();

    // Strip scripts, styles, and HTML tags — keep only readable text
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-zA-Z]+;/g, " ") // HTML entities
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, SNIPPET_MAX_LENGTH);

    return textContent;
  } catch {
    return ""; // Silently fail — title+url fallback is fine
  }
}

function detectMatchField(
  terms: string,
  title: string,
  url: string
): "title" | "url" {
  const lowerTerms = terms.toLowerCase();
  const tokens = lowerTerms.split(/\s+/).filter(Boolean);
  const titleLower = title.toLowerCase();
  const urlLower = url.toLowerCase();
  const titleMatch =
    tokens.length > 0 && tokens.every(token => titleLower.includes(token));
  if (titleMatch) {
    return "title";
  }
  return "url";
}

export async function searchHistoryByKeyword(
  terms: string,
  maxResults = 20
): Promise<HistoryEntry[]> {
  const PlacesUtils = getPlacesUtils();
  const searchTerms = String(terms || "").trim();
  if (!PlacesUtils || !searchTerms) {
    return [];
  }

  try {
    const options = PlacesUtils.history.getNewQueryOptions();
    options.sortingMode = options.SORT_BY_DATE_DESCENDING;
    options.maxResults = maxResults * 2;
    options.includeHidden = false;

    const query = PlacesUtils.history.getNewQuery();
    query.searchTerms = searchTerms;

    const result = PlacesUtils.history.executeQuery(query, options);
    const root = result.root;
    root.containerOpen = true;

    const entries: HistoryEntry[] = [];
    const seenUrls = new Set<string>();

    for (let i = 0; i < root.childCount && entries.length < maxResults; i++) {
      const node = root.getChild(i);
      const url = node.uri;
      if (!isUserVisibleUrl(url)) {
        continue;
      }
      if (seenUrls.has(url)) {
        continue;
      }
      seenUrls.add(url);

      const title = node.title || url;
      entries.push({
        title,
        url,
        visitDate: Math.floor(node.time / 1000),
        snippet: "",
        matchField: detectMatchField(searchTerms, title, url),
      });
    }

    root.containerOpen = false;
    return entries;
  } catch (e) {
    console.error("[HistoryCollector] Keyword search failed:", e);
    return [];
  }
}

// ─── Main History Fetch ────────────────────────────────────────

/**
 * Fetch recent browsing history from Firefox Places API.
 *
 * @param maxResults - Maximum number of history entries to return (default 200)
 * @param includeSnippets - Whether to fetch page content snippets (default false)
 * @returns Array of history entries sorted by visit date (most recent first)
 */
export async function fetchRecentHistory(
  maxResults = 200,
  includeSnippets = false
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
        snippet: "", // populated below if includeSnippets=true
      });
    }

    root.containerOpen = false;

    console.timeEnd("[HistoryCollector] Fetch history");
    console.log(
      `[HistoryCollector] Fetched ${entries.length} unique history entries`
    );

    // Fetch snippets if requested (parallel, batched to avoid overwhelming)
    if (includeSnippets && entries.length > 0) {
      console.log(
        `[HistoryCollector] Fetching snippets for ${entries.length} entries...`
      );
      console.time("[HistoryCollector] Fetch snippets");

      const BATCH_SIZE = 5;
      for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);
        const snippets = await Promise.all(
          batch.map(e => fetchPageSnippet(e.url))
        );
        batch.forEach((entry, j) => {
          entry.snippet = snippets[j];
        });
      }

      const withSnippets = entries.filter(e => e.snippet.length > 0).length;
      console.timeEnd("[HistoryCollector] Fetch snippets");
      console.log(
        `[HistoryCollector] Got snippets for ${withSnippets}/${entries.length} entries`
      );
    }

    return entries;
  } catch (e) {
    console.error("[HistoryCollector] Failed to fetch history:", e);
    return [];
  }
}
