/**
 * Graph output stream consumer.
 *
 * Iterates over the async output of the agent stream (`graph.stream()`), filters out
 * internal tool messages, strips echoed payloads, and sends clean
 * text to the UI via `onChunk()`. Also:
 * - Saves completed turns to session history
 * - Tracks usage for subscription limits
 * - Detects infinite loops via stream guards
 *
 * Called from assistant.ts after the graph is built.
 */
import type { AssistantInputType } from "../../../shared/contracts.js";
import { assistantLogger } from "../utils/assistantLogger.js";
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
  isRecord,
  stripLeadingEchoedPayload,
  type MessageLike,
  type ToolTraceEntry,
  type UsageMeta,
} from "./messageUtils.js";
import { STREAM_GUARD_MESSAGE } from "./constants.js";

export type StreamContentData = {
  responseText: string;
  toolTrace: ToolTraceEntry[];
};

type ConsumeAssistantStreamArgs = {
  stream: AsyncIterable<Record<string, unknown>>;
  prompt: string;
  onChunk: (text: string) => void;
  inputType: AssistantInputType;
  toolCommandNames: Set<string>;
  pushCurrentTurn: (user: string, assistant: string) => void;
  trackUsage: (
    inputType: AssistantInputType,
    meta?: UsageMeta,
    content?: StreamContentData
  ) => void;
};

const LARGE_UI_CHUNK_CHARS = 24_000;

function emitStreamChunk(onChunk: (text: string) => void, text: string): void {
  const deferred = text.length >= LARGE_UI_CHUNK_CHARS;
  assistantLogger.debug("stream", "ci_chunk_emit", {
    bytes: text.length,
    deferred,
  });
  if (deferred) {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => onChunk(text));
      return;
    }
    queueMicrotask(() => onChunk(text));
    return;
  }
  onChunk(text);
}

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
  let lastUsageMeta: UsageMeta | undefined;
  const toolTrace: ToolTraceEntry[] = [];
  let currentToolStartTime: number | null = null;
  let currentToolName: string = "";
  let currentToolOutput: string = "";

  let streamGuardState = createStreamGuardState();

  for await (const state of stream) {
    if ("__end__" in state) {
      if (combinedSessionString && !isSaved) {
        pushCurrentTurn(prompt, combinedSessionString);
        trackUsage(inputType, lastUsageMeta, {
          responseText: combinedSessionString,
          toolTrace,
        });
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

      const kwargs = (msg as { additional_kwargs?: unknown }).additional_kwargs;
      if (isRecord(kwargs) && isRecord(kwargs.oasisUsageMeta)) {
        const newMeta = kwargs.oasisUsageMeta as UsageMeta;
        if (!lastUsageMeta) {
          lastUsageMeta = newMeta;
        } else {
          lastUsageMeta = {
            command_type:
              lastUsageMeta.command_type !== "other" &&
              newMeta.command_type === "other"
                ? lastUsageMeta.command_type
                : newMeta.command_type,
            user_intent:
              lastUsageMeta.user_intent !== "other" &&
              newMeta.user_intent === "other"
                ? lastUsageMeta.user_intent
                : newMeta.user_intent,
            input_tokens: newMeta.input_tokens ?? lastUsageMeta.input_tokens,
            output_tokens: newMeta.output_tokens ?? lastUsageMeta.output_tokens,
          };
        }
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
        const resolvedToolName = msgName || stepName || "unknown";
        if (currentToolName !== resolvedToolName) {
          if (currentToolName && currentToolStartTime !== null) {
            toolTrace.push({
              tool_name: currentToolName,
              invocation_index: toolTrace.length,
              status: "success",
              latency_ms: Date.now() - currentToolStartTime,
              output_summary:
                currentToolOutput.trim().slice(0, 300) || undefined,
            });
          }
          currentToolName = resolvedToolName;
          currentToolStartTime = Date.now();
          currentToolOutput = "";
        }
        toolMessageCount += 1;
        const payloadText = toolResult?.message || text;
        currentToolOutput += payloadText;
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
      if (currentToolName && currentToolStartTime !== null) {
        toolTrace.push({
          tool_name: currentToolName,
          invocation_index: toolTrace.length,
          status: "success",
          latency_ms: Date.now() - currentToolStartTime,
          output_summary: currentToolOutput.trim().slice(0, 300) || undefined,
        });
        currentToolName = "";
        currentToolStartTime = null;
        currentToolOutput = "";
      }

      const sanitizedText = stripLeadingEchoedPayload(
        String(text || "").trim(),
        recentToolPayloads
      );
      if (!sanitizedText) {
        continue;
      }

      const newContent = `${sanitizedText}\n`;
      emitStreamChunk(onChunk, newContent);
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
      emitStreamChunk(onChunk, friendlyMessage);
      combinedSessionString = friendlyMessage;
      hasEmittedUserMessage = true;
      emittedChars += friendlyMessage.length;
    }
  }

  if (combinedSessionString && !isSaved) {
    pushCurrentTurn(prompt, combinedSessionString);
    trackUsage(inputType, lastUsageMeta, {
      responseText: combinedSessionString,
      toolTrace,
    });
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
