/**
 * LangGraph state machine — the core execution engine.
 *
 * Defines a supervisor-worker graph with three node types:
 * - Supervisor: central routing hub that decides tool vs. chat
 * - Tool nodes: one per registered Command, executes browser actions
 * - Chat node: calls the remote LLM for natural language responses
 *
 * Flow: START → supervisor → tool/chat → supervisor → ... → END
 * Recursion limit: 24 steps. Max 3 chained commands per request.
 *
 * Called from assistant.ts via `buildAssistantGraph()`.
 */
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph/web";

import type { PendingAmbiguityPayload } from "../../../shared/contracts.js";
import type { Command, CmdResult } from "../commands.js";
import { assistRemote, type AssistTool } from "../proxyClient.js";
import {
  clearContinuationQueue,
  clearPendingAmbiguity,
  getContinuationQueue,
  getPendingAmbiguity,
  getPendingConfirmation,
  setContinuationQueue,
  setPendingAmbiguity,
  takeContinuationQueue,
} from "../services/interactionState.js";
import type {
  AssistantWindowLike,
  OasisRecordToolActionStart,
  OasisRecordToolActionUpdate,
} from "../types/runtime.js";
import { routeDeterministically } from "../utils/deterministicRouter.js";
import { assistantLogger } from "../utils/assistantLogger.js";
import { looksLikeNewActionCommand } from "../utils/routingUtils.js";
import type { PendingAmbiguityPayload as RouterPendingAmbiguityPayload } from "../utils/routerTypes.js";
import { getAssistantApiBase, QuotaExceededError } from "../awsSignedFetch.js";
import { CHAT_SYSTEM_PROMPT } from "../prompts/chatPrompt.js";
import { subscriptionService } from "../services/subscription.js";
import { buildHiddenInstruction } from "../prompts/hiddenInstructions.js";
import { buildAssistRouterPrompt } from "../prompts/routerPrompt.js";
import { MAX_NESTED_COMMANDS } from "./constants.js";

