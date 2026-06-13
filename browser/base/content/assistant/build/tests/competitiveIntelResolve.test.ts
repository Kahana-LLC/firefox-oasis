import test from "node:test";
import assert from "node:assert/strict";
import {
  tagDigestsWithCiTabGroups,
} from "../src/services/competitiveIntelResolve.js";

test("tagDigestsWithCiTabGroups preserves digest fields", () => {
  const tagged = tagDigestsWithCiTabGroups(
    [
      {
        title: "Acme",
        url: "https://acme.com",
        status: "ok",
        content: "Enterprise CRM vendor",
        keyClaims: [],
        quotes: [],
      },
    ],
    [
      {
        name: "Acme",
        normalizedName: "acme",
        description: "",
        tier: "high",
        sourceUrls: ["https://acme.com"],
        mentionCount: 1,
      },
    ],
    []
  );
  assert.equal(tagged.length, 1);
  assert.equal(tagged[0]?.companyName, "Acme");
});
