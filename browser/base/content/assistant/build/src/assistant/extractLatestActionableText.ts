/**
 * Extracts the latest user message from the conversation history
 * and identifies the most actionable line (one containing both
 * a verb like "open"/"close" and an object like "tab"/"folder").
 * Used by the supervisor node to get the text for routing.
 */
import type { BaseMessage } from "@langchain/core/messages";

import { msgText } from "./messageUtils.js";

export type LatestActionableText = {
  latestTextRaw: string;
  lines: string[];
  commandLine: string;
  commandText: string;
  confirmationText: string;
};

const ACTIONABLE_ENTITY_PATTERN =
  /(tab\s*group|group|tabs?|bookmark|folder|window|search|memory)/i;
const ACTIONABLE_VERB_PATTERN =
  /(delete|remove|create|make|new|add|save|move|put|list|open|close|rename|show|split|find|summarize)/i;

export function extractLatestActionableText(
  messages: BaseMessage[]
): LatestActionableText {
  const latestUserMsg = [...messages].reverse().find(m => m._getType() === "human");
  const latestTextRaw = msgText(latestUserMsg) || "";
  const lines = latestTextRaw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const commandLine =
    lines.find(
      line =>
        ACTIONABLE_ENTITY_PATTERN.test(line) &&
        ACTIONABLE_VERB_PATTERN.test(line)
    ) || latestTextRaw;

  return {
    latestTextRaw,
    lines,
    commandLine,
    commandText: commandLine.toLowerCase(),
    confirmationText: (lines[lines.length - 1] || latestTextRaw).trim(),
  };
}
