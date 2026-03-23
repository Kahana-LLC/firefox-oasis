/** Helpers for search_memory results: builds folder-URL maps and filters stale bookmark folder entries that no longer exist. */
import {
  getMemoryDocFolderName,
  getMemoryDocSource,
  getMemoryDocUrl,
  isBookmarkFolderType,
  type MemoryMetadata,
  normalizeMemoryName,
} from "./localMemoryUtils.js";

export type SearchMemoryResult = {
  text: string;
  score: number;
  metadata: MemoryMetadata;
  url?: string;
};

export type FolderSnapshot = {
  name: string;
  items: Array<{ url: string }>;
};

export function hasBookmarkFolderCandidates(results: SearchMemoryResult[]): boolean {
  return results.some((r) => {
    const rawType = String(r.metadata?.type || "").toLowerCase();
    return isBookmarkFolderType(rawType);
  });
}

export function buildFolderUrlMap(folders: FolderSnapshot[]): Map<string, Set<string>> {
  const folderToUrls = new Map<string, Set<string>>();
  for (const folder of folders) {
    const name = normalizeMemoryName(folder?.name || "");
    if (!name) continue;
    const urls = new Set<string>();
    for (const item of folder.items || []) {
      const url = String(item?.url || "").trim();
      if (url) urls.add(url);
    }
    folderToUrls.set(name, urls);
  }
  return folderToUrls;
}

export function filterStaleBookmarkFolderResults(
  results: SearchMemoryResult[],
  folderToUrls: Map<string, Set<string>>
): { results: SearchMemoryResult[]; dropped: number } {
  let dropped = 0;
  const filtered = results.filter((result) => {
    if (getMemoryDocSource(result) !== "bookmark-folder") {
      return true;
    }
    const folderName = getMemoryDocFolderName(result);
    const folderUrls = folderToUrls.get(folderName);
    if (!folderUrls) {
      dropped++;
      return false;
    }
    const url = getMemoryDocUrl(result);
    if (!url) {
      return true;
    }
    if (!folderUrls.has(url)) {
      dropped++;
      return false;
    }
    return true;
  });
  return { results: filtered, dropped };
}
