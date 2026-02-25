import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph/web";

import type { PendingAmbiguityPayload } from "../../../shared/contracts.js";
import type { Command, CmdResult } from "../commands.js";
import { assistRemote, type AssistTool } from "../proxyClient.js";
import {
  clearPendingAmbiguity,
  getPendingAmbiguity,
  getPendingConfirmation,
  setPendingAmbiguity,
} from "../services/interactionState.js";
import {
  getAssistCapability,
  markAssistSupported,
  markAssistUnsupported,
  shouldAttemptAssist,
} from "../services/assistEndpointState.js";
import type {
  AssistantWindowLike,
  OasisRecordToolActionStart,
  OasisRecordToolActionUpdate,
} from "../types/runtime.js";
import { routeDeterministically } from "../utils/deterministicRouter.js";
import { assistantLogger } from "../utils/assistantLogger.js";
import {
  looksLikeNewActionCommand,
  parseAmbiguityResolution,
} from "../utils/routingUtils.js";
import type { PendingAmbiguityPayload as RouterPendingAmbiguityPayload } from "../utils/routerTypes.js";
import { getAssistantApiBase } from "../awsSignedFetch.js";
import { CHAT_SYSTEM_PROMPT } from "../prompts/chatPrompt.js";
import { buildHiddenInstruction } from "../prompts/hiddenInstructions.js";
import { buildAssistRouterPrompt } from "../prompts/routerPrompt.js";
import { MAX_NESTED_COMMANDS } from "./constants.js";
import { splitCommandChain } from "./commandChain.js";
import { extractLatestActionableText } from "./extractLatestActionableText.js";
import {
  extractChatContent,
  getToolResultPayload,
  isRecord,
  msgText,
  toWire,
  type GraphArgs,
  type MessageLike,
  type ToolResultPayload,
} from "./messageUtils.js";

const GraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  next: Annotation<string>({
    reducer: (_, y) => y ?? END,
    default: () => END,
  }),
  lastWorker: Annotation<string>({
    reducer: (x, y) => y ?? x ?? "",
    default: () => "",
  }),
  args: Annotation<GraphArgs>({
    reducer: (_, y) => y ?? {},
    default: () => ({}),
  }),
  commandQueue: Annotation<string[]>({
    reducer: (x, y) => y ?? x ?? [],
    default: () => [],
  }),
});

function toAmbiguityPayload(
  routePending: RouterPendingAmbiguityPayload
): PendingAmbiguityPayload {
  return {
    kind: routePending.kind || "container_target",
    name: routePending.name,
    query: routePending.query,
    all: routePending.all,
    choices: routePending.choices,
    tabIndex: routePending.tabIndex,
    verb: routePending.verb,
    originalText: routePending.originalText,
    description:
      routePending.kind === "close_delete_target"
        ? `Ambiguous close/delete target for "${routePending.name}"`
        : `Ambiguous container target for "${routePending.name}"`,
  };
}

function setRoutePendingAmbiguity(
  routePending: RouterPendingAmbiguityPayload
): void {
  setPendingAmbiguity(toAmbiguityPayload(routePending));
  assistantLogger.debug("router", "Ambiguity detected", {
    name: routePending.name,
    query: routePending.query || "",
    all: !!routePending.all,
    kind: routePending.kind || "container_target",
  });
}

type GraphStateType = typeof GraphState.State;

