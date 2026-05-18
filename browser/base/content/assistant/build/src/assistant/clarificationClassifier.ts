/**
 * Meta-prompting clarification classifier.
 *
 * Before routing an ambiguous user message, asks the LLM whether the
 * intent is clear. If not, the LLM returns 2-3 candidate interpretations
 * that the UI presents as options for the user to choose from.
 */
import type { BaseMessage } from "@langchain/core/messages";

import { assistRemote } from "../proxyClient.js";
import type { ClarificationOption } from "../../../shared/contracts.js";
import { assistantLogger } from "../utils/assistantLogger.js";
import { toWire } from "./messageUtils.js";

const CLARIFICATION_SYSTEM_PROMPT = [
  "You are a disambiguation classifier for a browser assistant.",
  "Given the user's latest message and conversation context, decide whether the request is clear enough to act on immediately, or whether it needs clarification.",
  "",
  "If the request is CLEAR (single unambiguous action, specific enough to execute), respond:",
  '{"need_clarification": false}',
  "",
  "If the request is AMBIGUOUS (multiple plausible interpretations, missing critical details, or could lead to unintended results), respond with exactly 2-3 candidate interpretations:",
  '{"need_clarification": true, "options": [{"id": "opt_1", "label": "<short summary>", "resolvedPrompt": "<fully self-contained reformulation>"},  ...]}',
  "",
  "Rules:",
  "- Each resolvedPrompt must be self-contained: include all context so the assistant can act without additional info.",
  "- Labels should be concise (under 10 words) and clearly distinct from each other.",
  "- Do NOT clarify trivial things; only clarify when there is genuine ambiguity about WHAT the user wants done.",
  "- Simple greetings, questions, or clearly specified commands should always return need_clarification: false.",
  "- Common commands (close tab, search X, open Y) are unambiguous — do NOT clarify those.",
  "- Only return JSON; no prose before or after.",
].join("\n");

const CLARIFICATION_GENERATION_CONFIG = {
  responseMimeType: "application/json",
  responseJsonSchema: {
    type: "object",
    properties: {
      need_clarification: {
        type: "boolean",
        description: "Whether the user's request needs clarification.",
      },
      options: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            resolvedPrompt: { type: "string" },
          },
          required: ["id", "label", "resolvedPrompt"],
        },
        description:
          "2-3 candidate interpretations when need_clarification is true.",
      },
    },
    required: ["need_clarification"],
  },
};

export type ClarificationResult =
  | { needsClarification: false }
  | { needsClarification: true; options: ClarificationOption[] };

export async function classifyClarificationNeed(params: {
  messages: BaseMessage[];
  userText: string;
}): Promise<ClarificationResult> {
  const { messages, userText } = params;

  if (userText.split(/\s+/).length <= 3) {
    return { needsClarification: false };
  }

  try {
    const wireMessages = toWire(messages.slice(-6));
    const res = await assistRemote(
      CLARIFICATION_SYSTEM_PROMPT,
      wireMessages,
      ["chat"],
      [],
      CLARIFICATION_GENERATION_CONFIG
    );

    const raw = res as Record<string, unknown>;
    let parsed: Record<string, unknown>;

    if (typeof raw.content === "string") {
      parsed = JSON.parse(raw.content);
    } else {
      parsed = raw;
    }

    if (parsed.need_clarification !== true) {
      return { needsClarification: false };
    }

    const options = parsed.options;
    if (!Array.isArray(options) || options.length < 2) {
      return { needsClarification: false };
    }

    const validOptions: ClarificationOption[] = options
      .slice(0, 3)
      .filter(
        (opt: unknown) =>
          typeof (opt as Record<string, unknown>).id === "string" &&
          typeof (opt as Record<string, unknown>).label === "string" &&
          typeof (opt as Record<string, unknown>).resolvedPrompt === "string"
      )
      .map((opt: unknown) => ({
        id: (opt as Record<string, string>).id,
        label: (opt as Record<string, string>).label,
        resolvedPrompt: (opt as Record<string, string>).resolvedPrompt,
      }));

    if (validOptions.length < 2) {
      return { needsClarification: false };
    }

    return { needsClarification: true, options: validOptions };
  } catch (error) {
    assistantLogger.warn(
      "clarification",
      "Clarification classifier failed, proceeding without.",
      error
    );
    return { needsClarification: false };
  }
}
