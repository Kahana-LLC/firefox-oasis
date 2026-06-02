import test from "node:test";
import assert from "node:assert/strict";

import { mergeSectionIntoBrief } from "../src/services/researchBriefSectionMerge.js";
import type { ResearchBrief } from "../src/services/researchBriefTypes.js";

const baseBrief: ResearchBrief = {
  topic: "AI privacy",
  generatedAt: "2026-01-01T00:00:00.000Z",
  scopeLabel: "Tab group: Privacy",
  executiveSummary: "Original summary",
  outline: [{ heading: "Intro", bullets: ["A"] }],
  themes: [
    {
      label: "Theme A",
      synthesis: "Old theme",
      sourceUrls: ["https://a.test"],
    },
  ],
  sources: [
    {
      title: "Source 1",
      url: "https://a.test",
      status: "ok",
      keyClaims: [],
      quotes: [],
    },
  ],
  gapsAndContradictions: ["Gap one"],
};

test("mergeSectionIntoBrief replaces executiveSummary only", () => {
  const merged = mergeSectionIntoBrief(
    baseBrief,
    "executiveSummary",
    "New summary"
  );
  assert.equal(merged.executiveSummary, "New summary");
  assert.deepEqual(merged.outline, baseBrief.outline);
  assert.deepEqual(merged.themes, baseBrief.themes);
});

test("mergeSectionIntoBrief replaces themes from wrapped payload", () => {
  const merged = mergeSectionIntoBrief(baseBrief, "themes", {
    themes: [
      {
        label: "Theme B",
        synthesis: "Fresh theme",
        sourceUrls: ["https://b.test"],
      },
    ],
  });
  assert.equal(merged.themes[0]?.label, "Theme B");
  assert.equal(merged.executiveSummary, baseBrief.executiveSummary);
});

test("mergeSectionIntoBrief replaces gaps array", () => {
  const merged = mergeSectionIntoBrief(baseBrief, "gapsAndContradictions", [
    "Gap two",
  ]);
  assert.deepEqual(merged.gapsAndContradictions, ["Gap two"]);
  assert.deepEqual(merged.sources, baseBrief.sources);
});
