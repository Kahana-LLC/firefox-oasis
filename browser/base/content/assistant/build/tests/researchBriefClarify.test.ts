import test from "node:test";
import assert from "node:assert/strict";

import { suggestTabCountForQuota } from "../src/utils/researchBriefClarify.js";
import type { TabDigest } from "../src/services/researchBriefTypes.js";

function digest(chars: number, index = 0): TabDigest {
  return {
    title: `Tab ${index}`,
    url: `https://example.com/${index}`,
    content: "x".repeat(chars),
    status: "ok",
  };
}

test("suggestTabCountForQuota returns max tabs that fit remaining tokens", () => {
  const digests = [digest(4000, 0), digest(4000, 1), digest(4000, 2)];
  const n = suggestTabCountForQuota(digests, 5000);
  assert.equal(n, 1);
});

test("suggestTabCountForQuota uses all tabs when budget allows", () => {
  const digests = [digest(100, 0), digest(100, 1)];
  const n = suggestTabCountForQuota(digests, 1_000_000);
  assert.equal(n, 2);
});

test("suggestTabCountForQuota returns at least one tab", () => {
  const digests = [digest(50_000, 0)];
  assert.equal(suggestTabCountForQuota(digests, 1), 1);
});
