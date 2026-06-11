import test from "node:test";
import assert from "node:assert/strict";

import {
  assessPromptMessiness,
  normalizeMessyPrompt,
  parseRefinerResponse,
} from "../src/assistant/promptRefinerCore.js";
import {
  looksLikeCommandChain,
  splitCommandChain,
} from "../src/assistant/commandChain.js";

// --- normalizeMessyPrompt -------------------------------------------------

test("normalize collapses whitespace and repeated punctuation", () => {
  assert.equal(
    normalizeMessyPrompt("  close   this tab!!!  "),
    "close this tab!"
  );
});

test("normalize expands shorthand tokens", () => {
  assert.equal(
    normalizeMessyPrompt("play a yt vid about cats plz"),
    "play a youtube video about cats please"
  );
});

test("normalize fixes common command-verb typos", () => {
  assert.equal(normalizeMessyPrompt("clse the tab"), "close the tab");
  assert.equal(
    normalizeMessyPrompt("serach my histroy for recipes"),
    "search my history for recipes"
  );
  assert.equal(
    normalizeMessyPrompt("summrize this page"),
    "summarize this page"
  );
});

test("normalize preserves trailing punctuation on replaced tokens", () => {
  assert.equal(normalizeMessyPrompt("open yt?"), "open youtube?");
});

test("normalize leaves clean text untouched", () => {
  assert.equal(
    normalizeMessyPrompt("close the second tab"),
    "close the second tab"
  );
});

test("normalize handles empty input", () => {
  assert.equal(normalizeMessyPrompt(""), "");
  assert.equal(normalizeMessyPrompt("   "), "");
});

// --- assessPromptMessiness ------------------------------------------------

test("clean short commands are not messy", () => {
  assert.equal(assessPromptMessiness("close this tab").messy, false);
  assert.equal(assessPromptMessiness("open youtube.com").messy, false);
  assert.equal(
    assessPromptMessiness("search my history for pasta recipes").messy,
    false
  );
});

test("plain chat questions are not messy", () => {
  assert.equal(
    assessPromptMessiness("what is the capital of France").messy,
    false
  );
});

test("very short inputs are never messy", () => {
  assert.equal(assessPromptMessiness("yes").messy, false);
  assert.equal(assessPromptMessiness("clse tab").messy, false);
});

test("compound multi-intent prompts are messy", () => {
  const result = assessPromptMessiness(
    "close these tabs and then search my history for that pasta recipe"
  );
  assert.equal(result.messy, true);
  assert.ok(result.reasons.includes("compound"));
});

test("shorthand prompts are messy", () => {
  const result = assessPromptMessiness("play a yt vid about cooking");
  assert.equal(result.messy, true);
  assert.ok(result.reasons.includes("shorthand"));
});

test("anaphora prompts are messy", () => {
  const result = assessPromptMessiness("open the other one please");
  assert.equal(result.messy, true);
  assert.ok(result.reasons.includes("anaphora"));
});

test("rambling prompts with buried intent are messy", () => {
  const rambling =
    "ok so basically i was reading this thing earlier today and i kinda " +
    "remember it had something about sourdough starters but idk where it " +
    "went, i had like fifty tabs open at the time, anyway can you search " +
    "my history and find that sourdough page for me, it was a blog i think";
  const result = assessPromptMessiness(rambling);
  assert.equal(result.messy, true);
  assert.ok(result.reasons.includes("rambling"));
});

test("filler-heavy prompts are messy", () => {
  const result = assessPromptMessiness(
    "um basically can you like, close all these shopping tabs idk"
  );
  assert.equal(result.messy, true);
  assert.ok(result.reasons.includes("filler"));
});

// --- parseRefinerResponse ---------------------------------------------------

test("parse returns clean when not refined", () => {
  assert.deepEqual(parseRefinerResponse({ refined: false }), {
    kind: "clean",
  });
  assert.deepEqual(parseRefinerResponse({}), { kind: "clean" });
});

test("parse returns single refined intent", () => {
  const result = parseRefinerResponse({
    refined: true,
    intents: [{ refinedPrompt: "Search history for sourdough recipes" }],
  });
  assert.deepEqual(result, {
    kind: "refined",
    intents: ["Search history for sourdough recipes"],
  });
});

test("parse returns ordered multiple intents capped at three", () => {
  const result = parseRefinerResponse({
    refined: true,
    intents: [
      { refinedPrompt: "Close the shopping tabs" },
      { refinedPrompt: "Search history for pasta recipes" },
      { refinedPrompt: "Open youtube.com" },
      { refinedPrompt: "List bookmarks" },
    ],
  });
  assert.equal(result.kind, "refined");
  if (result.kind === "refined") {
    assert.deepEqual(result.intents, [
      "Close the shopping tabs",
      "Search history for pasta recipes",
      "Open youtube.com",
    ]);
  }
});

test("parse drops empty or malformed intents", () => {
  const result = parseRefinerResponse({
    refined: true,
    intents: [{ refinedPrompt: "  " }, { other: "x" }, null],
  });
  assert.deepEqual(result, { kind: "clean" });
});

