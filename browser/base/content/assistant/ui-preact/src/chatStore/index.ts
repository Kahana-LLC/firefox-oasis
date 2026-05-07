import type { AssistantMessage } from "../types";

export type ChatConversationRow = {
  id: string;
  userId: string;
  title: string;
  updatedAt: number;
};

export type ChatMessageRow = {
  id: string;
  conversationId: string;
  role: "user" | "ai";
  content: string;
  sortOrder: number;
};

const DB_NAME = "oasis_assistant_chats";
const DB_VERSION = 1;

const STORE_KV = "kv";
const STORE_CONVERSATIONS = "conversations";
const STORE_MESSAGES = "messages";

function activeKey(userId: string): string {
  return `active:${userId}`;
}

function idbRequest<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () =>
      reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function idbTransactionComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () =>
      reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }
  dbPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_KV)) {
          db.createObjectStore(STORE_KV, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(STORE_CONVERSATIONS)) {
          const c = db.createObjectStore(STORE_CONVERSATIONS, {
            keyPath: "id",
          });
          c.createIndex("byUser", "userId", { unique: false });
          c.createIndex("byUserUpdated", ["userId", "updatedAt"], {
            unique: false,
          });
        }
        if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
          const m = db.createObjectStore(STORE_MESSAGES, { keyPath: "id" });
          m.createIndex("byConversation", "conversationId", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () =>
        reject(req.error ?? new Error("IndexedDB open failed"));
    } catch (e) {
      reject(e);
    }
  });
  return dbPromise;
}

async function kvGet(key: string): Promise<unknown> {
  const db = await openDb();
  const tx = db.transaction(STORE_KV, "readonly");
  const store = tx.objectStore(STORE_KV);
  const row = await idbRequest<{ key: string; value: unknown } | undefined>(
    store.get(key)
  );
  await idbTransactionComplete(tx);
  return row?.value;
}

async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_KV, "readwrite");
  tx.objectStore(STORE_KV).put({ key, value });
  await idbTransactionComplete(tx);
}

export async function getActiveConversationId(
  userId: string
): Promise<string | null> {
  const v = await kvGet(activeKey(userId));
  return typeof v === "string" ? v : null;
}

export async function setActiveConversationId(
  userId: string,
  conversationId: string | null
): Promise<void> {
  if (conversationId == null) {
    const db = await openDb();
    const tx = db.transaction(STORE_KV, "readwrite");
    tx.objectStore(STORE_KV).delete(activeKey(userId));
    await idbTransactionComplete(tx);
    return;
  }
  await kvSet(activeKey(userId), conversationId);
}

export function titleFromFirstUserMessage(
  messages: AssistantMessage[]
): string {
  const first = messages.find(m => m.role === "user" && m.content.trim());
  if (!first) {
    return "New chat";
  }
  const t = first.content.replace(/\s+/g, " ").trim();
  return t.length > 48 ? `${t.slice(0, 47)}…` : t;
}

export async function listConversations(
  userId: string
): Promise<ChatConversationRow[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_CONVERSATIONS, "readonly");
  const index = tx.objectStore(STORE_CONVERSATIONS).index("byUser");
  const rows = await idbRequest<ChatConversationRow[]>(index.getAll(userId));
  await idbTransactionComplete(tx);
  rows.sort((a, b) => b.updatedAt - a.updatedAt);
  return rows;
}

