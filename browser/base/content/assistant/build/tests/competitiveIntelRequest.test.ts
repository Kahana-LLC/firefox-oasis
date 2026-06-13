import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPETITIVE_INTEL_MARKER,
  buildCompetitiveIntelToolMessage,
  displayMarkdownFromCompetitiveIntelToolMessage,
  parseCompetitiveIntelToolMessage,
} from "../src/utils/competitiveIntelRequest.js";
import type { CompetitiveIntelReport } from "../src/services/competitiveIntelTypes.js";

const sampleReport: CompetitiveIntelReport = {
  industry: "enterprise CRM",
  generatedAt: "2026-01-01",
  executiveSummary: "Summary",
  overallConfidence: "medium",
  confidenceRationale: "Grounded",
  confidenceRefinementEligible: false,
  competitors: [],
  comparisonMatrix: { dimensions: [], cells: [] },
  sources: [],
};

test("parseCompetitiveIntelToolMessage handles trailing expand CTA", () => {
  const payload = buildCompetitiveIntelToolMessage({
    markdown: "# Competitive intelligence: enterprise CRM",
    report: sampleReport,
    reportId: "ci_test",
  });
  const message = [
    "## Tab groups created",
    "",
    "- **CI — High** — 3 tab(s): Acme",
    "",
    payload,
    "",
    "---",
    "",
    "**Optional next steps:**",
    "- Say **expand with external AI**",
  ].join("\n");

  const parsed = parseCompetitiveIntelToolMessage(message);
  assert.ok(parsed);
  assert.equal(parsed!.reportId, "ci_test");
  assert.match(parsed!.markdown, /^# Competitive intelligence:/);
});

test("displayMarkdownFromCompetitiveIntelToolMessage keeps preamble and suffix", () => {
  const payload = buildCompetitiveIntelToolMessage({
    markdown: "# Competitive intelligence: enterprise CRM",
    report: sampleReport,
  });
  const message = `## Tab groups created\n\n${payload}\n\n---\n\n**Optional next steps:**`;
  const display = displayMarkdownFromCompetitiveIntelToolMessage(message);
  assert.match(display, /## Tab groups created/);
  assert.match(display, /# Competitive intelligence:/);
  assert.match(display, /Optional next steps/);
});

test("parseCompetitiveIntelToolMessage returns null without marker", () => {
  assert.equal(parseCompetitiveIntelToolMessage("plain text"), null);
  assert.equal(
    parseCompetitiveIntelToolMessage(`not ${COMPETITIVE_INTEL_MARKER}`),
    null
  );
});

test("parseCompetitiveIntelToolMessage handles realistic group preview message", () => {
  const payload = buildCompetitiveIntelToolMessage({
    markdown: "# Competitive intelligence: enterprise CRM\n\n".repeat(40),
    report: sampleReport,
    reportId: "ci_realistic",
  });
  const message = [
    "## Tab groups created",
    "",
    "- **CI — High** — 3 tab(s): Acme, Beta, Gamma",
    "- **CI — Medium** — 5 tab(s): Delta, Echo, Foxtrot, Golf, Hotel",
    "",
    payload,
    "",
    "---",
    "",
    "**Optional next steps:**",
    "- Say **expand with external AI** to open ChatGPT, Perplexity, and other tools for deeper research",
    "- Say **add review enrichment** to open G2/Capterra tabs (slower; G2 may block bots)",
    "- Say **regenerate report** after expanding or adding review tabs",
  ].join("\n");

  const parsed = parseCompetitiveIntelToolMessage(message);
  assert.ok(parsed);
  assert.equal(parsed!.reportId, "ci_realistic");
  assert.ok(message.length > 2000);
});
