/**
 * Entry point for the Oasis AI Assistant.
 *
 * Called by the UI when the user sends a message. Orchestrates:
 * 1. Auth & subscription checks
 * 2. Command registry creation (all 30+ browser commands)
 * 3. Agent stream runner (supervisor / tools / chat via agentLoopDriver)
 * 4. Streaming execution back to the UI
 *
 * Exports `runAssistantStream` and `resetAssistantSession` onto
 * the browser's window object for the privileged shim to call.
 */
import { marked } from "../../../../../../toolkit/content/vendor/marked/marked.mjs";
import DOMPurify from "../../../../../../toolkit/content/vendor/dompurify/dompurify.mjs";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import { buildCapabilitiesOverviewMarkdown } from "./assistant/capabilitiesOverview.js";
import { createAssistantCommandsRegistry } from "./assistant/commandsRegistry.js";
import { ASSISTANT_RECURSION_LIMIT } from "./assistant/constants.js";
import { buildAssistantGraph } from "./assistant/graph.js";
import {
  getRailroadMemoryPromptBlock,
  invalidateRailroadSessionCache,
  maybeRunRailroadStructuredExtraction,
  recordRailroadTurn,
} from "./services/railroadMemory.js";
import {
  createAssistantSessionController,
  type PlainSessionTurn,
} from "./assistant/session.js";
import { consumeAssistantGraphStream } from "./assistant/stream.js";
import type { InteractionPayload, InteractionUser } from "./assistant/messageUtils.js";
import type { StreamContentData } from "./assistant/stream.js";
import {
  VOICE_CHAT_TEXT_REPLY_ADDENDUM,
  VOICE_REPLY_ADDENDUM,
} from "./prompts/voicePrompt.js";
import SupabaseAuth from "./services/supabase";
import { subscriptionService } from "./services/subscription";
import { getChromeContext, tabUrl, tabTitle } from "./services/firefoxFacade.js";
import voiceInputService from "./services/voiceInput";
import voiceAgent from "./services/voiceAgent";
import { textToSpeech } from "./proxyClient.js";
import { ENV } from "./config/env.js";
import type { AssistantWindowLike } from "./types/runtime";
import {
  OASIS_EVENT_HISTORY_UPDATE,
  type VoiceUiDelivery,
} from "../../shared/contracts.js";

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

let oasisCapabilitiesMarkdownCache: string | null = null;
function getOasisCapabilitiesMarkdown(): string {
  if (oasisCapabilitiesMarkdownCache == null) {
    const { assistTools } = createAssistantCommandsRegistry();
    oasisCapabilitiesMarkdownCache =
      buildCapabilitiesOverviewMarkdown(assistTools);
  }
  return oasisCapabilitiesMarkdownCache;
}
assistantWindow.getOasisCapabilitiesMarkdown = getOasisCapabilitiesMarkdown;

function oasisGetInteractionIdForMessage(messageId: string): string | null {
  return interactionIdByMessageId.get(messageId) ?? null;
}
assistantWindow.oasisGetInteractionIdForMessage = oasisGetInteractionIdForMessage;

function oasisPushLocalChatTurn(
  userText: string,
  assistantMarkdown: string
): void {
  sessionController.pushCurrentTurn(userText, assistantMarkdown);
  try {
    assistantWindow.dispatchEvent(new CustomEvent(OASIS_EVENT_HISTORY_UPDATE));
  } catch {
    void 0;
  }
}
assistantWindow.oasisPushLocalChatTurn = oasisPushLocalChatTurn;

let currentSessionId: string = crypto.randomUUID();

const interactionIdByMessageId = new Map<string, string>();

function storeInteractionId(messageId: string, interactionId: string): void {
  interactionIdByMessageId.set(messageId, interactionId);
  if (interactionIdByMessageId.size > 100) {
    const oldest = interactionIdByMessageId.keys().next().value;
    if (oldest) interactionIdByMessageId.delete(oldest);
  }
}

function parseOs(ua: string): string {
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "unknown";
}

export function resetAssistantSession() {
  sessionController.resetAssistantSession();
  currentSessionId = crypto.randomUUID();
}
assistantWindow.resetAssistantSession = resetAssistantSession;

export function getAssistantHistory() {
  return sessionController.getAssistantHistory();
}
assistantWindow.getAssistantHistory = getAssistantHistory;

