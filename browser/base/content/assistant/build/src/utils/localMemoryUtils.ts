/** Helpers for localMemory.ts: dedupe key computation, source/folder extraction, and type detection for memory documents. */
export type MemoryMetadata = {
  type?: string;
  title?: string;
  description?: string;
  url?: string;
  context?: string;
  folderName?: string;
  hubName?: string;
  hub?: string;
  bookmarkGuid?: string;
  parentGuid?: string;
  timestamp?: number;
  [key: string]: unknown;
};

export type MemoryLikeDoc = {
  text?: string;
  url?: string;
  metadata?: MemoryMetadata;
  dedupeKey?: string;
  timestamp?: number;
};

const BOOKMARK_FOLDER_TYPES = new Set(["hub_item", "bookmark_folder_item"]);

function sanitizeKeyPart(value: string): string {
  return value.replace(/\|/g, "%7C");
}

function normalizeTextForKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 256);
}

export function normalizeMemoryName(value: string): string {
  return (value || "").trim().toLowerCase();
}

export function isBookmarkFolderType(rawType: string): boolean {
  return BOOKMARK_FOLDER_TYPES.has((rawType || "").toLowerCase());
}

export function getMemoryDocSource(doc: Pick<MemoryLikeDoc, "metadata">): string {
  const rawType = String(doc?.metadata?.type || "memory").toLowerCase();
  if (isBookmarkFolderType(rawType)) {
    return "bookmark-folder";
  }
  return rawType;
}

export function getMemoryDocFolderName(doc: Pick<MemoryLikeDoc, "metadata">): string {
  return normalizeMemoryName(
    String(doc?.metadata?.folderName || doc?.metadata?.hubName || "")
  );
}

export function getMemoryDocUrl(doc: Pick<MemoryLikeDoc, "url" | "metadata">): string {
  return String(doc?.url || doc?.metadata?.url || "").trim();
}

export function computeMemoryDedupeKey(doc: MemoryLikeDoc): string {
  const source = getMemoryDocSource(doc);
  const folder = getMemoryDocFolderName(doc);
  const url = getMemoryDocUrl(doc);
  const contentKey = url || `text:${normalizeTextForKey(String(doc?.text || ""))}`;
  return `${sanitizeKeyPart(source)}|${sanitizeKeyPart(folder)}|${sanitizeKeyPart(contentKey)}`;
}
