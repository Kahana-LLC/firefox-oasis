/**
 * Session controller — manages conversation history.
 *
 * Imports the AssistantSession singleton from Firefox's privileged
 * module system (chrome://). Falls back to an in-memory store if
 * ChromeUtils is unavailable. Provides:
 * - getCurrentSessionMessages(): gets full history as BaseMessage[]
 * - pushCurrentTurn(): appends a user+assistant message pair
 * - resetAssistantSession(): clears all history
 */
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";

import { OASIS_EVENT_HISTORY_UPDATE } from "../../../shared/contracts.js";
import { assistantLogger } from "../utils/assistantLogger.js";
import type {
  AssistantSessionLike,
  AssistantWindowLike,
} from "../types/runtime.js";
import { msgText, type MessageLike } from "./messageUtils.js";

type SessionObserver = {
  observe: (subject: unknown, topic: string, data: string | null) => void;
};

export type PlainSessionTurn = { type: "human" | "ai"; content: string };

export type AssistantSessionController = {
  getCurrentSessionMessages: () => BaseMessage[];
  pushCurrentTurn: (user: string, assistant: string) => void;
  resetAssistantSession: () => void;
  getAssistantHistory: () => BaseMessage[];
  syncSessionFromPlainTurns: (turns: PlainSessionTurn[]) => void;
};

function createFallbackSessionStore(): AssistantSessionLike {
  let messages: unknown[] = [];
  const CAP = 24;
  return {
    get messages() {
      return [...messages];
    },
    addTurn(user: unknown, assistant: unknown) {
      messages.push(user, assistant);
      if (messages.length > CAP) {
        messages.splice(0, messages.length - CAP);
      }
    },
    clear() {
      messages = [];
    },
    setSession(nextMessages: unknown[]) {
      messages = [...nextMessages];
      if (messages.length > CAP) {
        messages.splice(0, messages.length - CAP);
      }
    },
  };
}

function importAssistantSession(
  assistantWindow: AssistantWindowLike
): AssistantSessionLike {
  if (!assistantWindow.ChromeUtils?.importESModule) {
    assistantLogger.warn(
      "session",
      "ChromeUtils unavailable, using fallback session store."
    );
    return createFallbackSessionStore();
  }

  try {
    const mod = assistantWindow.ChromeUtils.importESModule(
      "chrome://browser/content/assistant/AssistantSession.sys.mjs"
    );
    const importedSession = mod.AssistantSession as
      | AssistantSessionLike
      | undefined;
    if (importedSession) {
      assistantLogger.info("session", "Imported AssistantSession singleton.");
      return importedSession;
    }
    assistantLogger.warn(
      "session",
      "AssistantSession export missing, using fallback session store."
    );
    return createFallbackSessionStore();
  } catch (error) {
    assistantLogger.error(
      "session",
      "Failed to import AssistantSession singleton.",
      error
    );
    return createFallbackSessionStore();
  }
}

function installSessionObserver(assistantWindow: AssistantWindowLike): void {
  try {
    const services = assistantWindow.Services;
    if (!services?.obs) {
      return;
    }
    const observer: SessionObserver = {
      observe: (_subject: unknown, topic: string, _data: string | null) => {
        if (topic === "oasis-session-updated") {
          try {
            assistantWindow.dispatchEvent(
              new CustomEvent(OASIS_EVENT_HISTORY_UPDATE)
            );
          } catch {
            // no-op
          }
        }
      },
    };
    services.obs.addObserver(observer, "oasis-session-updated", false);
  } catch (error) {
    assistantLogger.error(
      "session",
      "Failed to install session observer.",
      error
    );
  }
}

function hydrateSessionMessages(session: AssistantSessionLike): BaseMessage[] {
  return session.messages.map((m): BaseMessage => {
    const message = (m || {}) as MessageLike;
    if (typeof message._getType === "function") {
      return message as BaseMessage;
    }
    if (message.type === "human") {
      return new HumanMessage(msgText(message));
    }
    if (message.type === "ai") {
      return new AIMessage(msgText(message));
    }
    return new HumanMessage(msgText(message));
  });
}

export function createAssistantSessionController(
  assistantWindow: AssistantWindowLike
): AssistantSessionController {
  const session = importAssistantSession(assistantWindow);
  installSessionObserver(assistantWindow);

  function getCurrentSessionMessages(): BaseMessage[] {
    return hydrateSessionMessages(session);
  }

  function pushCurrentTurn(user: string, assistant: string): void {
    session.addTurn(
      { type: "human", content: user },
      { type: "ai", content: assistant }
    );
  }

  function syncSessionFromPlainTurns(turns: PlainSessionTurn[]): void {
    session.setSession(
      turns.map(t => ({
        type: t.type,
        content: t.content,
      }))
    );
  }

  function resetAssistantSession(): void {
    session.clear();
    try {
      assistantWindow.dispatchEvent(
        new CustomEvent(OASIS_EVENT_HISTORY_UPDATE)
      );
    } catch {
      // no-op
    }
  }

  function getAssistantHistory(): BaseMessage[] {
    return getCurrentSessionMessages();
  }

  return {
    getCurrentSessionMessages,
    pushCurrentTurn,
    resetAssistantSession,
    getAssistantHistory,
    syncSessionFromPlainTurns,
  };
}
