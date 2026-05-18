/**
 * Lightweight eval for streamAgentLoop (driver semantics, step ordering, caps).
 * Run: npm run eval:agent-loop
 */
import test from "node:test";
import assert from "node:assert/strict";
import { AIMessage, HumanMessage } from "@langchain/core/messages";

import {
  AGENT_END,
  streamAgentLoop,
  type AgentState,
} from "../src/assistant/agentLoopDriver.js";

test("eval: supervisor → tool → supervisor → chat → __end__", async () => {
  let supervisorCalls = 0;
  const supervisorNode = async (_state: AgentState) => {
    supervisorCalls += 1;
    if (supervisorCalls === 1) {
      return {
        next: "mock_tool",
        args: { step: 1 },
        lastWorker: "supervisor",
      };
    }
    return { next: "chat", args: {}, commandQueue: [] };
  };

  const chatNode = async () => ({
    messages: [new AIMessage("Chat reply.")],
    lastWorker: "chat",
    commandQueue: [],
  });

  const toolAgents = {
    mock_tool: async (state: AgentState) => ({
      messages: [
        new AIMessage({
          content: "Tool done.",
          name: "mock_tool",
        }),
      ],
      lastWorker: "mock_tool",
      next: "supervisor",
      args: {},
      commandQueue: state.commandQueue,
    }),
  };

  const yielded: string[] = [];
  for await (const chunk of streamAgentLoop({
    initialMessages: [new HumanMessage("Hello")],
    maxSteps: 24,
    supervisorNode,
    chatNode,
    toolAgents,
    memberNames: ["mock_tool"],
  })) {
    if ("__end__" in chunk && (chunk as { __end__?: boolean }).__end__) {
      yielded.push("__end__");
      break;
    }
    const key = Object.keys(chunk).find(k => k !== "__end__");
    if (key) {
      yielded.push(key);
    }
  }

  assert.deepEqual(yielded, ["mock_tool", "chat", "__end__"]);
  assert.equal(supervisorCalls, 2);
});

test("eval: maxSteps stops ping-pong (no silent hang)", async () => {
  const supervisorNode = async () => ({
    next: "mock_tool",
    args: {},
    lastWorker: "supervisor",
  });
  const chatNode = async () => ({
    messages: [new AIMessage("unused")],
    lastWorker: "chat",
    commandQueue: [],
  });
  const toolAgents = {
    mock_tool: async (state: AgentState) => ({
      messages: [new AIMessage({ content: ".", name: "mock_tool" })],
      lastWorker: "mock_tool",
      next: "supervisor",
      args: {},
      commandQueue: state.commandQueue,
    }),
  };

  let end = false;
  let iterations = 0;
  for await (const chunk of streamAgentLoop({
    initialMessages: [new HumanMessage("x")],
    maxSteps: 6,
    supervisorNode,
    chatNode,
    toolAgents,
    memberNames: ["mock_tool"],
  })) {
    iterations += 1;
    if ("__end__" in chunk && (chunk as { __end__?: boolean }).__end__) {
      end = true;
      break;
    }
  }

  assert.equal(end, true);
  assert.ok(iterations <= 12);
});

test("eval: supervisor can end immediately", async () => {
  const supervisorNode = async () => ({
    next: AGENT_END,
    args: {},
    lastWorker: "supervisor",
  });
  const chatNode = async () => ({
    messages: [new AIMessage("no")],
    lastWorker: "chat",
    commandQueue: [],
  });
  const out: string[] = [];
  for await (const chunk of streamAgentLoop({
    initialMessages: [new HumanMessage("stop")],
    maxSteps: 8,
    supervisorNode,
    chatNode,
    toolAgents: {},
    memberNames: [],
  })) {
    if ("__end__" in chunk && (chunk as { __end__?: boolean }).__end__) {
      out.push("__end__");
    }
  }
  assert.deepEqual(out, ["__end__"]);
});
