/**
 * Assistant agent graph — supervisor, per-command tool nodes, and chat.
 *
 * Execution uses {@link streamAgentLoop} (explicit driver) instead of LangGraph.
 * Flow: supervisor → tool or chat → supervisor → … → END
 * Recursion limit: 24 steps. Max 3 chained commands per request.
 *
 * Called from assistant.ts via `buildAssistantGraph()`.
 */
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";

import {
  AGENT_END,
  streamAgentLoop,
  type AgentState,
} from "./agentLoopDriver.js";

import type { Command } from "../commands.js";
import { assistRemote, type AssistTool } from "../proxyClient.js";
import {
  clearContinuationQueue,
  clearPendingAmbiguity,
  clearPendingClarification,
  clearPendingConfirmation,
  clearPendingProposedAction,
  getContinuationQueue,
  getPendingAmbiguity,
  getPendingClarification,
  getPendingConfirmation,
  getPendingProposedAction,
  setPendingClarification,
  setPendingProposedAction,
  takeContinuationQueue,
} from "../services/interactionState.js";
import type { AssistantWindowLike } from "../types/runtime.js";
import { routeDeterministically } from "../utils/deterministicRouter.js";
import { assistantLogger } from "../utils/assistantLogger.js";
import { hasPageContextRequest } from "../utils/pageContextRequest.js";
import { mergeTrustedArgsOntoAssist } from "../utils/trustedRouteArgs.js";
import { displayMarkdownFromResearchBriefToolMessage } from "../utils/researchBriefRequest.js";
import { hasCompetitiveIntelMarker } from "../utils/competitiveIntelRequest.js";
import { hasCompetitiveIntelWorkflowMarker } from "../utils/competitiveIntelWorkflowRequest.js";
import {
  looksLikeNewActionCommand,
  looksLikePageContextRequest,
} from "../utils/routingUtils.js";
import { getAssistantApiBase, QuotaExceededError } from "../awsSignedFetch.js";
import { getChatSystemPrompt } from "../prompts/chatPrompt.js";
import { subscriptionService } from "../services/subscription.js";
import { buildHiddenInstruction } from "../prompts/hiddenInstructions.js";
import { buildAssistRouterPrompt } from "../prompts/routerPrompt.js";
import {
  ASSISTANT_RECURSION_LIMIT,
  INTERNAL_CHAIN_NOTICE_ARG,
  MAX_NESTED_COMMANDS,
} from "./constants.js";
import { setRoutePendingAmbiguity } from "./agentGraphSupport.js";
import { createCommandToolAgent } from "./agentSteps.js";
import { formatQuotaExceededMessage } from "../utils/quotaUserMessage.js";
import { getOasisCapabilitiesReply } from "../utils/oasisCapabilitiesFaq.js";
import {
  isSelfContainedToolResultMessage,
  selfContainedToolResultBytes,
  SELF_CONTAINED_TOOL_COMMANDS,
} from "../utils/ciReportDelivery.js";

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
        ],
        description:
          "The action category: info_retrieval=answer a factual question, navigation=open/visit a URL or site, organization=manage tabs/bookmarks/groups, content_transform=summarize/translate/rewrite, content_create=write/generate new content, search=find in history/memory/web, automation=multi-step browser task, system=browser settings or preferences, help=how-to question about the assistant, other=none of the above.",
      },
      user_intent: {
        type: "string",
        enum: [
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
        ],
        description:
          "The user's underlying goal: learning=understand a topic, research=gather info for a decision, work=professional/business task, dev=coding or technical task, marketing=content or growth, shopping=buy or find products, personal=personal life task, entertainment=leisure/media/fun, meta=asking about the AI itself, other=none of the above.",
      },
    },
    required: ["response", "command_type", "user_intent"],
  },
};
import { extractLatestActionableText } from "./extractLatestActionableText.js";
import { looksLikeCommandChain, splitCommandChain } from "./commandChain.js";
import {
  resolveCompetitiveIntelWorkflowGate,
  resolvePendingAmbiguityGate,
  resolvePendingClarificationGate,
  resolvePendingConfirmationGate,
  resolvePendingProposedActionGate,
} from "./supervisorGates.js";
import {
  detectProposedActionFromText,
  looksLikeUnbackedActionClaim,
} from "../utils/proposedActionUtils.js";
import { classifyClarificationNeed } from "./clarificationClassifier.js";
import {
  assessPromptMessiness,
  normalizeMessyPrompt,
  refineMessyPrompt,
} from "./promptRefiner.js";
import {
  consumeResearchBriefResume,
  parseResearchBriefResumePrompt,
  peekResearchBriefResumeCommand,
} from "../utils/researchBriefResume.js";
import {
  consumeCiQuotaResume,
  parseCiQuotaResumePrompt,
  peekCiQuotaResumeCommand,
  clearCiQuotaResume,
} from "../utils/ciQuotaResume.js";
import {
  consumeOrganizeTabsResume,
  parseOrganizeTabsResumePrompt,
} from "../utils/organizeTabsResume.js";
import {
  getPendingHistoryRefinement,
  resolvePendingHistoryRefinementGate,
} from "../utils/historySearchRefinement.js";
import {
  mergeDeterministicHistorySearchArgs,
  mergeDeterministicOrganizeTabsArgs,
  tryPreferDeterministicToolRoute,
  tryResolveEarlyDeterministicSupervisorRoute,
} from "../utils/preferDeterministicRoute.js";

