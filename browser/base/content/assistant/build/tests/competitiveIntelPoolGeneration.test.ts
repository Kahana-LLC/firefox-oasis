import test from "node:test";
import assert from "node:assert/strict";
import { parsePoolGenerationResult } from "../src/prompts/competitiveIntelPoolGenerationPrompt.js";

test("parsePoolGenerationResult parses JSON companies array", () => {
  const parsed = parsePoolGenerationResult({
    companies: [
      {
        name: "Workday",
        description: "HCM suite",
        suggestedTier: "high",
        websiteUrl: "https://www.workday.com/",
        wikipediaUrl: "https://en.wikipedia.org/wiki/Workday,_Inc.",
      },
    ],
  });
  assert.ok(parsed);
  assert.equal(parsed!.companies.length, 1);
  assert.equal(parsed!.companies[0]?.name, "Workday");
  assert.equal(parsed!.companies[0]?.suggestedTier, "high");
});

test("parsePoolGenerationResult parses stringified JSON", () => {
  const parsed = parsePoolGenerationResult(
    JSON.stringify({
      companies: [
        {
          name: "Greenhouse",
          description: "ATS",
          suggestedTier: "medium",
        },
      ],
    })
  );
  assert.ok(parsed);
  assert.equal(parsed!.companies[0]?.name, "Greenhouse");
});

test("parsePoolGenerationResult filters empty names", () => {
  const parsed = parsePoolGenerationResult({
    companies: [{ name: "", description: "x" }, { name: "Valid", description: "y" }],
  });
  assert.equal(parsed?.companies.length, 1);
  assert.equal(parsed?.companies[0]?.name, "Valid");
});

test("parsePoolGenerationResult returns null for invalid payload", () => {
  assert.equal(parsePoolGenerationResult(null), null);
  assert.equal(parsePoolGenerationResult({}), null);
});
