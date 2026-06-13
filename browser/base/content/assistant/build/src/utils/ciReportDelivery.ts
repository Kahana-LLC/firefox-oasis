import {
  getToolResultPayload,
  msgText,
  type MessageLike,
} from "../assistant/messageUtils.js";
import { hasCompetitiveIntelMarker } from "./competitiveIntelRequest.js";
import { hasCompetitiveIntelWorkflowMarker } from "./competitiveIntelWorkflowRequest.js";

export const SELF_CONTAINED_TOOL_COMMANDS = new Set([
  "run_competitive_intel",
  "build_competitive_intel_brief",
  "build_research_brief",
  "draft_outreach_email",
]);

export function isSelfContainedToolResultMessage(
  message: MessageLike | null | undefined
): boolean {
  if (!message) {
    return false;
  }
  const toolPayload = getToolResultPayload(message);
  const toolCommandName =
    toolPayload?.commandName ||
    (typeof message.name === "string" ? message.name : "");
  const rawToolMessage = String(
    toolPayload?.message || msgText(message) || ""
  ).trim();
  if (!rawToolMessage) {
    return false;
  }
  if (
    SELF_CONTAINED_TOOL_COMMANDS.has(toolCommandName) ||
    toolCommandName === "build_research_brief"
  ) {
    return true;
  }
  return (
    hasCompetitiveIntelWorkflowMarker(rawToolMessage) ||
    hasCompetitiveIntelMarker(rawToolMessage)
  );
}

export function selfContainedToolResultBytes(
  message: MessageLike | null | undefined
): number {
  if (!message) {
    return 0;
  }
  const toolPayload = getToolResultPayload(message);
  const rawToolMessage = String(
    toolPayload?.message || msgText(message) || ""
  ).trim();
  return rawToolMessage.length;
}