export async function buildAssistantGraph(
  commands: Command[],
  assistantWindow: AssistantWindowLike,
  messageId?: string
) {
  const toolAgents: Record<
    string,
    (state: GraphStateType) => Promise<Partial<GraphStateType>>
  > = {};
  const memberNames: string[] = [];

  for (const command of commands) {
    const node = async (state: GraphStateType) => {
      const recordStart = assistantWindow.oasisRecordToolActionStart as
        | OasisRecordToolActionStart
        | undefined;
      const recordUpdate = assistantWindow.oasisRecordToolActionUpdate as
        | OasisRecordToolActionUpdate
        | undefined;
      let actionId: string | undefined;

      if (typeof recordStart === "function") {
        actionId = recordStart(command.commandName, messageId);
      }

      let result: CmdResult;
      try {
        result = await command.execute(state.args);
        if (typeof recordUpdate === "function" && actionId) {
          recordUpdate(actionId, "done");
        }
      } catch (error) {
        if (typeof recordUpdate === "function" && actionId) {
          recordUpdate(actionId, "error", String(error));
        }
        assistantLogger.error(
          "graph",
          `Command execution failed: ${command.commandName}`,
          error
        );
        result = { message: String(error) };
      }

      if (result.requiresConfirmation) {
        assistantLogger.debug(
          "graph",
          `Command requires confirmation: ${command.commandName}`
        );
        return {
          messages: [new AIMessage({ content: "", name: command.commandName })],
          lastWorker: command.commandName,
          next: END,
          args: {},
          commandQueue: state.commandQueue,
        };
      }

      const toolResultPayload: ToolResultPayload = {
        kind: "tool_result",
        commandName: command.commandName,
        message: result.message,
      };

      return {
        messages: [
          new AIMessage({
            content: result.message,
            name: command.commandName,
            additional_kwargs: { oasisToolResult: toolResultPayload },
          }),
        ],
        lastWorker: command.commandName,
        next: "supervisor",
        args: {},
        commandQueue: state.commandQueue,
      };
    };

    toolAgents[command.commandName] = node;
    memberNames.push(command.commandName);
  }
  const memberNameSet = new Set(memberNames);

  const assistTools: AssistTool[] = commands.map(command => ({
    name: command.commandName,
    description: command.description,
  }));
  const assistOptions = [...memberNames, "chat"];
  const assistRouterPrompt = buildAssistRouterPrompt(memberNames);
  const endpointKey = getAssistantApiBase();

  const chatNode = async (state: GraphStateType) => {
    const routerMessage = state.args?.routerMessage;
    if (typeof routerMessage === "string" && routerMessage.trim()) {
      return {
        messages: [new AIMessage(routerMessage.trim())],
        lastWorker: "chat",
        commandQueue: [],
      };
    }

    const lastMsg = state.messages[state.messages.length - 1];
    const lastMsgText = msgText(lastMsg as MessageLike);
    const hasToolOutput = Boolean(getToolResultPayload(lastMsg as MessageLike));
    const hasSummarizeRequest = lastMsgText.includes("__SUMMARIZE_REQUEST__");
    const hiddenInstruction = buildHiddenInstruction({
      hasSummarizeRequest,
      hasToolOutput,
    });

    const messagesWithPrompt = [
      ...state.messages,
      new HumanMessage(hiddenInstruction),
    ];

    let res: unknown;
    try {
      res = await assistRemote(CHAT_SYSTEM_PROMPT, toWire(messagesWithPrompt), ["chat"]);
    } catch (error) {
      assistantLogger.warn("chat", "Assist chat call failed.", error);
      if (hasToolOutput) {
        const fallback = String(msgText(lastMsg as MessageLike) || "").trim();
        return {
          messages: [new AIMessage(fallback || "Done.")],
          lastWorker: "chat",
          commandQueue: [],
        };
      }
      return {
        messages: [
          new AIMessage(
            "I'm having trouble reaching the assistant service right now. Please try again."
          ),
        ],
        lastWorker: "chat",
        commandQueue: [],
      };
    }

    const chatText = extractChatContent(res).trim();
    if (!chatText) {
      if (hasToolOutput) {
        const fallback = String(msgText(lastMsg as MessageLike) || "").trim();
        return {
          messages: [new AIMessage(fallback || "Done.")],
          lastWorker: "chat",
          commandQueue: [],
        };
      }
      return {
        messages: [new AIMessage("I couldn't generate a response. Please try again.")],
        lastWorker: "chat",
        commandQueue: [],
      };
    }

    return {
      messages: [new AIMessage(chatText)],
      lastWorker: "chat",
      commandQueue: [],
    };
  };

  const supervisorNode = async (state: GraphStateType) => {
    const { latestTextRaw, commandLine, commandText, confirmationText } =
      extractLatestActionableText(state.messages);

    const justRanTool = memberNameSet.has(state.lastWorker);
    const justRanConfirm = state.lastWorker === "confirm_action";

    const confirmMatch = confirmationText.match(
      /^(?:yes|confirm|do\s+it|go\s+ahead|approve|ok|okay)$/i
    );
    const cancelMatch = confirmationText.match(/^(?:no|cancel|nevermind|don'?t|stop)$/i);
    const pendingConfirmation = getPendingConfirmation();

    if ((confirmMatch || cancelMatch) && pendingConfirmation && !justRanConfirm) {
      return {
        next: "confirm_action",
        args: { confirmed: !!confirmMatch },
      };
    }

    if (pendingConfirmation) {
      return { next: END, args: {} };
    }

    const pendingAmbiguity = getPendingAmbiguity();
    if (pendingAmbiguity) {
      if (state.lastWorker === "resolve_ambiguity") {
        return { next: "chat", args: {} };
      }

      const resolution = parseAmbiguityResolution(confirmationText);
      if (resolution) {
        return { next: "resolve_ambiguity", args: { target: resolution } };
      }

      const wordCount = confirmationText.split(/\s+/).filter(Boolean).length;
      if (!looksLikeNewActionCommand(commandText) && wordCount <= 3) {
        return { next: "resolve_ambiguity", args: {} };
      }

      clearPendingAmbiguity();
    }

    if (justRanTool) {
      if (state.commandQueue.length <= 1) {
        return { next: "chat", args: {}, commandQueue: [] };
      }
    }

    let commandQueue =
      state.commandQueue.length > 0
        ? [...state.commandQueue]
        : splitCommandChain(latestTextRaw || commandLine, MAX_NESTED_COMMANDS).commands;

    if (commandQueue.length === 0) {
      commandQueue = [commandLine];
    }

    if (justRanTool && commandQueue.length > 1) {
      commandQueue = commandQueue.slice(1);
    }

    const activeCommand = commandQueue[0] || commandLine;
    if (!activeCommand) {
      return { next: "chat", args: {}, commandQueue: [] };
    }

    const route = routeDeterministically(activeCommand);
    const activeCommandText = activeCommand.toLowerCase();
    const shouldTryAssistRouting =
      commandQueue.length <= 1 && looksLikeNewActionCommand(activeCommandText);
    const capability = getAssistCapability(endpointKey);

    if (shouldTryAssistRouting && shouldAttemptAssist(endpointKey)) {
      try {
        const assistMessages = toWire(state.messages.slice(-10));
        const assist = await assistRemote(
          assistRouterPrompt,
          assistMessages,
          assistOptions,
          assistTools
        );
        markAssistSupported(endpointKey);

        const assistNext =
          typeof assist?.next === "string" ? assist.next.trim() : "";
        const assistArgs = isRecord(assist?.args) ? assist.args : {};

        if (assistNext && assistNext !== "chat" && memberNameSet.has(assistNext)) {
          if (route.type === "tool" && route.next === "resolve_ambiguity" && route.pendingAmbiguity) {
            setRoutePendingAmbiguity(route.pendingAmbiguity);
            return { next: route.next, args: route.args, commandQueue };
          }

          assistantLogger.debug("router", `Assist route selected: ${assistNext}`);
          return { next: assistNext, args: assistArgs, commandQueue };
        }

        if (assistNext === "chat") {
          const content =
            typeof assist?.content === "string" ? assist.content.trim() : "";
          if (content) {
            return { next: "chat", args: { routerMessage: content }, commandQueue: [] };
          }
        }
      } catch (error) {
        const message = String(error || "");
        const assistUnsupported =
          /\b404\b|not found|post with\s*\{op:\s*"?assist"?\}/i.test(message);
        if (assistUnsupported) {
          markAssistUnsupported(endpointKey);
          assistantLogger.warn("router", "Assist endpoint unavailable, using fallback.");
        } else {
          assistantLogger.warn("router", "Assist route failed, using fallback.", error);
        }
      }
    } else if (shouldTryAssistRouting && capability === "unsupported") {
      assistantLogger.debug("router", "Assist endpoint currently cooling down.");
    }

    if (route.type === "tool") {
      if (route.pendingAmbiguity) {
        setRoutePendingAmbiguity(route.pendingAmbiguity);
      }
      return { next: route.next, args: route.args, commandQueue };
    }

    if (route.type === "chat") {
      return { next: "chat", args: { routerMessage: route.message }, commandQueue: [] };
    }

    return { next: "chat", args: {}, commandQueue: [] };
  };

  const workflow = new StateGraph(GraphState);
  for (const name of memberNames) {
    workflow.addNode(name, toolAgents[name]);
    workflow.addConditionalEdges(
      name as never,
      (x: GraphStateType) => x.next || "supervisor"
    );
  }
  workflow.addNode("chat", chatNode);
  workflow.addEdge("chat" as never, END as never);
  workflow.addNode("supervisor", supervisorNode);
  workflow.addConditionalEdges(
    "supervisor" as never,
    (x: GraphStateType) => x.next
  );
  workflow.addEdge(START as never, "supervisor" as never);

  return workflow.compile();
}
