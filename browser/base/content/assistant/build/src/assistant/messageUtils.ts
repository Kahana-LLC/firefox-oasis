import type { BaseMessage } from "@langchain/core/messages";

export type GraphArgs = Record<string, unknown>;

export type ToolResultPayload = {
  kind: "tool_result";
  commandName: string;
  message: string;
};

export type MessageLike = {
  content?: unknown;
  additional_kwargs?: unknown;
  _getType?: () => string;
  getType?: () => string;
  type?: string;
};

export type WireMsg = { role: "user" | "model"; content: string };

export type StreamMessageLike = MessageLike;
export type StreamStateValue = {
  messages?: StreamMessageLike[];
  [key: string]: unknown;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function asToolResultPayload(value: unknown): ToolResultPayload | null {
  if (!isRecord(value)) {
    return null;
  }
  const kind = value.kind;
  const commandName = value.commandName;
  const message = value.message;
  if (kind !== "tool_result") {
    return null;
  }
  if (typeof commandName !== "string" || !commandName.trim()) {
    return null;
  }
  if (typeof message !== "string") {
    return null;
  }
  return {
    kind,
    commandName,
    message,
  };
}

export function getToolResultPayload(
  message: MessageLike | null | undefined
): ToolResultPayload | null {
  if (!message) {
    return null;
  }
  const rawKwargs = message.additional_kwargs;
  if (!isRecord(rawKwargs)) {
    return null;
  }
  return asToolResultPayload(rawKwargs.oasisToolResult);
}

export function msgText(m: MessageLike | null | undefined): string {
  if (!m) return "";
  const toolResult = getToolResultPayload(m);
  if (toolResult) {
    return toolResult.message;
  }
  const c = m.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map(v =>
        typeof v === "string"
          ? v
          : typeof v === "object" && v && "text" in v
            ? String((v as { text?: unknown }).text || "")
            : ""
      )
      .join("");
  }
  return String(c ?? "");
}

export function toWire(messages: BaseMessage[]): WireMsg[] {
  return messages.map(m => {
    const role = m._getType() === "human" ? "user" : "model";
    const toolResult = getToolResultPayload(m as unknown as MessageLike);
    if (toolResult) {
      return {
        role,
        content:
          `Internal command result\n` +
          `Command: ${toolResult.commandName}\n` +
          `Result: ${toolResult.message}`,
      };
    }
    return { role, content: msgText(m) };
  });
}

export function extractChatContent(response: unknown): string {
  if (typeof response === "string") {
    return response;
  }
  if (response && typeof response === "object" && "content" in response) {
    return String((response as { content?: unknown }).content ?? "");
  }
  return "";
}

export function stripLeadingEchoedPayload(
  value: string,
  payloads: readonly string[]
): string {
  let text = String(value || "").trim();
  if (!text || payloads.length === 0) {
    return text;
  }

  for (const payload of payloads) {
    const candidate = String(payload || "").trim();
    if (!candidate) {
      continue;
    }

    if (text === candidate) {
      return "";
    }

    if (text.startsWith(candidate)) {
      text = text.slice(candidate.length).replace(/^[\s:.,;!-]+/, "").trim();
      break;
    }
  }

  return text;
}

export function hasMessages(value: unknown): value is StreamStateValue {
  return (
    !!value &&
    typeof value === "object" &&
    Array.isArray((value as { messages?: unknown }).messages)
  );
}
