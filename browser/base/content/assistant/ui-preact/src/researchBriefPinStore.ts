const DB_NAME = "oasis_assistant_research_briefs";
const DB_VERSION = 1;
const STORE = "briefs";

export type PinnedResearchBrief = {
  userId: string;
  briefId: string;
  markdown: string;
  briefJson: string;
  digestsJson: string;
  topic: string;
  scopeLabel: string;
  updatedAt: number;
  pinned: boolean;
};

function idbRequest<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () =>
      reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "userId" });
      }
    };
  });
  return dbPromise;
}

export async function savePinnedResearchBrief(
  entry: PinnedResearchBrief
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(entry);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadPinnedResearchBrief(
  userId: string
): Promise<PinnedResearchBrief | null> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const row = await idbRequest<PinnedResearchBrief | undefined>(
    tx.objectStore(STORE).get(userId)
  );
  return row ?? null;
}

export async function clearPinnedResearchBrief(userId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(userId);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
