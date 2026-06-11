import test from "node:test";
import assert from "node:assert/strict";

import { buildCommandQueuePlan } from "../src/assistant/supervisorQueue.js";

test("buildCommandQueuePlan prefers continuation queue after confirm_action", () => {
  const plan = buildCommandQueuePlan({
    existingQueue: ["close the shopping tabs", "open my email tab"],
    continuationQueue: ["open my email tab"],
    latestTextRaw: "yes",
    commandLine: "yes",
    lastWorker: "confirm_action",
    justRanTool: true,
    maxCommands: 3,
  });

  assert.equal(plan?.source, "continuation");
  assert.equal(plan?.activeCommand, "open my email tab");
  assert.deepEqual(plan?.commandQueue, ["open my email tab"]);
});

test("buildCommandQueuePlan advances existing chain after tool step", () => {
  const plan = buildCommandQueuePlan({
    existingQueue: ["summarize this page", "close the tab"],
    continuationQueue: [],
    latestTextRaw: "",
    commandLine: "",
    lastWorker: "summarize_page",
    justRanTool: true,
    maxCommands: 3,
  });

  assert.equal(plan?.activeCommand, "close the tab");
  assert.deepEqual(plan?.commandQueue, ["close the tab"]);
});
