const DB_NAME = "oasis_assistant_competitive_intel";
const DB_VERSION = 2;
const WORKFLOW_STORE = "workflows";
const REPORT_STORE = "reports";

export type PinnedCompetitiveIntelWorkflow = {
  userId: string;
  workflowJson: string;
  industry: string;
  step: string;
  updatedAt: number;
};

export type PinnedCompetitiveIntelReport = {
  userId: string;
  reportId: string;
  markdown: string;
  reportJson: string;
  industry: string;
  updatedAt: number;
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
      if (!db.objectStoreNames.contains(WORKFLOW_STORE)) {
        db.createObjectStore(WORKFLOW_STORE, { keyPath: "userId" });
      }
      if (!db.objectStoreNames.contains(REPORT_STORE)) {
        db.createObjectStore(REPORT_STORE, { keyPath: "userId" });
      }
    };
  });
  return dbPromise;
}

export async function savePinnedCompetitiveIntelWorkflow(
  entry: PinnedCompetitiveIntelWorkflow
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(WORKFLOW_STORE, "readwrite");
  tx.objectStore(WORKFLOW_STORE).put(entry);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadPinnedCompetitiveIntelWorkflow(
  userId: string
): Promise<PinnedCompetitiveIntelWorkflow | null> {
  const db = await openDb();
  const tx = db.transaction(WORKFLOW_STORE, "readonly");
  const row = await idbRequest<PinnedCompetitiveIntelWorkflow | undefined>(
    tx.objectStore(WORKFLOW_STORE).get(userId)
  );
  return row ?? null;
}

export async function clearPinnedCompetitiveIntelWorkflow(
  userId: string
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(WORKFLOW_STORE, "readwrite");
  tx.objectStore(WORKFLOW_STORE).delete(userId);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function savePinnedCompetitiveIntelReport(
  entry: PinnedCompetitiveIntelReport
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(REPORT_STORE, "readwrite");
  tx.objectStore(REPORT_STORE).put(entry);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadPinnedCompetitiveIntelReport(
  userId: string
): Promise<PinnedCompetitiveIntelReport | null> {
  const db = await openDb();
  const tx = db.transaction(REPORT_STORE, "readonly");
  const row = await idbRequest<PinnedCompetitiveIntelReport | undefined>(
    tx.objectStore(REPORT_STORE).get(userId)
  );
  return row ?? null;
}

export async function clearPinnedCompetitiveIntelReport(
  userId: string
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(REPORT_STORE, "readwrite");
  tx.objectStore(REPORT_STORE).delete(userId);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
