import { marked } from "../../../../../../toolkit/content/vendor/marked/marked.mjs";
import DOMPurify from "../../../../../../toolkit/content/vendor/dompurify/dompurify.mjs";
import { HumanMessage } from "@langchain/core/messages";

import { createAssistantCommandsRegistry } from "./assistant/commandsRegistry.js";
import { ASSISTANT_RECURSION_LIMIT } from "./assistant/constants.js";
import { buildAssistantGraph } from "./assistant/graph.js";
import { createAssistantSessionController } from "./assistant/session.js";
import { consumeAssistantGraphStream } from "./assistant/stream.js";
import SupabaseAuth from "./services/supabase";
import { subscriptionService } from "./services/subscription";
import voiceInputService from "./services/voiceInput";
import { searchService } from "./services/search.js";
import { tagsService } from "./services/tags.js";
import type { AssistantWindowLike } from "./types/runtime";

const supabaseAuth = SupabaseAuth.getInstance();
const assistantWindow = window as AssistantWindowLike;
assistantWindow.supabaseAuth = supabaseAuth;
assistantWindow.voiceInputService = voiceInputService;
assistantWindow.marked = marked;
assistantWindow.DOMPurify = DOMPurify;
assistantWindow.searchService = searchService;
assistantWindow.tagsService = tagsService;

const sessionController = createAssistantSessionController(assistantWindow);

export function resetAssistantSession() {
  sessionController.resetAssistantSession();
}
assistantWindow.resetAssistantSession = resetAssistantSession;

export function getAssistantHistory() {
  return sessionController.getAssistantHistory();
}
assistantWindow.getAssistantHistory = getAssistantHistory;

export async function runAssistantStream(
  prompt: string,
  onChunk: (text: string) => void,
  inputType: "text" | "voice" = "text",
  messageId?: string
): Promise<string> {
  const isAuthenticated = await supabaseAuth.isAuthenticated();
  if (isAuthenticated) {
    const stats = await subscriptionService.checkAvailability();
    if (stats.isLimitReached) {
      const msg = `Usage limit reached (${stats.totalUnits}/${stats.limit} units). Please upgrade your plan via the menu.`;
      onChunk(msg);
      return msg;
    }
  }

  const { commands, toolCommandNames } = createAssistantCommandsRegistry();
  const graph = await buildAssistantGraph(commands, assistantWindow, messageId);
  const sessionHistory = sessionController.getCurrentSessionMessages();

  const stream = await graph.stream(
    { messages: [...sessionHistory, new HumanMessage({ content: prompt })] },
    { recursionLimit: ASSISTANT_RECURSION_LIMIT }
  );

  return consumeAssistantGraphStream({
    stream,
    prompt,
    onChunk,
    inputType,
    toolCommandNames,
    pushCurrentTurn: sessionController.pushCurrentTurn,
    trackUsage: nextInputType => {
      if (isAuthenticated) {
        subscriptionService.trackUsage(nextInputType);
      }
    },
  });
}
assistantWindow.runAssistantStream = runAssistantStream;