function tryConsumeCiQuotaResumeFromGate(
  resolvedPrompt: string
): { command: string; args: Record<string, unknown> } | null {
  const optionId = parseCiQuotaResumePrompt(resolvedPrompt);
  if (!optionId) {
    return null;
  }
  const command = peekCiQuotaResumeCommand();
  const args = consumeCiQuotaResume(optionId);
  if (!args) {
    return null;
  }
  return { command, args };
}

function tryConsumeResearchBriefResumeFromGate(
  resolvedPrompt: string
): { command: string; args: Record<string, unknown> } | null {
  const optionId = parseResearchBriefResumePrompt(resolvedPrompt);
  if (!optionId) {
    return null;
  }
  const command = peekResearchBriefResumeCommand();
  const args = consumeResearchBriefResume(optionId);
  if (!args) {
    return null;
  }
  return { command, args };
}

function tryConsumeOrganizeTabsResumeFromGate(
  resolvedPrompt: string
): Record<string, unknown> | null {
  const optionId = parseOrganizeTabsResumePrompt(resolvedPrompt);
  if (!optionId) {
    return null;
  }
  return consumeOrganizeTabsResume(optionId);
}
import {
  buildCommandQueuePlan,
  shouldClearContinuationQueue,
} from "./supervisorQueue.js";
import { tryResolveAssistRoute } from "./supervisorAssist.js";
import { decodePlannedAction, encodePlannedAction } from "./plannedActions.js";
import {
  classifyToolAction,
  extractChatContent,
  getToolResultPayload,
  msgText,
  parseChatEnvelope,
  toWire,
  type GraphArgs,
  type MessageLike,
} from "./messageUtils.js";

function applyDeterministicAssistOverride(
  activeCommand: string,
  route: ReturnType<typeof routeDeterministically>
): Record<string, unknown> | null {
  const preferred = tryPreferDeterministicToolRoute(activeCommand, route);
  if (preferred) {
    return preferred.args;
  }
  return (
    mergeDeterministicHistorySearchArgs(activeCommand, route) ||
    mergeDeterministicOrganizeTabsArgs(activeCommand, route)
  );
}

