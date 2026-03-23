/**
 * Graph output stream consumer.
 *
 * Iterates over the async output of `graph.stream()`, filters out
 * internal tool messages, strips echoed payloads, and sends clean
 * text to the UI via `onChunk()`. Also:
 * - Saves completed turns to session history
 * - Tracks usage for subscription limits
 * - Detects infinite loops via stream guards
 *
 * Called from assistant.ts after the graph is built.
 */
import type { AssistantInputType } from "../../../shared/contracts.js";
import {
  advanceStreamGuard,
  createStreamGuardState,
  shouldStopForStreamGuard,
  STREAM_GUARD_DEFAULTS,
} from "../utils/streamGuards.js";
import { assistantLogger } from "../utils/assistantLogger.js";
import {
  getToolResultPayload,
  hasMessages,
  stripLeadingEchoedPayload,
  type MessageLike,
} from "./messageUtils.js";
import { STREAM_GUARD_MESSAGE } from "./constants.js";

type ConsumeAssistantStreamArgs = {
  stream: AsyncIterable<Record<string, unknown>>;
  prompt: string;
  onChunk: (text: string) => void;
  inputType: AssistantInputType;
  toolCommandNames: Set<string>;
  pushCurrentTurn: (user: string, assistant: string) => void;
  trackUsage: (inputType: AssistantInputType) => void;
};

function extractMessageText(msg: MessageLike): string {
  if (typeof msg?.content === "string") {
    return msg.content;
  }
  if (Array.isArray(msg?.content)) {
    return msg.content
      .map(c => {
        if (typeof c === "string") {
          return c;
        }
        if (typeof c === "object" && c && "text" in c) {
          const value = (c as { text?: unknown }).text;
          if (value != null) {
            return String(value);
          }
        }
        if (
          typeof c === "object" &&
          c &&
          "type" in c &&
          (c as { type?: unknown }).type === "text" &&
          "text" in c
        ) {
          return String((c as { text?: unknown }).text ?? "");
        }
        return String(c ?? "");
      })
      .join("");
  }
  if (msg?.content != null) {
    return String(msg.content);
  }
  return "";
}

export async function consumeAssistantGraphStream(
  args: ConsumeAssistantStreamArgs
): Promise<string> {
  const {
    stream,
    prompt,
    onChunk,
    inputType,
    toolCommandNames,
    pushCurrentTurn,
    trackUsage,
  } = args;

  let combinedSessionString = "";
  let toolOutputBuffer = "";
  let isSaved = false;
  let hasEmittedUserMessage = false;
  const recentToolPayloads: string[] = [];
  let toolMessageCount = 0;
  let emittedChars = 0;
  let guardTriggered = false;

  let streamGuardState = createStreamGuardState();

  for await (const state of stream) {
    if ("__end__" in state) {
      if (combinedSessionString && !isSaved) {
        pushCurrentTurn(prompt, combinedSessionString);
        trackUsage(inputType);
        isSaved = true;
      }
      break;
    }

    const step = Object.entries(state).find(([k]) => k !== "__end");
    const stepValue = step?.[1];
    const stepName = step?.[0] || "unknown";
    streamGuardState = advanceStreamGuard(streamGuardState, stepName);

    if (shouldStopForStreamGuard(streamGuardState, STREAM_GUARD_DEFAULTS)) {
      guardTriggered = true;
      assistantLogger.warn("stream", "Stream guard triggered.", {
        stepCount: streamGuardState.stepCount,
        stepName,
        sameStepStreak: streamGuardState.sameStepStreak,
      });
      if (!hasEmittedUserMessage) {
        onChunk(`${STREAM_GUARD_MESSAGE}\n`);
        combinedSessionString = STREAM_GUARD_MESSAGE;
        hasEmittedUserMessage = true;
      }
      break;
    }

    if (!hasMessages(stepValue) || !stepValue.messages) {
      continue;
    }

    const messages = stepValue.messages;
    for (const rawMessage of messages) {
      const msg = rawMessage as MessageLike;
      const text = extractMessageText(msg);
      if (!text) {
        continue;
      }

      const msgName =
        typeof (msg as { name?: unknown }).name === "string"
          ? ((msg as { name?: string }).name ?? "")
          : "";
      const toolResult = getToolResultPayload(msg);
      const isToolNodeMessage =
        toolCommandNames.has(stepName) ||
        toolCommandNames.has(msgName) ||
        !!toolResult;

      if (isToolNodeMessage) {
        toolMessageCount += 1;
        const payloadText = toolResult?.message || text;
        toolOutputBuffer += `${payloadText}\n`;
        const payload = String(payloadText || "").trim();
        if (payload) {
          recentToolPayloads.unshift(payload);
          if (recentToolPayloads.length > 8) {
            recentToolPayloads.pop();
          }
        }
        continue;
      }

      const sanitizedText = stripLeadingEchoedPayload(
        String(text || "").trim(),
        recentToolPayloads
      );
      if (!sanitizedText) {
        continue;
      }

      const newContent = `${sanitizedText}\n`;
      onChunk(newContent);
      combinedSessionString += newContent;
      emittedChars += newContent.length;
      hasEmittedUserMessage = true;
    }
  }

  if (!hasEmittedUserMessage && toolOutputBuffer) {
    const sanitizedFallback = stripLeadingEchoedPayload(
      String(toolOutputBuffer || "").trim(),
      recentToolPayloads
    );
    if (sanitizedFallback) {
      const friendlyMessage = sanitizedFallback.endsWith("\n")
        ? sanitizedFallback
        : `${sanitizedFallback}\n`;
      onChunk(friendlyMessage);
      combinedSessionString = friendlyMessage;
      hasEmittedUserMessage = true;
      emittedChars += friendlyMessage.length;
    }
  }

  if (combinedSessionString && !isSaved) {
    pushCurrentTurn(prompt, combinedSessionString);
    trackUsage(inputType);
  }

  assistantLogger.debug("stream", "Run summary", {
    steps: streamGuardState.stepCount,
    sameStepStreak: streamGuardState.sameStepStreak,
    guardTriggered,
    emittedChars,
    toolMessageCount,
  });

  return combinedSessionString || "(no output)";
}
