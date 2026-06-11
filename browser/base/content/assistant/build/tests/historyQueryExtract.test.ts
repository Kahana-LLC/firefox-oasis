import test from "node:test";
import assert from "node:assert/strict";

import {
  extractHistorySearchKeyword,
  historyKeywordFallbacks,
} from "../src/utils/historyQueryExtract.js";

test("extractHistorySearchKeyword pulls keyword from rambling history utterance", () => {
  const keyword = extractHistorySearchKeyword(
    "I was trying to remember that ravioli video I was watching a while ago from my history"
  );
  assert.equal(keyword, "ravioli video");
});

test("extractHistorySearchKeyword normalizes history typos", () => {
  const keyword = extractHistorySearchKeyword(
    "um so like serach my histroy for that mahomes video"
  );
  assert.equal(keyword, "mahomes video");
});

test("historyKeywordFallbacks shortens media suffix queries", () => {
  assert.deepEqual(historyKeywordFallbacks("mahomes video"), ["mahomes"]);
});

test("extractHistorySearchKeyword caps keyword length", () => {
  const keyword = extractHistorySearchKeyword(
    "search my history for one two three four five six seven eight"
  );
  assert.ok(keyword);
  assert.ok(keyword!.split(/\s+/).length <= 6);
});