const CHAT_GENERATION_CONFIG = {
  responseMimeType: "application/json",
  responseJsonSchema: {
    type: "object",
    properties: {
      response: {
        type: "string",
        description:
          "The assistant's complete reply to the user. Use Markdown formatting: **bold**, bullet lists, `code blocks`, headings. Do NOT include raw JSON or internal data dumps.",
      },
      command_type: {
        type: "string",
        enum: [
          "info_retrieval", "navigation", "organization", "content_transform",
          "content_create", "search", "automation", "system", "help", "other",
        ],
        description:
          "The action category: info_retrieval=answer a factual question, navigation=open/visit a URL or site, organization=manage tabs/bookmarks/groups, content_transform=summarize/translate/rewrite, content_create=write/generate new content, search=find in history/memory/web, automation=multi-step browser task, system=browser settings or preferences, help=how-to question about the assistant, other=none of the above.",
      },
      user_intent: {
        type: "string",
        enum: [
          "learning", "research", "work", "dev", "marketing",
          "shopping", "personal", "entertainment", "meta", "other",
        ],
        description:
          "The user's underlying goal: learning=understand a topic, research=gather info for a decision, work=professional/business task, dev=coding or technical task, marketing=content or growth, shopping=buy or find products, personal=personal life task, entertainment=leisure/media/fun, meta=asking about the AI itself, other=none of the above.",
      },
    },
    required: ["response", "command_type", "user_intent"],
  },
};
import { extractLatestActionableText } from "./extractLatestActionableText.js";
import {
  resolvePendingAmbiguityGate,
  resolvePendingConfirmationGate,
} from "./supervisorGates.js";
import {
  buildCommandQueuePlan,
  shouldClearContinuationQueue,
} from "./supervisorQueue.js";
import { tryResolveAssistRoute } from "./supervisorAssist.js";
import { decodePlannedAction, encodePlannedAction } from "./plannedActions.js";
import { presentToolResult } from "./toolResultPresenter.js";
import {
  classifyToolAction,
  extractChatContent,
  getToolResultPayload,
  msgText,
  parseChatEnvelope,
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

const INTERNAL_CHAIN_NOTICE_ARG = "__oasisChainNotice";

function splitInternalArgs(
  args: GraphArgs
): { commandArgs: GraphArgs; chainNotice: string | null } {
  const commandArgs: GraphArgs = {};
  let chainNotice: string | null = null;

  for (const [key, value] of Object.entries(args || {})) {
    if (key === INTERNAL_CHAIN_NOTICE_ARG && typeof value === "string") {
      chainNotice = value.trim() || null;
      continue;
    }
    if (key.startsWith("__oasis")) {
      continue;
    }
    commandArgs[key] = value;
  }

  return { commandArgs, chainNotice };
}

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
  messageId?: string,
  assistToolDefs: AssistTool[] = []
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

      const { commandArgs, chainNotice } = splitInternalArgs(state.args);
      let result: CmdResult;
      try {
        result = await command.execute(commandArgs);
        if (typeof recordUpdate === "function" && actionId) {
          recordUpdate(actionId, "done");
        }
      } catch (error) {
        if (typeof recordUpdate === "function" && actionId) {
          recordUpdate(actionId, "error");
        }
        assistantLogger.error(
          "graph",
          `Command execution failed: ${command.commandName}`,
          error
        );
        result = { message: String(error) };
      }

      if (result.requiresConfirmation) {
        const remainingQueue =
          state.commandQueue.length > 1 ? state.commandQueue.slice(1) : [];
        if (remainingQueue.length > 0) {
          setContinuationQueue(remainingQueue);
        } else {
          clearContinuationQueue();
        }
        assistantLogger.debug(
          "graph",
          `Command requires confirmation: ${command.commandName}`
        );
        const confirmationMessage = String(result.message || "").trim();
        const toolResultPayload: ToolResultPayload = {
          kind: "tool_result",
          commandName: command.commandName,
          message: confirmationMessage,
        };
        return {
          messages: [
            new AIMessage({
              content: confirmationMessage,
              name: command.commandName,
              additional_kwargs: { oasisToolResult: toolResultPayload },
            }),
          ],
          lastWorker: command.commandName,
          next: END,
          args: {},
          commandQueue: state.commandQueue,
        };
      }

      const resultMessage = chainNotice
        ? `${chainNotice}\n${result.message}`
        : result.message;
      const toolResultPayload: ToolResultPayload = {
        kind: "tool_result",
        commandName: command.commandName,
        message: resultMessage,
      };

      return {
        messages: [
          new AIMessage({
            content: resultMessage,
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

  const assistTools: AssistTool[] =
    assistToolDefs.length > 0
      ? assistToolDefs
      : commands.map(command => ({
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
    const toolPayload = getToolResultPayload(lastMsg as MessageLike);
    const hasToolOutput = Boolean(toolPayload);
    const hasSummarizeRequest = lastMsgText.includes("__SUMMARIZE_REQUEST__");

    if (toolPayload && !hasSummarizeRequest) {
      return {
        messages: [
          new AIMessage({
            content: presentToolResult(toolPayload),
            additional_kwargs: { oasisUsageMeta: classifyToolAction(toolPayload.commandName) },
          }),
        ],
        lastWorker: "chat",
        commandQueue: [],
      };
    }

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
      res = await assistRemote(CHAT_SYSTEM_PROMPT, toWire(messagesWithPrompt), ["chat"], [], CHAT_GENERATION_CONFIG);
      if ((res as any)?.quota) {
        subscriptionService.updateFromQuota((res as any).quota);
      }
    } catch (error) {
      assistantLogger.warn("chat", "Assist chat call failed.", error);

      if (error instanceof QuotaExceededError || (error as any).isQuotaError) {
        if ((error as any).quota) {
          subscriptionService.updateFromQuota((error as any).quota);
        }
        return {
          messages: [new AIMessage((error as Error).message + " Please upgrade your plan via the menu.")],
          lastWorker: "chat",
          commandQueue: [],
        };
      }

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

    const { text: chatText, meta: usageMeta } = parseChatEnvelope(res);
    const trimmedText = chatText.trim();
    if (!trimmedText) {
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
      messages: [
        new AIMessage({
          content: trimmedText,
          additional_kwargs: { oasisUsageMeta: usageMeta },
        }),
      ],
      lastWorker: "chat",
      commandQueue: [],
    };
  };

  const supervisorNode = async (state: GraphStateType) => {
    const { latestTextRaw, commandLine, commandText, confirmationText } =
      extractLatestActionableText(state.messages);

    const justRanTool = memberNameSet.has(state.lastWorker);
    const justRanConfirm = state.lastWorker === "confirm_action";
    const pendingConfirmation = getPendingConfirmation();
    const confirmationGate = resolvePendingConfirmationGate({
      confirmationText,
      pendingConfirmation,
      justRanConfirm,
    });
    if (confirmationGate.kind === "route") {
      return { next: confirmationGate.next, args: confirmationGate.args };
    }
    if (confirmationGate.kind === "end") {
      return { next: END, args: {} };
    }

    const pendingAmbiguity = getPendingAmbiguity();
    const ambiguityGate = resolvePendingAmbiguityGate({
      pendingAmbiguity,
      confirmationText,
      commandText,
      lastWorker: state.lastWorker,
    });
    if (ambiguityGate.kind === "route") {
      return { next: ambiguityGate.next, args: ambiguityGate.args };
    }
    if (ambiguityGate.kind === "clear") {
      clearPendingAmbiguity();
    }

    const pendingContinuationQueue = getContinuationQueue();
    const shouldResumeContinuation =
      state.lastWorker === "confirm_action" &&
      pendingContinuationQueue.length > 0 &&
      !getPendingConfirmation();

    if (
      shouldClearContinuationQueue({
        hasContinuation: pendingContinuationQueue.length > 0,
        shouldResumeContinuation,
        justRanTool,
        commandText,
      })
    ) {
      clearContinuationQueue();
    }

    if (justRanTool) {
      if (state.commandQueue.length <= 1 && !shouldResumeContinuation) {
        return { next: "chat", args: {}, commandQueue: [] };
      }
    }

    const continuationQueue = shouldResumeContinuation
      ? takeContinuationQueue()
      : [];
    const hasQueuedCommands =
      state.commandQueue.length > 0 || continuationQueue.length > 0;
    const topLevelActionText = commandLine.toLowerCase();
    const topLevelActionLike = looksLikeNewActionCommand(topLevelActionText);

    if (!hasQueuedCommands && commandLine) {
      const topLevelAssist = await tryResolveAssistRoute({
        endpointKey,
        activeCommandText: topLevelActionText,
        commandQueueLength: 1,
        messages: state.messages,
        assistRouterPrompt,
        assistOptions,
        assistTools,
        memberNameSet,
        maxPlanActions: MAX_NESTED_COMMANDS,
      });

      if (topLevelAssist.kind === "plan") {
        const encodedQueue = topLevelAssist.actions.map(action =>
          encodePlannedAction(action)
        );
        const first = topLevelAssist.actions[0];
        if (!first) {
          return { next: "chat", args: {}, commandQueue: [] };
        }
        return {
          next: first.next,
          args: first.args,
          commandQueue: encodedQueue,
        };
      }

      if (topLevelAssist.kind === "tool") {
        const guardRoute = routeDeterministically(commandLine);
        if (
          guardRoute.type === "tool" &&
          guardRoute.next === "resolve_ambiguity" &&
          guardRoute.pendingAmbiguity
        ) {
          setRoutePendingAmbiguity(guardRoute.pendingAmbiguity);
          return {
            next: guardRoute.next,
            args: guardRoute.args,
            commandQueue: [commandLine],
          };
        }
        return {
          next: topLevelAssist.next,
          args: topLevelAssist.args,
          commandQueue: [commandLine],
        };
      }

      if (topLevelAssist.kind === "chat" && !topLevelActionLike) {
        return {
          next: "chat",
          args: { routerMessage: topLevelAssist.content },
          commandQueue: [],
        };
      }
    }

    const queuePlan = buildCommandQueuePlan({
      existingQueue: state.commandQueue,
      continuationQueue,
      latestTextRaw,
      commandLine,
      lastWorker: state.lastWorker,
      justRanTool: justRanTool && state.commandQueue.length > 0,
      maxCommands: MAX_NESTED_COMMANDS,
    });
    if (!queuePlan) {
      return { next: "chat", args: {}, commandQueue: [] };
    }
    const { commandQueue, activeCommand, truncationNotice } = queuePlan;
    const applyNoticeToArgs = (args: GraphArgs): GraphArgs =>
      truncationNotice
        ? { ...args, [INTERNAL_CHAIN_NOTICE_ARG]: truncationNotice }
        : args;
    const applyNoticeToMessage = (message: string): string =>
      truncationNotice ? `${truncationNotice}\n${message}` : message;

    const plannedAction = decodePlannedAction(activeCommand);
    if (plannedAction) {
      return {
        next: plannedAction.next,
        args: applyNoticeToArgs(plannedAction.args),
        commandQueue,
      };
    }

    const activeCommandText = activeCommand.toLowerCase();
    const actionLikeCommand = looksLikeNewActionCommand(activeCommandText);
    const assistRoute = await tryResolveAssistRoute({
      endpointKey,
      activeCommandText,
      commandQueueLength: commandQueue.length,
      messages: state.messages,
      assistRouterPrompt,
      assistOptions,
      assistTools,
      memberNameSet,
      maxPlanActions: MAX_NESTED_COMMANDS,
    });

    if (assistRoute.kind === "plan") {
      const encodedQueue = assistRoute.actions.map(action =>
        encodePlannedAction(action)
      );
      const first = assistRoute.actions[0];
      if (first) {
        return {
          next: first.next,
          args: applyNoticeToArgs(first.args),
          commandQueue: encodedQueue,
        };
      }
    }

    const route = routeDeterministically(activeCommand);
    if (assistRoute.kind === "tool") {
      if (
        route.type === "tool" &&
        route.next === "resolve_ambiguity" &&
        route.pendingAmbiguity
      ) {
        setRoutePendingAmbiguity(route.pendingAmbiguity);
        return { next: route.next, args: applyNoticeToArgs(route.args), commandQueue };
      }
      return {
        next: assistRoute.next,
        args: applyNoticeToArgs(assistRoute.args),
        commandQueue,
      };
    }
    if (assistRoute.kind === "chat") {
      if (actionLikeCommand) {
        assistantLogger.debug(
          "router",
          "Ignoring assist chat response for action-like command"
        );
      } else {
        return {
          next: "chat",
          args: { routerMessage: applyNoticeToMessage(assistRoute.content) },
          commandQueue: [],
        };
      }
    }

    if (route.type === "tool") {
      if (route.pendingAmbiguity) {
        setRoutePendingAmbiguity(route.pendingAmbiguity);
      }
      return { next: route.next, args: applyNoticeToArgs(route.args), commandQueue };
    }

    if (route.type === "chat") {
      return {
        next: "chat",
        args: { routerMessage: applyNoticeToMessage(route.message) },
        commandQueue: [],
      };
    }

    return {
      next: "chat",
      args: truncationNotice ? { routerMessage: truncationNotice } : {},
      commandQueue: [],
    };
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
