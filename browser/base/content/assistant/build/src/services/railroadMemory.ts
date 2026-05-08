/**
 * Railroad Memory — long-horizon structured context (IndexedDB).
 *
 * Session key is set from the UI via window.oasisSetRailroadSessionKey
 * (typically `userId:conversationId`). Injected into assist router/chat prompts;
 * completed turns are appended as raw sessions for later compaction.
 */
import { createSession, type Railroad } from "railroad-memory/browser";

import { assistantLogger } from "../utils/assistantLogger.js";
import type { AssistantWindowLike } from "../types/runtime.js";

const sessionCache = new Map<string, Promise<Railroad>>();

function sessionKeyFromWindow(win: AssistantWindowLike): string | null {
  const raw = win.oasisRailroadSessionKey;
  if (typeof raw !== "string") {
    return null;
  }
  const k = raw.trim();
  return k.length > 0 ? k : null;
}

export function invalidateRailroadSessionCache(): void {
  sessionCache.clear();
}

async function getOrCreateSession(key: string): Promise<Railroad> {
  let p = sessionCache.get(key);
  if (!p) {
    p = createSession(key, { storage: "indexedDB" });
    sessionCache.set(key, p);
  }
  return p;
}

export async function getRailroadForWindow(
  win: AssistantWindowLike
): Promise<Railroad | null> {
  const key = sessionKeyFromWindow(win);
  if (!key) {
    return null;
  }
  try {
    return await getOrCreateSession(key);
  } catch (e) {
    assistantLogger.warn("railroad", "Session init failed", e);
    return null;
  }
}

/** Markdown block appended to router / chat system prompts. */
export async function getRailroadMemoryPromptBlock(
  win: AssistantWindowLike
): Promise<string> {
  const rr = await getRailroadForWindow(win);
  if (!rr) {
    return "";
  }
  try {
    const block = await rr.getPrunedPrompt();
    const t = String(block || "").trim();
    if (!t) {
      return "";
    }
    return `\n\n## Long-term memory (Railroad)\n${t}\n`;
  } catch (e) {
    assistantLogger.warn("railroad", "getPrunedPrompt failed", e);
    return "";
  }
}

export async function recordRailroadTurn(
  win: AssistantWindowLike,
  userText: string,
  assistantMarkdown: string
): Promise<void> {
  const rr = await getRailroadForWindow(win);
  if (!rr) {
    return;
  }
  const u = String(userText || "").trim();
  const a = String(assistantMarkdown || "").trim();
  if (!u && !a) {
    return;
  }
  try {
    await rr.addRawSession(`User:\n${u}\n\nAssistant:\n${a}`);
    await rr.incrementMessageCount();
  } catch (e) {
    assistantLogger.warn("railroad", "addRawSession failed", e);
  }
}