export async function createConversation(
  userId: string,
  initialTitle = "New chat"
): Promise<string> {
  const db = await openDb();
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `conv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const row: ChatConversationRow = {
    id,
    userId,
    title: initialTitle,
    updatedAt: Date.now(),
  };
  const tx = db.transaction([STORE_CONVERSATIONS, STORE_KV], "readwrite");
  tx.objectStore(STORE_CONVERSATIONS).put(row);
  tx.objectStore(STORE_KV).put({ key: activeKey(userId), value: id });
  await idbTransactionComplete(tx);
  return id;
}

export async function updateConversationMeta(
  id: string,
  patch: Partial<Pick<ChatConversationRow, "title" | "updatedAt">>
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_CONVERSATIONS, "readwrite");
  const store = tx.objectStore(STORE_CONVERSATIONS);
  const cur = await idbRequest<ChatConversationRow | undefined>(store.get(id));
  if (!cur) {
    await idbTransactionComplete(tx);
    return;
  }
  store.put({
    ...cur,
    ...patch,
    updatedAt: patch.updatedAt ?? cur.updatedAt,
  });
  await idbTransactionComplete(tx);
}

export async function deleteConversation(
  userId: string,
  conversationId: string
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(
    [STORE_MESSAGES, STORE_CONVERSATIONS, STORE_KV],
    "readwrite"
  );
  const msgStore = tx.objectStore(STORE_MESSAGES);
  const idx = msgStore.index("byConversation");
  const keys = await idbRequest<IDBValidKey[]>(idx.getAllKeys(conversationId));
  for (const k of keys) {
    msgStore.delete(k);
  }
  tx.objectStore(STORE_CONVERSATIONS).delete(conversationId);
  const active = await idbRequest<{ key: string; value: unknown } | undefined>(
    tx.objectStore(STORE_KV).get(activeKey(userId))
  );
  if (active && active.value === conversationId) {
    tx.objectStore(STORE_KV).delete(activeKey(userId));
  }
  await idbTransactionComplete(tx);
}

export async function getMessages(
  conversationId: string
): Promise<ChatMessageRow[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_MESSAGES, "readonly");
  const idx = tx.objectStore(STORE_MESSAGES).index("byConversation");
  const rows = await idbRequest<ChatMessageRow[]>(idx.getAll(conversationId));
  await idbTransactionComplete(tx);
  rows.sort((a, b) => a.sortOrder - b.sortOrder);
  return rows;
}

export async function replaceMessages(
  conversationId: string,
  messages: AssistantMessage[]
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_MESSAGES, "readwrite");
  const msgStore = tx.objectStore(STORE_MESSAGES);
  const idx = msgStore.index("byConversation");
  const keys = await idbRequest<IDBValidKey[]>(idx.getAllKeys(conversationId));
  for (const k of keys) {
    msgStore.delete(k);
  }
  let order = 0;
  for (const m of messages) {
    msgStore.put({
      id: m.id,
      conversationId,
      role: m.role,
      content: m.content,
      sortOrder: order++,
    });
  }
  await idbTransactionComplete(tx);
}

export function rowsToAssistantMessages(
  rows: ChatMessageRow[]
): AssistantMessage[] {
  return rows.map(r => ({
    id: r.id,
    role: r.role,
    content: r.content,
  }));
}

export async function bootstrapUserChats(userId: string): Promise<{
  activeId: string;
  messages: AssistantMessage[];
}> {
  await openDb();
  let conversations = await listConversations(userId);
  let activeId = await getActiveConversationId(userId);

  if (conversations.length === 0) {
    const id = await createConversation(userId);
    return { activeId: id, messages: [] };
  }

  if (!activeId || !conversations.some(c => c.id === activeId)) {
    activeId = conversations[0].id;
    await setActiveConversationId(userId, activeId);
  }

  const rows = await getMessages(activeId);
  return { activeId, messages: rowsToAssistantMessages(rows) };
}

export async function importHistoryIfEmpty(
  userId: string,
  conversationId: string,
  loadLegacyMessages: () => Promise<AssistantMessage[]>
): Promise<boolean> {
  const conversations = await listConversations(userId);
  if (conversations.length !== 1 || conversations[0].id !== conversationId) {
    return false;
  }
  const existing = await getMessages(conversationId);
  if (existing.length > 0) {
    return false;
  }
  const migrated = await loadLegacyMessages();
  if (migrated.length === 0) {
    return false;
  }
  await replaceMessages(conversationId, migrated);
  const title = titleFromFirstUserMessage(migrated);
  await updateConversationMeta(conversationId, {
    title,
    updatedAt: Date.now(),
  });
  return true;
}
