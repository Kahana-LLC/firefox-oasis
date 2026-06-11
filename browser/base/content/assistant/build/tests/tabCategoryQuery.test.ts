import test from "node:test";
import assert from "node:assert/strict";

import {
  expandTabSearchKeywords,
  findTabsByIntentQuery,
  pickBestTabForIntentQuery,
} from "../src/utils/tabCategoryQuery.js";
import { normalizeName, tabTitle, tabUrl } from "../src/services/firefoxFacade.js";

test("expandTabSearchKeywords maps shopping to amazon and peers", () => {
  const keywords = expandTabSearchKeywords("shopping");
  assert.ok(keywords.includes("shopping"));
  assert.ok(keywords.includes("amazon"));
  assert.ok(keywords.includes("ebay"));
});

test("expandTabSearchKeywords maps email to gmail and peers", () => {
  const keywords = expandTabSearchKeywords("email");
  assert.ok(keywords.includes("email"));
  assert.ok(keywords.includes("gmail"));
  assert.ok(keywords.includes("mail.google"));
});

test("findTabsByIntentQuery matches amazon tabs for shopping", () => {
  const amazonTab = {
    label: "Amazon.com: desk lamp",
    linkedBrowser: {
      currentURI: { spec: "https://www.amazon.com/dp/B123" },
      contentTitle: "Amazon.com: desk lamp",
    },
  };
  const newsTab = {
    label: "BBC News",
    linkedBrowser: {
      currentURI: { spec: "https://www.bbc.com/news" },
      contentTitle: "BBC News",
    },
  };
  const gBrowser = { tabs: [amazonTab, newsTab] };
  const matches = findTabsByIntentQuery(gBrowser, "shopping");
  assert.equal(matches.length, 1);
  assert.ok(normalizeName(tabUrl(matches[0])).includes("amazon"));
});

test("pickBestTabForIntentQuery prefers gmail for email", () => {
  const gmailTab = {
    label: "Inbox - Gmail",
    linkedBrowser: {
      currentURI: { spec: "https://mail.google.com/mail/u/0/#inbox" },
    },
  };
  const outlookTab = {
    label: "Outlook",
    linkedBrowser: {
      currentURI: { spec: "https://outlook.live.com/mail/" },
    },
  };
  const picked = pickBestTabForIntentQuery(
    [outlookTab, gmailTab],
    "email"
  );
  assert.ok(normalizeName(tabUrl(picked)).includes("mail.google"));
  assert.ok(normalizeName(tabTitle(picked)).includes("gmail"));
});
