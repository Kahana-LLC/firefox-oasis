/**
 * Entry point for the Oasis AI Assistant.
 *
 * Called by the UI when the user sends a message. Orchestrates:
 * 1. Auth & subscription checks
 * 2. Command registry creation (all 30+ browser commands)
 * 3. LangGraph state machine construction
 * 4. Streaming graph execution back to the UI
 *
 * Exports `runAssistantStream` and `resetAssistantSession` onto
 * the browser's window object for the privileged shim to call.
 */
import { marked } from "../../../../../../toolkit/content/vendor/marked/marked.mjs";
import DOMPurify from "../../../../../../toolkit/content/vendor/dompurify/dompurify.mjs";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import { createAssistantCommandsRegistry } from "./assistant/commandsRegistry.js";
import { ASSISTANT_RECURSION_LIMIT } from "./assistant/constants.js";
import { buildAssistantGraph } from "./assistant/graph.js";
import { createAssistantSessionController } from "./assistant/session.js";
import { consumeAssistantGraphStream } from "./assistant/stream.js";
import {
  VOICE_CHAT_TEXT_REPLY_ADDENDUM,
  VOICE_REPLY_ADDENDUM,
} from "./prompts/voicePrompt.js";
import SupabaseAuth from "./services/supabase";
import { subscriptionService } from "./services/subscription";
import voiceInputService from "./services/voiceInput";
import voiceAgent from "./services/voiceAgent";
import { textToSpeech } from "./proxyClient.js";
import type { AssistantWindowLike } from "./types/runtime";
import type { VoiceUiDelivery } from "../../shared/contracts.js";

const supabaseAuth = SupabaseAuth.getInstance();
const assistantWindow = window as AssistantWindowLike;
assistantWindow.supabaseAuth = supabaseAuth;
assistantWindow.subscriptionService = subscriptionService;
assistantWindow.voiceInputService = voiceInputService;
assistantWindow.textToSpeech = textToSpeech;
assistantWindow.marked = marked;
assistantWindow.DOMPurify = DOMPurify;
const aw = assistantWindow as AssistantWindowLike & {
  oasisSetOAuthCallbackBaseUrl?: (url: string) => string;
  oasisGetOAuthCallbackBaseUrl?: () => string;
};
aw.oasisSetOAuthCallbackBaseUrl = (url: string) =>
  supabaseAuth.setOAuthCallbackBaseUrl(url);
aw.oasisGetOAuthCallbackBaseUrl = () => supabaseAuth.getOAuthCallbackBaseUrl();

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
  messageId?: string,
  voiceDelivery: VoiceUiDelivery = "spoken"
): Promise<string> {
  const isAuthenticated = await supabaseAuth.isAuthenticated();

  const { commands, toolCommandNames, assistTools } =
    createAssistantCommandsRegistry();
  const graph = await buildAssistantGraph(
    commands,
    assistantWindow,
    messageId,
    assistTools
  );
  const sessionHistory = sessionController.getCurrentSessionMessages();

  const voiceSystemAddendum =
    inputType === "voice"
      ? voiceDelivery === "text_chat"
        ? VOICE_CHAT_TEXT_REPLY_ADDENDUM
        : VOICE_REPLY_ADDENDUM
      : null;

  const stream = await graph.stream(
    {
      messages: [
        ...sessionHistory,
        ...(voiceSystemAddendum
          ? [new SystemMessage(voiceSystemAddendum)]
          : []),
        new HumanMessage({ content: prompt }),
      ],
    },
    { recursionLimit: ASSISTANT_RECURSION_LIMIT }
  );

  return consumeAssistantGraphStream({
    stream,
    prompt,
    onChunk,
    inputType,
    toolCommandNames,
    pushCurrentTurn: sessionController.pushCurrentTurn,
    trackUsage: (nextInputType, meta) => {
      if (isAuthenticated) {
        subscriptionService.trackUsage(nextInputType, undefined, meta);
      }
    },
  });
}
assistantWindow.runAssistantStream = runAssistantStream;

voiceAgent.setRunAssistant(runAssistantStream);
assistantWindow.voiceAgent = voiceAgent;
