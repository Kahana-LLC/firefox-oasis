import { splitCommandChain } from "./commandChain.js";
import { looksLikeNewActionCommand } from "../utils/routingUtils.js";

export type QueueSource = "existing" | "continuation" | "parsed";

export type CommandQueuePlan = {
  commandQueue: string[];
  activeCommand: string;
  source: QueueSource;
  truncated: boolean;
  truncationNotice: string | null;
};

export function buildCommandQueuePlan(params: {
  existingQueue: string[];
  continuationQueue: string[];
  latestTextRaw: string;
  commandLine: string;
  lastWorker: string;
  justRanTool: boolean;
  maxCommands: number;
}): CommandQueuePlan | null {
  const {
    existingQueue,
    continuationQueue,
    latestTextRaw,
    commandLine,
    lastWorker,
    justRanTool,
    maxCommands,
  } = params;

  let commandQueue: string[];
  let source: QueueSource;
  let truncated = false;

  if (existingQueue.length > 0) {
    commandQueue = [...existingQueue];
    source = "existing";
  } else if (lastWorker === "confirm_action" && continuationQueue.length > 0) {
    commandQueue = [...continuationQueue];
    source = "continuation";
  } else {
    const split = splitCommandChain(latestTextRaw || commandLine, maxCommands);
    commandQueue = [...split.commands];
    truncated = split.truncated;
    source = "parsed";
  }

  if (commandQueue.length === 0 && commandLine) {
    commandQueue = [commandLine];
  }

  if (justRanTool && commandQueue.length > 1) {
    commandQueue = commandQueue.slice(1);
  }

  const activeCommand = commandQueue[0] || commandLine;
  if (!activeCommand) {
    return null;
  }

  const truncationNotice =
    source === "parsed" && truncated
      ? `I can run up to ${maxCommands} commands per request, so I will run the first ${maxCommands}.`
      : null;

  return {
    commandQueue,
    activeCommand,
    source,
    truncated,
    truncationNotice,
  };
}

export function shouldClearContinuationQueue(params: {
  hasContinuation: boolean;
  shouldResumeContinuation: boolean;
  justRanTool: boolean;
  commandText: string;
}): boolean {
  const {
    hasContinuation,
    shouldResumeContinuation,
    justRanTool,
    commandText,
  } = params;
  if (!hasContinuation || shouldResumeContinuation || justRanTool) {
    return false;
  }
  return looksLikeNewActionCommand(commandText);
}
