/**
 * Per-command agent step implementations (tool nodes for agentLoopDriver).
 */
import { AIMessage } from "@langchain/core/messages";

import type { Command, CmdResult } from "../commands.js";
import { AGENT_END, type AgentState } from "./agentLoopDriver.js";
import {
  clearContinuationQueue,
  setContinuationQueue,
} from "../services/interactionState.js";
import type {
  AssistantWindowLike,
  OasisRecordToolActionStart,
  OasisRecordToolActionUpdate,
} from "../types/runtime.js";
import { assistantLogger } from "../utils/assistantLogger.js";
import type { ToolResultPayload } from "./messageUtils.js";
import { splitInternalArgs } from "./agentGraphSupport.js";

export type CommandToolAgentDeps = {
  assistantWindow: AssistantWindowLike;
  messageId?: string;
};

export function createCommandToolAgent(
  command: Command,
  deps: CommandToolAgentDeps
): (state: AgentState) => Promise<Partial<AgentState>> {
  const { assistantWindow, messageId } = deps;
  return async (state: AgentState) => {
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
        next: AGENT_END,
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
}