function oasisSyncSessionFromPlainTurns(turns: PlainSessionTurn[]): void {
  sessionController.syncSessionFromPlainTurns(turns);
}
assistantWindow.oasisSyncSessionFromPlainTurns = oasisSyncSessionFromPlainTurns;

function oasisSetRailroadSessionKey(key: string | null) {
  if (key == null || key === "") {
    assistantWindow.oasisRailroadSessionKey = undefined;
  } else {
    assistantWindow.oasisRailroadSessionKey = key;
  }
  invalidateRailroadSessionCache();
}
assistantWindow.oasisSetRailroadSessionKey = oasisSetRailroadSessionKey;

export async function runAssistantStream(
  prompt: string,
  onChunk: (text: string) => void,
  inputType: "text" | "voice" = "text",
  messageId?: string,
  voiceDelivery: VoiceUiDelivery = "spoken"
): Promise<string> {
  const startTime = Date.now();
  const interactionId = crypto.randomUUID();
  const currentUser = await supabaseAuth.getCurrentUser();
  const isAuthenticated = currentUser !== null;

  let interactionPayload: InteractionPayload | undefined;
  if (ENV.RICH_TELEMETRY_ENABLED) {
    const { gBrowser } = getChromeContext();
    const activeTab = gBrowser?.selectedTab ?? null;
    let optIn = false;
    if (currentUser) {
      try {
        const { data } = await (supabaseAuth as any).supabase
          .rpc("get_personalized_training_opt_in");
        optIn = data ?? false;
      } catch {
        optIn = false;
      }
    }
    const userBlock: InteractionUser | undefined =
      optIn && currentUser
        ? {
            user_id: currentUser.id,
            email: currentUser.email ?? "",
            role: "user",
            locale: navigator.language,
            opt_in_personalized_training: true,
          }
        : undefined;
    interactionPayload = {
      interaction_id: interactionId,
      session_id: optIn ? currentSessionId : crypto.randomUUID(),
      timestamp: new Date(startTime).toISOString(),
      app_version: ENV.APP_VERSION,
      client: {
        browser_name: "Oasis",
        browser_version: ENV.APP_VERSION,
        os: parseOs(navigator.userAgent),
        platform: "desktop",
      },
      context: {
        active_tab_url: tabUrl(activeTab),
        active_tab_title: tabTitle(activeTab),
        org_tier: subscriptionService.getCachedPlanName(),
      },
      prompt: {
        text: prompt,
        language: navigator.language,
      },
      ...(userBlock ? { user: userBlock } : {}),
    };
  }

  const { commands, toolCommandNames, assistTools } =
    createAssistantCommandsRegistry();
  const railroadMemoryBlock =
    await getRailroadMemoryPromptBlock(assistantWindow);
  const graph = buildAssistantGraph(
    commands,
    assistantWindow,
    messageId,
    assistTools,
    { railroadMemoryBlock }
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

  const combined = await consumeAssistantGraphStream({
    stream,
    prompt,
    onChunk,
    inputType,
    toolCommandNames,
    pushCurrentTurn: sessionController.pushCurrentTurn,
    trackUsage: (nextInputType, meta, content?: StreamContentData) => {
      if (isAuthenticated) {
        if (messageId) {
          storeInteractionId(messageId, interactionId);
        }
        let payload = interactionPayload;
        if (ENV.RICH_TELEMETRY_ENABLED && payload && content) {
          payload = {
            ...payload,
            prompt: {
              ...payload.prompt!,
              input_tokens: meta?.input_tokens ?? null,
            },
            response: {
              text: content.responseText,
              output_tokens: meta?.output_tokens ?? null,
              latency_ms: Date.now() - startTime,
            },
            tool_trace: content.toolTrace.length > 0 ? content.toolTrace : undefined,
          };
        }
        const enrichedMeta: typeof meta = {
          ...(meta ?? { command_type: "other", user_intent: "other", input_tokens: null, output_tokens: null }),
          interaction_id: interactionId,
          ...(ENV.RICH_TELEMETRY_ENABLED && payload ? { interaction_payload: payload } : {}),
        };
        subscriptionService.trackUsage(nextInputType, undefined, enrichedMeta);
      }
    },
  });
  void recordRailroadTurn(assistantWindow, prompt, combined);
  maybeRunRailroadStructuredExtraction(assistantWindow, prompt, combined);
  return combined;
}
assistantWindow.runAssistantStream = runAssistantStream;

voiceAgent.setRunAssistant(runAssistantStream);
assistantWindow.voiceAgent = voiceAgent;
