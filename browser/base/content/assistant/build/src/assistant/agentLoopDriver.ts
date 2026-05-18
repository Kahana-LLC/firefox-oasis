/**
 * Explicit agent loop driver — replaces LangGraph stream for the assistant.
 *
 * Mirrors START → supervisor → (tool | chat)* → END with the same merge
 * semantics as the former Annotation reducers (messages concat, next/args replace).
 */
import type { BaseMessage } from "@langchain/core/messages";

import { assistantLogger } from "../utils/assistantLogger.js";
import type { GraphArgs } from "./messageUtils.js";

/** LangGraph END sentinel — same string as @langchain/langgraph END. */
export const AGENT_END = "__end__";

export type AgentState = {
  messages: BaseMessage[];
  lastWorker: string;
  next: string;
  args: GraphArgs;
  commandQueue: string[];
};

export type AgentNodePatch = Partial<AgentState>;

export function mergeAgentState(prev: AgentState, patch: AgentNodePatch): AgentState {
  return {
    messages:
      patch.messages && patch.messages.length > 0
        ? [...prev.messages, ...patch.messages]
        : prev.messages,
    lastWorker: patch.lastWorker ?? prev.lastWorker,
    next:
      patch.next !== undefined && patch.next !== ""
        ? String(patch.next)
        : prev.next,
    args: patch.args !== undefined ? patch.args : prev.args,
    commandQueue:
      patch.commandQueue !== undefined ? patch.commandQueue : prev.commandQueue,
  };
}

export type AgentNode = (state: AgentState) => Promise<AgentNodePatch>;

export type AgentStreamRunnerParams = {
  initialMessages: BaseMessage[];
  maxSteps: number;
  supervisorNode: AgentNode;
  chatNode: AgentNode;
  toolAgents: Record<string, AgentNode>;
  memberNames: readonly string[];
};

/**
 * AsyncIterable compatible with consumeAssistantGraphStream: each step is
 * `{ [nodeName]: { messages?: ... } }`; final `{ __end__: true }`.
 */
export async function* streamAgentLoop(
  params: AgentStreamRunnerParams
): AsyncGenerator<Record<string, unknown>> {
  const {
    initialMessages,
    maxSteps,
    supervisorNode,
    chatNode,
    toolAgents,
    memberNames,
  } = params;

  const memberSet = new Set(memberNames);

  let state: AgentState = {
    messages: [...initialMessages],
    lastWorker: "",
    next: "",
    args: {},
    commandQueue: [],
  };

  let cursor = "supervisor";

  for (let i = 0; i < maxSteps; i++) {
    if (cursor === AGENT_END) {
      yield { __end__: true };
      return;
    }

    if (cursor === "supervisor") {
      const patch = await supervisorNode(state);
      state = mergeAgentState(state, patch);
      cursor = state.next && state.next !== "" ? state.next : AGENT_END;
      continue;
    }

    if (cursor === "chat") {
      const patch = await chatNode(state);
      state = mergeAgentState(state, patch);
      yield { chat: patch };
      yield { __end__: true };
      return;
    }

    const toolFn = toolAgents[cursor];
    if (toolFn && memberSet.has(cursor)) {
      const patch = await toolFn(state);
      state = mergeAgentState(state, patch);
      yield { [cursor]: patch };
      const nextCursor = String(patch.next ?? "supervisor");
      if (nextCursor === AGENT_END) {
        yield { __end__: true };
        return;
      }
      cursor = nextCursor;
      continue;
    }

    assistantLogger.warn("agentLoop", "Unknown graph node; stopping.", {
      cursor,
    });
    yield { __end__: true };
    return;
  }

  assistantLogger.warn("agentLoop", "Recursion limit reached; stopping.", {
    maxSteps,
  });
  yield { __end__: true };
}
