/**
 * Message utilities — serialization and extraction helpers.
 *
 * Converts LangChain BaseMessages to wire format for the remote API,
 * extracts text content from various message shapes, detects tool
 * result payloads embedded in additional_kwargs, and strips echoed
 * tool output from assistant responses.
 */
import type { BaseMessage } from "@langchain/core/messages";

export type GraphArgs = Record<string, unknown>;

export type CommandType =
  | "info_retrieval"
  | "navigation"
  | "organization"
  | "content_transform"
  | "content_create"
  | "search"
  | "automation"
  | "system"
  | "help"
  | "other";

export type UserIntent =
  | "learning"
  | "research"
  | "work"
  | "dev"
  | "marketing"
  | "shopping"
  | "personal"
  | "entertainment"
  | "meta"
  | "other";

export type UsageMeta = {
  command_type: CommandType;
  user_intent: UserIntent;
  input_tokens: number | null;
  output_tokens: number | null;
};

const TOOL_COMMAND_TYPE_MAP: Partial<Record<string, CommandType>> = {
  open_url: "navigation",
  navigate_tab: "navigation",
  new_window: "navigation",
  open_bookmark_folder: "navigation",
  open_search_result: "navigation",
  close_tab: "organization",
  create_tab_group: "organization",
  delete_tab_group: "organization",
  rename_tab_group: "organization",
  add_tab_to_group: "organization",
  remove_tab_from_group: "organization",
  move_tab_to_new_window: "organization",
  split_tabs: "organization",
  add_split_view: "organization",
  remove_split_view: "organization",
  organize_windows: "organization",
  create_bookmark_folder: "organization",
  delete_bookmark_folder: "organization",
  rename_bookmark_folder: "organization",
  add_tab_to_bookmark_folder: "organization",
  remove_tab_from_bookmark_folder: "organization",
  list_tabs: "info_retrieval",
  list_bookmark_folders: "info_retrieval",
  list_tab_groups: "info_retrieval",
  search_memory: "search",
  get_recent_search_results: "search",
  web_search: "search",
};

export function classifyToolAction(commandName: string): UsageMeta {
  return {
    command_type: TOOL_COMMAND_TYPE_MAP[commandName] ?? "other",
    user_intent: "other",
    input_tokens: null,
    output_tokens: null,
  };
}

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

const VALID_COMMAND_TYPES = new Set<string>([
  "info_retrieval",
  "navigation",
  "organization",
  "content_transform",
  "content_create",
  "search",
  "automation",
  "system",
  "help",
  "other",
]);

const VALID_USER_INTENTS = new Set<string>([
  "learning",
  "research",
  "work",
  "dev",
  "marketing",
  "shopping",
  "personal",
  "entertainment",
  "meta",
  "other",
]);

export type ParsedChatEnvelope = {
  text: string;
  meta: UsageMeta;
};

export function parseChatEnvelope(response: unknown): ParsedChatEnvelope {
  const defaultMeta: UsageMeta = {
    command_type: "other",
    user_intent: "other",
    input_tokens: null,
    output_tokens: null,
  };

  // Extract token counts from Gemini's usage_metadata
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  if (isRecord(response)) {
    const usage = response.usage_metadata;
    if (isRecord(usage)) {
      if (typeof usage.prompt_token_count === "number") {
        inputTokens = usage.prompt_token_count;
      }
      if (typeof usage.candidates_token_count === "number") {
        outputTokens = usage.candidates_token_count;
      }
    }
  }

  const tokenMeta = { input_tokens: inputTokens, output_tokens: outputTokens };

  // The content field may already be a parsed JSON object (Gemini structured output)
  // or a JSON string we need to parse ourselves.
  if (!isRecord(response)) {
    return {
      text: extractChatContent(response),
      meta: { ...defaultMeta, ...tokenMeta },
    };
  }

  const contentField = (response as { content?: unknown }).content;

  if (isRecord(contentField)) {
    // Already a parsed object — Gemini structured output forwarded as an object
    return extractFromParsed(contentField, tokenMeta, defaultMeta);
  }

  if (typeof contentField !== "string" || !contentField.trim()) {
    return {
      text: extractChatContent(response),
      meta: { ...defaultMeta, ...tokenMeta },
    };
  }

  let jsonStr = contentField.trim();

  // Strip markdown fences the LLM may add
  const fenceMatch = jsonStr.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  // Tier 1: direct parse
  const direct = tryJsonParse(jsonStr);
  if (direct !== null) {
    return extractFromParsed(direct, tokenMeta, defaultMeta);
  }

  // Tier 2: repair unescaped control characters (most common LLM mistake —
  // actual newline/tab bytes inside a JSON string value)
  const repaired = jsonStr
    .replace(/\r\n/g, "\\n")
    .replace(/\r/g, "\\n")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
  const fromRepair = tryJsonParse(repaired);
  if (fromRepair !== null) {
    return extractFromParsed(fromRepair, tokenMeta, defaultMeta);
  }

  // Tier 3: regex extraction as last resort
  const regexResult = extractViaRegex(jsonStr, tokenMeta, defaultMeta);
  if (regexResult !== null) {
    return regexResult;
  }

  // Full fallback: display whatever came back
  return {
    text: jsonStr || contentField,
    meta: { ...defaultMeta, ...tokenMeta },
  };
}

function tryJsonParse(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function extractFromParsed(
  parsed: unknown,
  tokenMeta: { input_tokens: number | null; output_tokens: number | null },
  defaultMeta: UsageMeta
): ParsedChatEnvelope {
  if (!isRecord(parsed) || typeof parsed.response !== "string") {
    return {
      text: typeof parsed === "string" ? parsed : "",
      meta: { ...defaultMeta, ...tokenMeta },
    };
  }
  const commandType: CommandType = VALID_COMMAND_TYPES.has(
    String(parsed.command_type ?? "")
  )
    ? (parsed.command_type as CommandType)
    : "other";
  const userIntent: UserIntent = VALID_USER_INTENTS.has(
    String(parsed.user_intent ?? "")
  )
    ? (parsed.user_intent as UserIntent)
    : "other";
  return {
    text: parsed.response,
    meta: { command_type: commandType, user_intent: userIntent, ...tokenMeta },
  };
}

function extractViaRegex(
  str: string,
  tokenMeta: { input_tokens: number | null; output_tokens: number | null },
  defaultMeta: UsageMeta
): ParsedChatEnvelope | null {
  // Match "response":"<value>" where value may span multiple lines
  const responseMatch = str.match(
    /"response"\s*:\s*"([\s\S]*?)"\s*,\s*"command_type"/
  );
  if (!responseMatch) {
    return null;
  }
  const responseText = responseMatch[1]
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");

  const cmdMatch = str.match(/"command_type"\s*:\s*"([^"]+)"/);
  const intentMatch = str.match(/"user_intent"\s*:\s*"([^"]+)"/);

  const commandType: CommandType =
    cmdMatch && VALID_COMMAND_TYPES.has(cmdMatch[1])
      ? (cmdMatch[1] as CommandType)
      : "other";
  const userIntent: UserIntent =
    intentMatch && VALID_USER_INTENTS.has(intentMatch[1])
      ? (intentMatch[1] as UserIntent)
      : "other";

  return {
    text: responseText || str,
    meta: { command_type: commandType, user_intent: userIntent, ...tokenMeta },
  };
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

    if (text.startsWith(candidate)) {
      if (text.length === candidate.length) {
        continue;
      }
      text = text
        .slice(candidate.length)
        .replace(/^[\s:.,;!-]+/, "")
        .trim();
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
