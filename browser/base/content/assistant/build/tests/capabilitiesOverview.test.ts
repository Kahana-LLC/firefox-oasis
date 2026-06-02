import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCapabilitiesOverviewMarkdown,
  summarizeForUser,
} from "../src/assistant/capabilitiesOverview.js";
import {
  CAPABILITIES_BLOCK_DELIMITER,
  CAPABILITIES_OVERVIEW_FIRST_LINE,
  OASIS_CAPABILITIES_FEATURES_URL,
  OASIS_CAPABILITIES_FEEDBACK_URL,
  OASIS_CAPABILITIES_FEEDBACK_LINK_LABEL,
} from "../../shared/capabilitiesOverviewConstants.js";

const listTabsDesc =
  "List tabs. Accepts optional arguments: { scope?: 'window'|'tab-group'|'bookmark-folder', name?: string }. If name is provided without scope, resolves tab-group vs bookmark-folder by runtime state.";

const closeTabDesc =
  "Close the active tab (or a tab by index). Accepts arguments: { index?: number, confirmed?: boolean } (1-based).";

test("summarizeForUser strips Accepts optional arguments", () => {
  const s = summarizeForUser(listTabsDesc);
  assert.ok(!/accepts optional arguments/i.test(s));
  assert.ok(!/accepts arguments/i.test(s));
  assert.ok(s.length <= 200);
  assert.match(s, /list tabs/i);
});

test("summarizeForUser strips Accepts arguments", () => {
  const s = summarizeForUser(closeTabDesc);
  assert.ok(!/accepts arguments/i.test(s));
  assert.ok(s.length <= 200);
});

test("summarizeForUser removes Args JSON tail", () => {
  const s = summarizeForUser(
    'Open a URL. Accepts arguments: { url: string } Args JSON: {"url":"https://x"}'
  );
  assert.ok(!/args json/i.test(s));
  assert.ok(!/\{[^}]*url[^}]*\}/i.test(s));
});

test("summarizeForUser strips Accepts no arguments", () => {
  const s = summarizeForUser(
    "Copy all tab URLs in the current window to the clipboard (one per line). Accepts no arguments."
  );
  assert.ok(!/accepts no arguments/i.test(s));
  assert.match(s, /clipboard/i);
});

test("capabilities markdown uses headings, code, links; no legacy delimiter", () => {
  const md = buildCapabilitiesOverviewMarkdown([
    { name: "list_tabs", description: listTabsDesc },
    { name: "close_tab", description: closeTabDesc },
  ]);
  assert.ok(!md.includes(CAPABILITIES_BLOCK_DELIMITER));
  assert.ok(md.startsWith(CAPABILITIES_OVERVIEW_FIRST_LINE));
  assert.ok(md.includes("### Support and feedback"));
  assert.ok(!md.includes("### More"));
  assert.ok(!md.includes("### Account and confirmations"));
  assert.ok(md.includes("`What tabs do I have open?`"));
  assert.ok(md.includes(`](${OASIS_CAPABILITIES_FEATURES_URL})`));
  assert.ok(md.includes(`](${OASIS_CAPABILITIES_FEEDBACK_URL})`));
  assert.ok(!md.includes("- close_tab"));
  assert.ok(!md.includes("- list_tabs"));
  assert.ok(!/tally/i.test(OASIS_CAPABILITIES_FEEDBACK_LINK_LABEL));
  assert.ok(!md.includes("Tile my windows"));
  assert.ok(!md.includes("Split these two tabs side by side"));
  assert.ok(!md.includes("What cooking sites"));
  assert.ok(!md.includes("Show my subscription"));
  const iWeb = md.indexOf("### Web and search");
  const iGen = md.indexOf("### General questions");
  const iNav = md.indexOf("### Navigation");
  const iSum = md.indexOf("### Summarization");
  assert.ok(iWeb > 0 && iGen > iWeb && iSum > iGen && iNav > iSum);
  assert.ok(md.includes("`Who is the president of Djibouti?`"));
  assert.ok(md.includes("`What is the square root of 256?`"));
  assert.ok(md.includes("Use your imagination"));
  assert.ok(/thumb/i.test(md));
  assert.ok(md.includes("training"));
});

test("capabilities digest has no bookmark wording", () => {
  const md = buildCapabilitiesOverviewMarkdown([
    { name: "list_tabs", description: listTabsDesc },
    {
      name: "list_bookmark_folders",
      description: "List all managed bookmark folders. Accepts no arguments.",
    },
  ]);
  assert.ok(!/bookmark/i.test(md));
});
