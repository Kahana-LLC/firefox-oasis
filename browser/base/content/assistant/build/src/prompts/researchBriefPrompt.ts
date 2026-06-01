export const RESEARCH_BRIEF_SYSTEM_PROMPT = [
  "You are a research assistant helping a writer draft long-form content.",
  "You receive extracted text from multiple open browser tabs on a single topic.",
  "Produce a structured research brief grounded ONLY in the provided tab digests.",
  "Do not invent facts, quotes, or URLs that are not supported by the digests.",
  "Use verbatim quotes when possible (max 500 characters each).",
  "Populate gapsAndContradictions when sources disagree or coverage is thin.",
  "Return only valid JSON matching the required schema.",
].join("\n");

const quoteSchema = {
  type: "object",
  properties: {
    text: { type: "string" },
    context: { type: "string" },
  },
  required: ["text"],
};

const sourceSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    url: { type: "string" },
    status: { type: "string", enum: ["ok", "skipped", "failed"] },
    failureReason: { type: "string" },
    keyClaims: { type: "array", items: { type: "string" } },
    quotes: { type: "array", items: quoteSchema },
  },
  required: ["title", "url", "status", "keyClaims", "quotes"],
};

export const RESEARCH_BRIEF_GENERATION_CONFIG = {
  responseMimeType: "application/json",
  responseJsonSchema: {
    type: "object",
    properties: {
      topic: { type: "string" },
      generatedAt: { type: "string" },
      scopeLabel: { type: "string" },
      executiveSummary: { type: "string" },
      outline: {
        type: "array",
        items: {
          type: "object",
          properties: {
            heading: { type: "string" },
            bullets: { type: "array", items: { type: "string" } },
          },
          required: ["heading", "bullets"],
        },
      },
      themes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            synthesis: { type: "string" },
            sourceUrls: { type: "array", items: { type: "string" } },
          },
          required: ["label", "synthesis", "sourceUrls"],
        },
      },
      sources: { type: "array", items: sourceSchema },
      gapsAndContradictions: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: [
      "topic",
      "generatedAt",
      "scopeLabel",
      "executiveSummary",
      "outline",
      "themes",
      "sources",
      "gapsAndContradictions",
    ],
  },
};

export function buildResearchBriefUserMessage(params: {
  topic: string;
  outlineHint?: string;
  scopeLabel: string;
  digests: Array<{
    title: string;
    url: string;
    content: string;
    status: string;
    failureReason?: string;
  }>;
}): string {
  const lines = [`Topic: ${params.topic}`, `Scope: ${params.scopeLabel}`];
  if (params.outlineHint?.trim()) {
    lines.push(`Outline hint: ${params.outlineHint.trim()}`);
  }
  lines.push("", "Tab digests (JSON):", JSON.stringify(params.digests));
  return lines.join("\n");
}
