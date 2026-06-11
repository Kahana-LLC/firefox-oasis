import type { CachedRelevantTabSelection } from "./relevantTabTypes.js";

let cached: CachedRelevantTabSelection | null = null;

export function storeRelevantTabSelection(
  selection: CachedRelevantTabSelection
): void {
  cached = selection;
}

export function peekRelevantTabSelection(): CachedRelevantTabSelection | null {
  return cached;
}

export function consumeRelevantTabSelection(): CachedRelevantTabSelection | null {
  const value = cached;
  cached = null;
  return value;
}

export function clearRelevantTabSelection(): void {
  cached = null;
}