test("parse returns clarification options when needed", () => {
  const result = parseRefinerResponse({
    need_clarification: true,
    options: [
      {
        id: "opt_1",
        label: "Close all tabs",
        resolvedPrompt: "Close all tabs",
      },
      {
        id: "opt_2",
        label: "Close current tab",
        resolvedPrompt: "Close the current tab",
      },
    ],
  });
  assert.equal(result.kind, "clarify");
  if (result.kind === "clarify") {
    assert.equal(result.options.length, 2);
    assert.equal(result.options[0].id, "opt_1");
  }
});

test("parse falls back to clean on malformed clarification options", () => {
  const result = parseRefinerResponse({
    need_clarification: true,
    options: [{ id: "opt_1" }],
  });
  assert.deepEqual(result, { kind: "clean" });
});

// --- commandChain extended connectors ---------------------------------------

test("chain splits on 'and then'", () => {
  const result = splitCommandChain("open youtube and then list my bookmarks");
  assert.deepEqual(result.commands, ["open youtube", "list my bookmarks"]);
});

test("chain splits on 'also' before a verb", () => {
  assert.equal(
    looksLikeCommandChain("close this tab also open my bookmarks"),
    true
  );
  const result = splitCommandChain("close this tab also open my bookmarks");
  assert.deepEqual(result.commands, ["close this tab", "open my bookmarks"]);
});

test("chain splits on 'after that' before a verb", () => {
  const result = splitCommandChain(
    "summarize this page after that close the tab"
  );
  assert.deepEqual(result.commands, ["summarize this page", "close the tab"]);
});

test("chain splits on 'plus' before a verb", () => {
  const result = splitCommandChain(
    "organize my tabs plus close the duplicates"
  );
  assert.deepEqual(result.commands, [
    "organize my tabs",
    "close the duplicates",
  ]);
});

test("chain splits on comma followed by a verb", () => {
  const result = splitCommandChain(
    "close the shopping tabs, open my email tab"
  );
  assert.deepEqual(result.commands, [
    "close the shopping tabs",
    "open my email tab",
  ]);
});

test("chain does not split on connector without following verb", () => {
  assert.equal(
    looksLikeCommandChain("open the tab with cats also dogs"),
    false
  );
  const result = splitCommandChain("open the tab with cats also dogs");
  assert.deepEqual(result.commands, ["open the tab with cats also dogs"]);
});

test("chain does not split plain comma lists", () => {
  const result = splitCommandChain("open tabs about cats, dogs, and birds");
  assert.deepEqual(result.commands, ["open tabs about cats, dogs, and birds"]);
});

test("chain still truncates beyond max commands", () => {
  const result = splitCommandChain(
    "open youtube; close this tab; list bookmarks; search history for cats"
  );
  assert.equal(result.commands.length, 3);
  assert.equal(result.truncated, true);
});

test("chain splits summarize then close tab", () => {
  const result = splitCommandChain(
    "summarize this page after that close the tab"
  );
  assert.equal(result.commands.length, 2);
  assert.equal(result.commands[0], "summarize this page");
  assert.equal(result.commands[1], "close the tab");
});

test("chain splits close shopping tabs and open email tab", () => {
  const result = splitCommandChain(
    "close the shopping tabs, open my email tab"
  );
  assert.equal(result.commands.length, 2);
  assert.equal(result.commands[0], "close the shopping tabs");
  assert.equal(result.commands[1], "open my email tab");
});

// --- messy-utterance matrix -------------------------------------------------

const MESSY_MATRIX: Array<{ utterance: string; reason: string }> = [
  {
    utterance: "clse these tabz and serach hist for that article",
    reason: "shorthand",
  },
  {
    utterance: "play that yt vid about woodworking again",
    reason: "shorthand",
  },
  { utterance: "open the other one like last time", reason: "anaphora" },
  {
    utterance: "close the news tabs and then summarize the remaining one",
    reason: "compound",
  },
  {
    utterance:
      "um so like, basically idk i want you to organize all my tabs somehow",
    reason: "filler",
  },
];

for (const { utterance, reason } of MESSY_MATRIX) {
  test(`messy matrix flags: "${utterance}"`, () => {
    const result = assessPromptMessiness(utterance);
    assert.equal(result.messy, true, `expected messy for: ${utterance}`);
    assert.ok(
      result.reasons.includes(reason),
      `expected reason "${reason}", got ${JSON.stringify(result.reasons)}`
    );
  });
}

const CLEAN_MATRIX: string[] = [
  "close this tab",
  "open youtube.com",
  "summarize this page",
  "search my history for pasta recipes",
  "organize my tabs by topic",
  "build a research brief on this tab group",
  "what time is it in Tokyo",
];

for (const utterance of CLEAN_MATRIX) {
  test(`clean matrix passes through: "${utterance}"`, () => {
    assert.equal(
      assessPromptMessiness(utterance).messy,
      false,
      `expected clean for: ${utterance}`
    );
  });
}
