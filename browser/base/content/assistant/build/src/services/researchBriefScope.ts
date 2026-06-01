export const MIN_EXCLUDE_QUERY_LENGTH = 3;

export type TabLikeForExclusion = {
  title: string;
  url: string;
};

export type FilterExcludedTabsOptions = {
  excludeIndices?: number[];
  excludeQueries?: string[];
};

export type FilterExcludedTabsResult<T> = {
  tabs: T[];
  excludedCount: number;
};

function normalizeExcludeQueries(queries: string[] | undefined): string[] {
  if (!Array.isArray(queries)) {
    return [];
  }
  return queries
    .map(q => String(q || "").trim())
    .filter(q => q.length >= MIN_EXCLUDE_QUERY_LENGTH);
}

function normalizeExcludeIndices(indices: number[] | undefined): Set<number> {
  const set = new Set<number>();
  if (!Array.isArray(indices)) {
    return set;
  }
  for (const value of indices) {
    if (typeof value === "number" && Number.isFinite(value)) {
      const i = Math.floor(value);
      if (i >= 1) {
        set.add(i);
      }
    }
  }
  return set;
}

export function tabMatchesExcludeQuery(
  tab: TabLikeForExclusion,
  query: string
): boolean {
  const q = query.toLowerCase();
  const title = String(tab.title || "").toLowerCase();
  const url = String(tab.url || "").toLowerCase();
  return title.includes(q) || url.includes(q);
}

export function filterExcludedTabs<T extends TabLikeForExclusion>(
  tabs: T[],
  options: FilterExcludedTabsOptions
): FilterExcludedTabsResult<T> {
  const excludeIndexSet = normalizeExcludeIndices(options.excludeIndices);
  const excludeQueries = normalizeExcludeQueries(options.excludeQueries);

  if (excludeIndexSet.size === 0 && excludeQueries.length === 0) {
    return { tabs: [...tabs], excludedCount: 0 };
  }

  const kept: T[] = [];
  let excludedCount = 0;

  tabs.forEach((tab, index) => {
    const position = index + 1;
    if (excludeIndexSet.has(position)) {
      excludedCount++;
      return;
    }
    if (excludeQueries.some(query => tabMatchesExcludeQuery(tab, query))) {
      excludedCount++;
      return;
    }
    kept.push(tab);
  });

  return { tabs: kept, excludedCount };
}

export function buildScopeLabelWithExclusions(
  baseLabel: string,
  includedCount: number,
  excludedCount: number
): string {
  if (excludedCount <= 0) {
    return `${baseLabel} (${includedCount} tabs)`;
  }
  return `${baseLabel} (${includedCount} tabs, excluded ${excludedCount})`;
}
