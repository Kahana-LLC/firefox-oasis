export function normalizeBriefUrl(url: string): string {
  const raw = String(url || "").trim();
  if (!raw) {
    return "";
  }
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    const dropParams = [
      /^utm/i,
      /^fbclid$/i,
      /^gclid$/i,
      /^mc_eid$/i,
      /^ref$/i,
    ];
    const kept: string[] = [];
    parsed.searchParams.forEach((_, key) => {
      if (!dropParams.some(re => re.test(key))) {
        kept.push(key);
      }
    });
    const next = new URL(parsed.origin + parsed.pathname);
    for (const key of kept) {
      const values = parsed.searchParams.getAll(key);
      for (const value of values) {
        next.searchParams.append(key, value);
      }
    }
    return next.href.toLowerCase();
  } catch {
    return raw.split("#")[0].toLowerCase();
  }
}

export function dedupeTabsByUrl<T extends { url: string }>(
  items: T[]
): { items: T[]; dedupedCount: number } {
  const seen = new Set<string>();
  const kept: T[] = [];
  let dedupedCount = 0;
  for (const item of items) {
    const key = normalizeBriefUrl(item.url);
    if (key && seen.has(key)) {
      dedupedCount += 1;
      continue;
    }
    if (key) {
      seen.add(key);
    }
    kept.push(item);
  }
  return { items: kept, dedupedCount };
}
