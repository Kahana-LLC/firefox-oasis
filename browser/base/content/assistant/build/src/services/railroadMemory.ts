/**
 * Railroad Memory — long-horizon structured context (IndexedDB).
 *
 * Session key is set from the UI via window.oasisSetRailroadSessionKey
 * (typically `userId:conversationId`). Injected into assist router/chat prompts;
 * completed turns are appended as raw sessions for later compaction.
 *
 * Optional structured extraction: every N turns (see OASIS_RAILROAD_EXTRACTION_INTERVAL,
 * default 4; set 0 to disable) we call assist with Railroad.getExtractionPrompt() and
 * processExtraction on the JSON result — one extra model call, better long-term memory.
 */
import { createSession, Railroad } from "railroad-memory/browser";

import { assistRemote } from "../proxyClient.js";
import { assistantLogger } from "../utils/assistantLogger.js";
import type { AssistantWindowLike } from "../types/runtime.js";
import { parseChatEnvelope } from "../assistant/messageUtils.js";

const sessionCache = new Map<string, Promise<Railroad>>();
const extractionTurnCounts = new Map<string, number>();

const RAILROAD_EXTRACTION_GEN_CONFIG: Record<string, unknown> = {
  responseMimeType: "application/json",
  responseJsonSchema: {
    type: "object",
    properties: {
      response: {
        type: "string",
        description: "Brief acknowledgment; may be empty.",
      },
      newMemories: {
        type: "array",
        items: { type: "string" },
        description: "Standalone facts to remember for future turns.",
      },
      newDecisions: {
        type: "array",
        items: { type: "string" },
      },
      currentContext: { type: "string" },
      userUpdates: { type: "object" },
    },
    required: ["response"],
  },
};

function railroadExtractionInterval(): number {
  const raw = String(
    typeof process.env.OASIS_RAILROAD_EXTRACTION_INTERVAL === "string"
      ? process.env.OASIS_RAILROAD_EXTRACTION_INTERVAL
      : ""
  ).trim();
  if (raw === "0") {
    return 0;
  }
  if (raw === "") {
    return 4;
  }
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    return 4;
  }
  return Math.min(64, n);
}

function parseExtractionObject(text: string): Record<string, unknown> | null {
  const t = text.trim();
  if (!t) {
    return null;
  }
  try {
    const o = JSON.parse(t) as unknown;
    if (o && typeof o === "object" && !Array.isArray(o)) {
      return o as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return null;
}

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
  extractionTurnCounts.clear();
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

/**
 * Fire-and-forget: on every N-th completed turn, run assist + Railroad.processExtraction.
 * N from `OASIS_RAILROAD_EXTRACTION_INTERVAL` (default 4); 0 disables.
 */
export function maybeRunRailroadStructuredExtraction(
  win: AssistantWindowLike,
  userText: string,
  assistantMarkdown: string
): void {
  void runRailroadStructuredExtractionMaybe(win, userText, assistantMarkdown);
}

async function runRailroadStructuredExtractionMaybe(
  win: AssistantWindowLike,
  userText: string,
  assistantMarkdown: string
): Promise<void> {
  const interval = railroadExtractionInterval();
  if (interval === 0) {
    return;
  }
  const key = sessionKeyFromWindow(win);
  if (!key) {
    return;
  }
  const rr = await getRailroadForWindow(win);
  if (!rr) {
    return;
  }
  const prev = extractionTurnCounts.get(key) ?? 0;
  const next = prev + 1;
  extractionTurnCounts.set(key, next);
  if (next % interval !== 0) {
    return;
  }

  const u = String(userText || "").trim();
  const a = String(assistantMarkdown || "").trim();
  if (!u && !a) {
    return;
  }

  const block = `USER:\n${u}\n\nASSISTANT:\n${a}`.slice(0, 120_000);
  try {
    const system = Railroad.getExtractionPrompt();
    const res = await assistRemote(
      system,
      [{ role: "user", content: block }],
      ["chat"],
      [],
      RAILROAD_EXTRACTION_GEN_CONFIG
    );
    const { text } = parseChatEnvelope(res);
    const parsed = parseExtractionObject(text);
    if (!parsed || typeof parsed.response !== "string") {
      assistantLogger.debug("railroad", "extraction: no valid JSON payload");
      return;
    }
    await rr.processExtraction({
      response: parsed.response,
      newMemories: Array.isArray(parsed.newMemories)
        ? (parsed.newMemories as string[]).filter(x => typeof x === "string")
        : undefined,
      newDecisions: Array.isArray(parsed.newDecisions)
        ? (parsed.newDecisions as string[]).filter(x => typeof x === "string")
        : undefined,
      currentContext:
        typeof parsed.currentContext === "string"
          ? parsed.currentContext
          : undefined,
      userUpdates:
        parsed.userUpdates && typeof parsed.userUpdates === "object" &&
        !Array.isArray(parsed.userUpdates)
          ? (parsed.userUpdates as Record<string, unknown>)
          : undefined,
    });
    assistantLogger.debug("railroad", "extraction: processExtraction applied");
  } catch (e) {
    assistantLogger.warn("railroad", "structured extraction failed", e);
  }
}
