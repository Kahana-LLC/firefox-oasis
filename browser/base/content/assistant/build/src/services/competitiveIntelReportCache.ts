import type { CompetitiveIntelReport } from "./competitiveIntelTypes.js";
import type { CompetitiveIntelToolPayload } from "../utils/competitiveIntelRequest.js";

const CI_REPORT_CACHE_PREFIX = "oasis.ci.report.";
const MEMORY_CACHE_KEY = "__oasisCiReportMemoryCache";

type CacheHost = Window & {
  [MEMORY_CACHE_KEY]?: Map<string, CompetitiveIntelToolPayload>;
};

let nodeMemoryCache: Map<string, CompetitiveIntelToolPayload> | null = null;

function getMemoryCache(): Map<string, CompetitiveIntelToolPayload> {
  if (typeof window !== "undefined") {
    const host = window as CacheHost;
    if (!host[MEMORY_CACHE_KEY]) {
      host[MEMORY_CACHE_KEY] = new Map();
    }
    return host[MEMORY_CACHE_KEY]!;
  }
  if (!nodeMemoryCache) {
    nodeMemoryCache = new Map();
  }
  return nodeMemoryCache;
}

function cacheKey(reportId: string): string {
  return `${CI_REPORT_CACHE_PREFIX}${reportId}`;
}

function normalizePayload(
  reportId: string,
  parsed: CompetitiveIntelToolPayload
): CompetitiveIntelToolPayload | null {
  if (
    !parsed ||
    typeof parsed.markdown !== "string" ||
    !parsed.report ||
    typeof parsed.report !== "object"
  ) {
    return null;
  }
  return {
    markdown: parsed.markdown,
    report: parsed.report as CompetitiveIntelReport,
    reportId: typeof parsed.reportId === "string" ? parsed.reportId : reportId,
    reportMode:
      parsed.reportMode === "full" || parsed.reportMode === "compact"
        ? parsed.reportMode
        : undefined,
    budgetNote:
      typeof parsed.budgetNote === "string" ? parsed.budgetNote : undefined,
  };
}

export function storeCompetitiveIntelReportCache(
  reportId: string,
  payload: CompetitiveIntelToolPayload
): void {
  const id = String(reportId || "").trim();
  if (!id) {
    return;
  }
  getMemoryCache().set(cacheKey(id), payload);
  try {
    sessionStorage.setItem(cacheKey(id), JSON.stringify(payload));
  } catch {
    // ignore quota failures; window-backed memory cache remains available
  }
}

export function loadCompetitiveIntelReportCache(
  reportId: string
): CompetitiveIntelToolPayload | null {
  const id = String(reportId || "").trim();
  if (!id) {
    return null;
  }
  const key = cacheKey(id);
  const memoryCache = getMemoryCache();
  const fromMemory = memoryCache.get(key);
  if (fromMemory) {
    return normalizePayload(id, fromMemory);
  }
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as CompetitiveIntelToolPayload;
    const normalized = normalizePayload(id, parsed);
    if (normalized) {
      memoryCache.set(key, normalized);
    }
    return normalized;
  } catch {
    return null;
  }
}
