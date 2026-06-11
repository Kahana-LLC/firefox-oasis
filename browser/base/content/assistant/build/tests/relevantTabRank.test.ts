import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRelevantTabContextFromOutreach,
  buildRelevantTabFocusQuery,
  rankTabsHeuristically,
  scoreTabCatalogEntry,
} from "../src/services/relevantTabRank.js";
import type { TabCatalogEntry } from "../src/services/organizeTabsTypes.js";

const linkedIn: TabCatalogEntry = {
  index: 1,
  title: "Sarah Chen | LinkedIn",
  url: "https://www.linkedin.com/in/sarahchen",
  domain: "linkedin.com",
  currentGroup: null,
  pinned: false,
};

const gmail: TabCatalogEntry = {
  index: 2,
  title: "Inbox - Gmail",
  url: "https://mail.google.com/mail/u/0/#inbox",
  domain: "mail.google.com",
  currentGroup: null,
  pinned: false,
};

test("buildRelevantTabFocusQuery combines outreach fields", () => {
  const context = buildRelevantTabContextFromOutreach({
    purpose: "networking",
    purposeNotes: "asking for advice on Oasis",
    recipientName: "Sarah",
    recipientRole: "partner at Sequoia",
  });
  const focus = buildRelevantTabFocusQuery(context);
  assert.match(focus, /Sarah/i);
  assert.match(focus, /Sequoia/i);
});

test("scoreTabCatalogEntry boosts linkedin and penalizes gmail", () => {
  const context = buildRelevantTabContextFromOutreach({
    recipientName: "Sarah",
    purposeNotes: "investor outreach",
  });
  const tokens = buildRelevantTabFocusQuery(context)
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9'.-]{2,}/g) || [];
  const linkedInScore = scoreTabCatalogEntry(linkedIn, tokens);
  const gmailScore = scoreTabCatalogEntry(gmail, tokens);
  assert.ok(linkedInScore > gmailScore);
});

test("rankTabsHeuristically skips pinned tabs", () => {
  const context = buildRelevantTabContextFromOutreach({
    recipientName: "Sarah",
  });
  const ranked = rankTabsHeuristically(
    [{ ...linkedIn, pinned: true }, gmail],
    context,
    10
  );
  assert.equal(ranked.some(entry => entry.index === 1), false);
});
