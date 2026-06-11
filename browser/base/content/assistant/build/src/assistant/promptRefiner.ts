/**
 * Meta-prompting refiner for messy user prompts — LLM stage.
 *
 * The supervisor first runs the deterministic pre-pass from
 * promptRefinerCore (normalization + messiness heuristics). When a
 * prompt is flagged messy, refineMessyPrompt asks the LLM to rewrite
 * it into 1-3 clean, self-contained intents, or to return
 * clarification options when the request stays genuinely ambiguous.
 */
import type { BaseMessage } from "@langchain/core/messages";

import { assistRemote } from "../proxyClient.js";
import { assistantLogger } from "../utils/assistantLogger.js";
import { toWire } from "./messageUtils.js";
import { sanitizeHistoryRefinedPrompt } from "../utils/historyQueryExtract.js";
import {
  MAX_REFINED_INTENTS,
  parseRefinerResponse,
  type PromptRefinementResult,
} from "./promptRefinerCore.js";

export {
  assessPromptMessiness,
  normalizeMessyPrompt,
  parseRefinerResponse,
  MAX_REFINED_INTENTS,
  type PromptMessiness,
  type PromptRefinementResult,
} from "./promptRefinerCore.js";

const REFINER_SYSTEM_PROMPT = [
  "You are a prompt refiner for a browser assistant.",
  "The user's latest message may be messy: typos, shorthand, rambling text with a buried request, vague references to earlier conversation, or several requests packed into one message.",
  "Rewrite it into clean, self-contained commands the assistant can act on.",
  "",
  "Respond with JSON only:",
  '{"refined": true|false, "intents": [{"refinedPrompt": "<clean self-contained command>"}], "need_clarification": true|false, "options": [{"id": "opt_1", "label": "<short summary>", "resolvedPrompt": "<fully self-contained reformulation>"}]}',
  "",
  "Rules:",
  '- If the message is already clear and contains a single request, return {"refined": false}.',
  `- If the message contains several distinct requests (including "and then", "after that", commas between verbs), you MUST split them into separate intents in execution order (max ${MAX_REFINED_INTENTS}). Never return refined: false for compound commands.`,
  "- Fix typos and expand shorthand (e.g. 'yt' means YouTube) but never change what the user wants.",
  "- For rambling messages, extract only the actionable request and drop filler.",
  "- For browsing-history requests buried in rambling text, refinedPrompt must be a short keyword search only (e.g. 'search my history for ravioli').",
  "- For multi-tab synthesis (summarize/consolidate/insights across tabs or tab groups), rewrite as a single research-brief style command.",
  "- For vague references ('that one', 'do it again'), resolve them from conversation context into explicit prompts; each refinedPrompt must stand alone with no pronouns referring to earlier turns.",
  "- Only set need_clarification: true when context cannot resolve the request; then provide exactly 2 options and leave intents empty.",
  "- Never invent details the user did not state or that are absent from context.",
  "- Only return JSON; no prose.",
].join("\n");

const REFINER_GENERATION_CONFIG = {
  responseMimeType: "application/json",
  responseJsonSchema: {
    type: "object",
    properties: {
      refined: {
        type: "boolean",
        description: "Whether the message needed rewriting.",
      },
      intents: {
        type: "array",
        items: {
          type: "object",
          properties: {
            refinedPrompt: { type: "string" },
          },
          required: ["refinedPrompt"],
        },
        description: "Clean self-contained commands in execution order.",
      },
      need_clarification: {
        type: "boolean",
        description: "Whether the request is too ambiguous to refine.",
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
          "2 candidate interpretations when clarification is needed.",
      },
    },
    required: ["refined"],
  },
};

export async function refineMessyPrompt(params: {
  messages: BaseMessage[];
  userText: string;
}): Promise<PromptRefinementResult> {
  const { messages, userText } = params;

  try {
    const wireMessages = toWire(messages.slice(-6));
    const res = await assistRemote(
      REFINER_SYSTEM_PROMPT,
      wireMessages,
      ["chat"],
      [],
      REFINER_GENERATION_CONFIG
    );

    const raw = res as Record<string, unknown>;
    let parsed: Record<string, unknown>;
    if (typeof raw.content === "string") {
      parsed = JSON.parse(raw.content);
    } else {
      parsed = raw;
    }

    const result = parseRefinerResponse(parsed);
    if (result.kind === "refined") {
      return {
        kind: "refined",
        intents: result.intents.map(intent =>
          sanitizeHistoryRefinedPrompt(intent)
        ),
      };
    }
    if (result.kind !== "clean") {
      assistantLogger.info("promptRefiner", "Refined messy prompt.", {
        userText,
        result,
      });
    }
    return result;
  } catch (error) {
    assistantLogger.warn(
      "promptRefiner",
      "Prompt refinement failed, proceeding with original text.",
      error
    );
    return { kind: "clean" };
  }
}
