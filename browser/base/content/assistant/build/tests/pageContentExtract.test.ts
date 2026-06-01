import test from "node:test";
import assert from "node:assert/strict";

import {
  isNonWebUrl,
  MAX_CONTENT_CHARS_PER_TAB,
  MIN_CONTENT_CHARS,
} from "../src/services/pageContentExtract.js";

test("isNonWebUrl detects internal browser URLs", () => {
  assert.equal(isNonWebUrl("about:blank"), true);
  assert.equal(isNonWebUrl("chrome://browser/content"), true);
  assert.equal(isNonWebUrl("moz-extension://abc/page.html"), true);
  assert.equal(isNonWebUrl("https://example.com/article"), false);
});

test("content length constants match summarize_page contract", () => {
  assert.equal(MAX_CONTENT_CHARS_PER_TAB, 12000);
  assert.equal(MIN_CONTENT_CHARS, 50);
});