export function buildAssistantGraph(
  commands: Command[],
  assistantWindow: AssistantWindowLike,
  messageId?: string,
  assistToolDefs: AssistTool[] = [],
  options?: { railroadMemoryBlock?: string }
) {
  const railroadMemoryBlock = String(options?.railroadMemoryBlock || "");
  const toolAgents: Record<
    string,
    (state: AgentState) => Promise<Partial<AgentState>>
  > = {};
  const memberNames: string[] = [];

  for (const command of commands) {
    toolAgents[command.commandName] = createCommandToolAgent(command, {
      assistantWindow,
      messageId,
    });
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

  const chatNode = async (state: AgentState) => {
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
    const toolCommandName =
      toolPayload?.commandName ||
      (typeof (lastMsg as { name?: string }).name === "string"
        ? String((lastMsg as { name: string }).name)
        : "");
    const rawToolMessage = String(
      toolPayload?.message || lastMsgText || ""
    ).trim();
    const hasToolOutput = Boolean(rawToolMessage);
    const includesPageContextRequest = hasPageContextRequest(lastMsgText);

    const capabilitiesReply = getOasisCapabilitiesReply(lastMsgText);
    if (capabilitiesReply) {
      return {
        messages: [new AIMessage(capabilitiesReply)],
        lastWorker: "chat",
        commandQueue: [],
      };
    }

    if (toolCommandName === "build_research_brief") {
      const markdown =
        displayMarkdownFromResearchBriefToolMessage(rawToolMessage);
      return {
        messages: [new AIMessage(markdown || "Research brief is ready.")],
        lastWorker: "chat",
        commandQueue: [],
      };
    }

    if (
      hasCompetitiveIntelWorkflowMarker(rawToolMessage) ||
      hasCompetitiveIntelMarker(rawToolMessage)
    ) {
      return {
        messages: [new AIMessage(rawToolMessage)],
        lastWorker: "chat",
        commandQueue: [],
      };
    }

    if (SELF_CONTAINED_TOOL_COMMANDS.has(toolCommandName) && rawToolMessage) {
      return {
        messages: [new AIMessage(rawToolMessage)],
        lastWorker: "chat",
        commandQueue: [],
      };
    }

    const hiddenInstruction = buildHiddenInstruction({
      hasPageContextRequest: includesPageContextRequest,
      hasToolOutput,
    });

    const messagesWithPrompt = [
      ...state.messages,
      new HumanMessage(hiddenInstruction),
    ];

    let res: unknown;
    try {
      res = await assistRemote(
        getChatSystemPrompt() + railroadMemoryBlock,
        toWire(messagesWithPrompt),
        ["chat"],
        [],
        CHAT_GENERATION_CONFIG
      );
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
          messages: [
            new AIMessage(formatQuotaExceededMessage((error as Error).message)),
          ],
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
        messages: [
          new AIMessage("I couldn't generate a response. Please try again."),
        ],
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

  const supervisorNode = async (state: AgentState) => {
    const { latestTextRaw, commandLine, commandText, confirmationText } =
      extractLatestActionableText(state.messages);

    const justRanTool = memberNameSet.has(state.lastWorker);
    const justRanConfirm = state.lastWorker === "confirm_action";
    const pendingConfirmation = getPendingConfirmation();
    const pendingContinuationBeforeResume = getContinuationQueue();
    const proposedActionGate = resolvePendingProposedActionGate({
      confirmationText,
      pendingProposedAction: getPendingProposedAction(),
      pendingConfirmation,
      hasPendingContinuation: pendingContinuationBeforeResume.length > 0,
    });
    if (proposedActionGate.kind === "resolved") {
      clearPendingProposedAction();
      if (proposedActionGate.suggestedTool) {
        const toolArgs =
          proposedActionGate.suggestedTool === "play_video"
            ? {
                query: proposedActionGate.resolvedPrompt
                  .replace(/^play\s+/i, "")
                  .replace(/\s+on\s+youtube\s*$/i, "")
                  .trim(),
              }
            : proposedActionGate.suggestedTool === "web_search"
              ? {
                  query: proposedActionGate.resolvedPrompt
                    .replace(/^search\s+(?:the\s+web\s+)?for\s+/i, "")
                    .trim(),
                }
              : { utterance: proposedActionGate.resolvedPrompt };
        return {
          next: proposedActionGate.suggestedTool,
          args: toolArgs,
          commandQueue: [],
        };
      }
      return {
        next: "supervisor",
        args: { __clarifiedPrompt: proposedActionGate.resolvedPrompt },
        commandQueue: [],
      };
    }
    if (proposedActionGate.kind === "cancel") {
      clearPendingProposedAction();
      return {
        next: "chat",
        args: { routerMessage: "Okay, I won't do that." },
        commandQueue: [],
      };
    }

    const competitiveIntelGate = resolveCompetitiveIntelWorkflowGate({
      commandText,
      confirmationText,
      pendingConfirmation,
      hasQueuedCommands:
        state.commandQueue.length > 0 ||
        pendingContinuationBeforeResume.length > 0,
      justRanTool,
    });
    if (competitiveIntelGate.kind === "route") {
      if (competitiveIntelGate.clearPendingConfirmation) {
        clearPendingConfirmation();
      }
      return {
        next: "run_competitive_intel",
        args: competitiveIntelGate.args,
        commandQueue: [],
      };
    }
    if (competitiveIntelGate.kind === "block") {
      return {
        next: "chat",
        args: { routerMessage: competitiveIntelGate.message },
        commandQueue: [],
      };
    }

    const confirmationGate = resolvePendingConfirmationGate({
      confirmationText,
      pendingConfirmation,
      justRanConfirm,
    });
    if (confirmationGate.kind === "route") {
      return { next: confirmationGate.next, args: confirmationGate.args };
    }
    if (confirmationGate.kind === "end") {
      return { next: AGENT_END, args: {} };
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

    const pendingClarification = getPendingClarification();
    const clarificationGate = resolvePendingClarificationGate({
      pendingClarification,
      confirmationText,
      commandText,
    });
    if (clarificationGate.kind === "resolved") {
      const ciCancelId = parseCiQuotaResumePrompt(
        clarificationGate.resolvedPrompt
      );
      if (ciCancelId === "ci_quota_cancel") {
        clearPendingClarification();
        clearCiQuotaResume();
        return {
          next: "chat",
          args: {
            routerMessage:
              "Cancelled report generation. You can try again with a compact report or fewer tabs open.",
          },
          commandQueue: [],
        };
      }
      const ciResume = tryConsumeCiQuotaResumeFromGate(
        clarificationGate.resolvedPrompt
      );
      clearPendingClarification();
      if (ciResume) {
        return {
          next: ciResume.command,
          args: ciResume.args,
          commandQueue: [],
        };
      }
      const resume = tryConsumeResearchBriefResumeFromGate(
        clarificationGate.resolvedPrompt
      );
      clearPendingClarification();
      if (resume) {
        return {
          next: resume.command,
          args: resume.args,
          commandQueue: [],
        };
      }
      const organizeResumeArgs = tryConsumeOrganizeTabsResumeFromGate(
        clarificationGate.resolvedPrompt
      );
      if (organizeResumeArgs) {
        return {
          next: "organize_tabs",
          args: organizeResumeArgs,
          commandQueue: [],
        };
      }
      return {
        next: "supervisor",
        args: { __clarifiedPrompt: clarificationGate.resolvedPrompt },
        commandQueue: [],
      };
    }
    if (clarificationGate.kind === "cancel") {
      clearPendingClarification();
      return { next: "chat", args: {}, commandQueue: [] };
    }
    if (clarificationGate.kind === "clear") {
      clearPendingClarification();
    }

    const historyRefinementGate = resolvePendingHistoryRefinementGate({
      pending: getPendingHistoryRefinement(),
      userText: commandText,
    });
    if (historyRefinementGate.kind === "search") {
      return {
        next: "search_history",
        args: historyRefinementGate.args,
        commandQueue: [],
      };
    }
    if (historyRefinementGate.kind === "cancel") {
      return {
        next: "chat",
        args: {
          routerMessage: "Okay, I cancelled the history search.",
        },
        commandQueue: [],
      };
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

    const hasChainRemaining =
      pendingContinuationQueue.length > 0 || state.commandQueue.length > 1;

    if (justRanTool && !hasChainRemaining) {
      const lastMsg = state.messages[state.messages.length - 1] as MessageLike;
      if (isSelfContainedToolResultMessage(lastMsg)) {
        const toolPayload = getToolResultPayload(lastMsg);
        const toolCommandName =
          toolPayload?.commandName ||
          (typeof lastMsg.name === "string" ? lastMsg.name : "");
        assistantLogger.debug("competitiveIntel", "ci_passthrough_end", {
          commandName: toolCommandName,
          bytes: selfContainedToolResultBytes(lastMsg),
        });
        return { next: AGENT_END, args: {}, commandQueue: [] };
      }
      return { next: "chat", args: {}, commandQueue: [] };
    }

    const continuationQueue = shouldResumeContinuation
      ? takeContinuationQueue()
      : [];

    if (shouldResumeContinuation && continuationQueue.length > 0) {
      const nextCommand = continuationQueue[0];
      const nextRoute = routeDeterministically(nextCommand);
      const nextResolved = tryResolveEarlyDeterministicSupervisorRoute(
        nextCommand,
        nextRoute
      );
      if (nextResolved) {
        return {
          next: nextResolved.next,
          args: nextResolved.args,
          commandQueue: continuationQueue,
        };
      }
    }
    const hasQueuedCommands =
      state.commandQueue.length > 0 || continuationQueue.length > 0;

    const clarifiedPrompt =
      typeof state.args?.__clarifiedPrompt === "string"
        ? state.args.__clarifiedPrompt
        : "";
    const effectiveCommandLine = clarifiedPrompt || commandLine;
    const topLevelActionText = effectiveCommandLine.toLowerCase();
    const topLevelActionLike = looksLikeNewActionCommand(topLevelActionText);
    const topLevelPageContextRequest =
      looksLikePageContextRequest(effectiveCommandLine);

    if (
      !hasQueuedCommands &&
      !clarifiedPrompt &&
      looksLikeCommandChain(latestTextRaw || effectiveCommandLine)
    ) {
      const chain = splitCommandChain(
        latestTextRaw || effectiveCommandLine,
        MAX_NESTED_COMMANDS
      );
      if (chain.commands.length > 1) {
        const firstCommand = chain.commands[0];
        const firstRoute = routeDeterministically(firstCommand);
        const firstResolved = tryResolveEarlyDeterministicSupervisorRoute(
          firstCommand,
          firstRoute
        );
        if (firstResolved) {
          return {
            next: firstResolved.next,
            args: firstResolved.args,
            commandQueue: chain.commands,
          };
        }
        return {
          next: "supervisor",
          args: {},
          commandQueue: chain.commands,
        };
      }
    }

    if (!hasQueuedCommands && effectiveCommandLine) {
      const normalizedCommandLine = normalizeMessyPrompt(effectiveCommandLine);
      const earlyCandidates =
        normalizedCommandLine &&
        normalizedCommandLine.toLowerCase() !==
          effectiveCommandLine.toLowerCase()
          ? [effectiveCommandLine, normalizedCommandLine]
          : [effectiveCommandLine];
      for (const candidateLine of earlyCandidates) {
        const earlyRoute = routeDeterministically(candidateLine);
        const earlyResolved = tryResolveEarlyDeterministicSupervisorRoute(
          candidateLine,
          earlyRoute
        );
        if (earlyResolved) {
          return {
            next: earlyResolved.next,
            args: earlyResolved.args,
            commandQueue: [],
          };
        }
      }
    }

    if (
      !hasQueuedCommands &&
      effectiveCommandLine &&
      !clarifiedPrompt &&
      !topLevelPageContextRequest
    ) {
      const refinementInput = latestTextRaw || effectiveCommandLine;
      const messiness = assessPromptMessiness(refinementInput);
      const chainAlreadySplit =
        looksLikeCommandChain(refinementInput) &&
        splitCommandChain(refinementInput, MAX_NESTED_COMMANDS).commands
          .length > 1;
      const shouldRefine =
        messiness.messy &&
        !(
          chainAlreadySplit &&
          messiness.reasons.length === 1 &&
          messiness.reasons[0] === "compound"
        );
      if (shouldRefine) {
        const refinement = await refineMessyPrompt({
          messages: state.messages,
          userText: refinementInput,
        });
        if (refinement.kind === "refined") {
          if (refinement.intents.length === 1) {
            return {
              next: "supervisor",
              args: { __clarifiedPrompt: refinement.intents[0] },
              commandQueue: [],
            };
          }
          return {
            next: "supervisor",
            args: {},
            commandQueue: refinement.intents,
          };
        }
        if (refinement.kind === "clarify") {
          setPendingClarification({
            originalMessage: effectiveCommandLine,
            options: refinement.options,
          });
          const optionList = refinement.options
            .map((o, i) => `${i + 1}. ${o.label}`)
            .join("\n");
          return {
            next: "chat",
            args: {
              routerMessage: `I'd like to clarify what you mean. Please pick one:\n\n${optionList}`,
            },
            commandQueue: [],
          };
        }
      }
    }

    if (
      !hasQueuedCommands &&
      effectiveCommandLine &&
      !clarifiedPrompt &&
      topLevelActionLike &&
      !topLevelPageContextRequest
    ) {
      const clarification = await classifyClarificationNeed({
        messages: state.messages,
        userText: effectiveCommandLine,
      });
      if (clarification.needsClarification) {
        setPendingClarification({
          originalMessage: effectiveCommandLine,
          options: clarification.options,
        });
        const optionList = clarification.options
          .map((o, i) => `${i + 1}. ${o.label}`)
          .join("\n");
        return {
          next: "chat",
          args: {
            routerMessage: `I'd like to clarify what you mean. Please pick one:\n\n${optionList}`,
          },
          commandQueue: [],
        };
      }
    }

    if (!hasQueuedCommands && effectiveCommandLine) {
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
        railroadMemoryBlock,
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
          args: mergeTrustedArgsOntoAssist(
            first.next,
            first.args,
            effectiveCommandLine
          ),
          commandQueue: encodedQueue,
        };
      }

      if (topLevelAssist.kind === "tool") {
        const guardRoute = routeDeterministically(commandLine);
        const deterministicOverride = applyDeterministicAssistOverride(
          commandLine,
          guardRoute
        );
        if (deterministicOverride && guardRoute.type === "tool") {
          return {
            next: guardRoute.next,
            args: deterministicOverride,
            commandQueue: [commandLine],
          };
        }
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
          args: mergeTrustedArgsOntoAssist(
            topLevelAssist.next,
            topLevelAssist.args,
            effectiveCommandLine
          ),
          commandQueue: [commandLine],
        };
      }

      if (topLevelAssist.kind === "chat" && !topLevelActionLike) {
        const proposal = detectProposedActionFromText(topLevelAssist.content);
        if (proposal) {
          setPendingProposedAction(proposal);
        }
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
      justRanTool:
        justRanTool &&
        (state.commandQueue.length > 1 || continuationQueue.length > 0),
      maxCommands: MAX_NESTED_COMMANDS,
    });
    if (!queuePlan) {
      return { next: "chat", args: {}, commandQueue: [] };
    }
    const { commandQueue, activeCommand, truncationNotice, source } = queuePlan;
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
    const skipAssistForChain =
      source === "continuation" ||
      source === "existing" ||
      commandQueue.length > 1;
    const assistRoute = skipAssistForChain
      ? { kind: "none" as const }
      : await tryResolveAssistRoute({
          endpointKey,
          activeCommandText,
          commandQueueLength: commandQueue.length,
          messages: state.messages,
          assistRouterPrompt,
          assistOptions,
          assistTools,
          memberNameSet,
          maxPlanActions: MAX_NESTED_COMMANDS,
          railroadMemoryBlock,
        });

    if (assistRoute.kind === "plan") {
      const encodedQueue = assistRoute.actions.map(action =>
        encodePlannedAction(action)
      );
      const first = assistRoute.actions[0];
      if (first) {
        return {
          next: first.next,
          args: applyNoticeToArgs(
            mergeTrustedArgsOntoAssist(first.next, first.args, activeCommand)
          ),
          commandQueue: encodedQueue,
        };
      }
    }

    const route = routeDeterministically(activeCommand);
    if (assistRoute.kind === "tool") {
      if (route.type === "tool") {
        const deterministicOverride = applyDeterministicAssistOverride(
          activeCommand,
          route
        );
        return {
          next: route.next,
          args: applyNoticeToArgs(deterministicOverride || route.args),
          commandQueue,
        };
      }
      return {
        next: assistRoute.next,
        args: applyNoticeToArgs(
          mergeTrustedArgsOntoAssist(
            assistRoute.next,
            assistRoute.args,
            activeCommand
          )
        ),
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
        const chatContent = applyNoticeToMessage(assistRoute.content);
        const proposal = detectProposedActionFromText(chatContent);
        if (proposal && commandQueue.length <= 1) {
          setPendingProposedAction(proposal);
        }
        if (
          looksLikeUnbackedActionClaim(chatContent) &&
          !justRanTool &&
          !memberNameSet.has(state.lastWorker)
        ) {
          return {
            next: "supervisor",
            args: {
              __clarifiedPrompt: proposal?.proposedPrompt || activeCommand,
            },
            commandQueue: [],
          };
        }
        return {
          next: "chat",
          args: { routerMessage: chatContent },
          commandQueue: [],
        };
      }
    }

    if (route.type === "tool") {
      if (route.pendingAmbiguity) {
        setRoutePendingAmbiguity(route.pendingAmbiguity);
      }
      const args =
        route.next === "search_history"
          ? { ...route.args, utterance: activeCommand }
          : route.args;
      return {
        next: route.next,
        args: applyNoticeToArgs(args),
        commandQueue,
      };
    }

    if (route.type === "chat") {
      const routerMessage = applyNoticeToMessage(route.message);
      if (
        looksLikeUnbackedActionClaim(routerMessage) &&
        !justRanTool &&
        !memberNameSet.has(state.lastWorker)
      ) {
        return {
          next: "supervisor",
          args: { __clarifiedPrompt: activeCommand },
          commandQueue: [],
        };
      }
      return {
        next: "chat",
        args: { routerMessage },
        commandQueue: [],
      };
    }

    return {
      next: "chat",
      args: truncationNotice ? { routerMessage: truncationNotice } : {},
      commandQueue: [],
    };
  };

  return {
    stream(
      input: { messages: BaseMessage[] },
      options?: { recursionLimit?: number }
    ) {
      const maxSteps = options?.recursionLimit ?? ASSISTANT_RECURSION_LIMIT;
      return streamAgentLoop({
        initialMessages: input.messages,
        maxSteps,
        supervisorNode,
        chatNode,
        toolAgents,
        memberNames,
      });
    },
  };
}
