import {
  searchHistoryByKeyword,
  type HistoryEntry,
} from "./historyCollector.js";
import { historyVectorStore } from "./historyVectorStore.js";

export type KeywordHistoryMatchField = "title" | "url" | "snippet";

export type KeywordHistoryResult = {
  title: string;
  url: string;
  visitDate: number;
  score: number;
  matchType: KeywordHistoryMatchField;
  excerpt?: string;
};

const EXCERPT_RADIUS = 60;

function tokenizeQuery(query: string): string[] {
  return String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(token => token.length >= 2);
}

function allTokensMatch(text: string, tokens: string[]): boolean {
  if (tokens.length === 0) {
    return true;
  }
  const lower = text.toLowerCase();
  return tokens.every(token => lower.includes(token));
}

function buildExcerpt(snippet: string, query: string): string | undefined {
  const text = String(snippet || "").trim();
  if (!text) {
    return undefined;
  }
  const tokens = tokenizeQuery(query);
  const needle = tokens[0] || query.toLowerCase();
  const idx = text.toLowerCase().indexOf(needle);
  if (idx < 0) {
    return text.slice(0, EXCERPT_RADIUS * 2);
  }
  const start = Math.max(0, idx - EXCERPT_RADIUS);
  const end = Math.min(text.length, idx + needle.length + EXCERPT_RADIUS);
  const slice = text.slice(start, end).trim();
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${slice}${suffix}`;
}

function normalizeOramaScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0.7;
  }
  return Math.min(0.95, Math.max(0.65, score));
}

export function mergeKeywordHistoryResults(params: {
  places: HistoryEntry[];
  orama: Array<{
    title: string;
    url: string;
    snippet: string;
    visitDate: number;
    score: number;
  }>;
  query: string;
  limit: number;
}): KeywordHistoryResult[] {
  const tokens = tokenizeQuery(params.query);
  const byUrl = new Map<string, KeywordHistoryResult>();

  for (const entry of params.places) {
    if (!allTokensMatch(`${entry.title} ${entry.url}`, tokens)) {
      continue;
    }
    const score = entry.matchField === "title" ? 1.0 : 0.85;
    byUrl.set(entry.url, {
      title: entry.title,
      url: entry.url,
      visitDate: entry.visitDate,
      score,
      matchType: entry.matchField || "title",
      excerpt: entry.title,
    });
  }

  for (const hit of params.orama) {
    if (!allTokensMatch(`${hit.title} ${hit.url} ${hit.snippet}`, tokens)) {
      continue;
    }
    const excerpt = buildExcerpt(hit.snippet, params.query);
    const matchType: KeywordHistoryMatchField = hit.snippet
      ? "snippet"
      : allTokensMatch(hit.title, tokens)
        ? "title"
        : "url";
    const score = normalizeOramaScore(hit.score);
    const existing = byUrl.get(hit.url);
    if (!existing || score > existing.score) {
      byUrl.set(hit.url, {
        title: hit.title,
        url: hit.url,
        visitDate: hit.visitDate,
        score: Math.max(existing?.score || 0, score),
        matchType,
        excerpt: excerpt || existing?.excerpt,
      });
    } else if (existing && excerpt && !existing.excerpt) {
      existing.excerpt = excerpt;
      existing.matchType = "snippet";
    }
  }

  return [...byUrl.values()]
    .sort((a, b) => b.score - a.score || b.visitDate - a.visitDate)
    .slice(0, params.limit);
}

export async function searchHistoryByKeywordHybrid(
  query: string,
  limit = 10
): Promise<KeywordHistoryResult[]> {
  const trimmed = String(query || "").trim();
  if (!trimmed) {
    return [];
  }

  const fetchLimit = Math.max(limit * 2, 10);
  const placesPromise = searchHistoryByKeyword(trimmed, fetchLimit);

  let oramaHits: Array<{
    title: string;
    url: string;
    snippet: string;
    visitDate: number;
    score: number;
  }> = [];
  try {
    oramaHits = await tryOramaKeywordSearch(trimmed, fetchLimit);
  } catch (err) {
    console.warn("[HistoryKeywordSearch] Orama keyword search failed:", err);
  }

  const places = await placesPromise;
  return mergeKeywordHistoryResults({
    places,
    orama: oramaHits,
    query: trimmed,
    limit,
  });
}

async function tryOramaKeywordSearch(
  query: string,
  limit: number
): Promise<
  Array<{
    title: string;
    url: string;
    snippet: string;
    visitDate: number;
    score: number;
  }>
> {
  await historyVectorStore.init();
  const restored = await historyVectorStore.restoreFromStorage();
  if (!restored || restored.size === 0) {
    return [];
  }
  return historyVectorStore.keywordSearch(query, limit);
}
