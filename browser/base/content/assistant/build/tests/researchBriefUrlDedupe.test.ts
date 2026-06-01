import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dedupeTabsByUrl,
  normalizeBriefUrl,
} from "../src/utils/researchBriefUrlDedupe.js";

describe("normalizeBriefUrl", () => {
  it("strips tracking params and fragments", () => {
    const a = normalizeBriefUrl(
      "https://Example.com/path?utm_source=x&id=1#section"
    );
    const b = normalizeBriefUrl("https://example.com/path?id=1");
    assert.equal(a, b);
  });
});

describe("dedupeTabsByUrl", () => {
  it("keeps first tab per normalized url", () => {
    const { items, dedupedCount } = dedupeTabsByUrl([
      { url: "https://a.com/x?utm=1", title: "A" },
      { url: "https://a.com/x", title: "A copy" },
      { url: "https://b.com/y", title: "B" },
    ]);
    assert.equal(items.length, 2);
    assert.equal(dedupedCount, 1);
    assert.equal(items[0].title, "A");
  });
});
