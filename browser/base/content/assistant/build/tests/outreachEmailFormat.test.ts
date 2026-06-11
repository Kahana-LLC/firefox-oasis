import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeOutreachEmailBody,
  normalizeOutreachEmailSubject,
  outreachEmailToMarkdown,
  outreachEmailToPlainText,
  parseOutreachEmailFromAssistContent,
  replaceEmDashesInOutreachText,
  stripLinksFromOutreachText,
} from "../src/utils/outreachEmailFormat.js";

test("parseOutreachEmailFromAssistContent parses subject and body", () => {
  const draft = parseOutreachEmailFromAssistContent(
    {
      subject: "Great meeting you",
      body: "Hi Alex,\n\nThanks again for the chat.",
      personalizationBullets: ["Mentioned their Series B"],
      sources: [],
    },
    {
      purpose: "networking",
      scopeLabel: "Relevant tabs",
      recipientName: "Alex",
    }
  );
  assert.ok(draft);
  assert.equal(draft?.subject, "Great meeting you");
  assert.match(draft?.body || "", /Thanks again/);
});

test("outreachEmailToPlainText formats subject and body", () => {
  const text = outreachEmailToPlainText({
    subject: "Hello",
    body: "Body text",
    personalizationBullets: [],
    sources: [],
    purpose: "custom",
    scopeLabel: "Window",
    generatedAt: new Date().toISOString(),
  });
  assert.match(text, /Subject: Hello/);
  assert.match(text, /Body text/);
});

test("normalizeOutreachEmailBody fixes greeting spacing and paragraphs", () => {
  const body = normalizeOutreachEmailBody(
    "Hi Damir,I came across a fascinating article. It detailed Pokémon Go scans. The piece highlighted ethical questions. As Professor van den Hoven noted, gamers helped development. It's a stark reminder of data privacy. Best,",
    "Damir"
  );
  assert.match(body, /^Hi Damir,\n\n/);
  assert.doesNotMatch(body, /Damir,I/);
  assert.match(body, /\n\n.*\n\n/);
  assert.match(body, /Best,$/);
});

test("stripLinksFromOutreachText removes urls and markdown links", () => {
  const text = stripLinksFromOutreachText(
    "Read [this article](https://example.com/privacy) or https://example.com"
  );
  assert.doesNotMatch(text, /https?:\/\//);
  assert.match(text, /this article/);
});

test("replaceEmDashesInOutreachText removes em dashes", () => {
  const text = replaceEmDashesInOutreachText("gaming, data — and defense");
  assert.doesNotMatch(text, /[\u2014\u2013]/);
  assert.match(text, /gaming, data, and defense/);
});

test("normalizeOutreachEmailSubject strips links and em dashes", () => {
  const subject = normalizeOutreachEmailSubject(
    "Interesting read — https://example.com/pokemon"
  );
  assert.doesNotMatch(subject, /https?:\/\//);
  assert.doesNotMatch(subject, /[\u2014\u2013]/);
});

test("outreachEmailToMarkdown includes personalization section", () => {
  const markdown = outreachEmailToMarkdown({
    subject: "Follow up",
    body: "Checking in",
    personalizationBullets: ["Referenced their blog post"],
    sources: [],
    purpose: "follow_up",
    recipientName: "Sam",
    scopeLabel: "Window",
    generatedAt: new Date().toISOString(),
  });
  assert.match(markdown, /# Outreach email: Sam/);
  assert.match(markdown, /Referenced their blog post/);
});
