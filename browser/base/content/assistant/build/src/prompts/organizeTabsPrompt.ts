export const ORGANIZE_TABS_SYSTEM_PROMPT = [
  "You organize open browser tabs into tab groups by topic.",
  "You receive a catalog of tabs with index, title, URL, domain, current group, and optional page snippets.",
  "Return a grouping plan as JSON only. Every tab index may appear in at most one group.",
  "Respect the requested mode:",
  "- single_focus: create one group for tabs matching the focus topic; leave unrelated tabs ungrouped.",
  "- multi_topic: discover 2-6 coherent topic groups; leave truly unrelated tabs ungrouped when sensible.",
  "- research_vs_other: create exactly two groups when possible — one for the focus/research topic and one named Other for the rest.",
  "Use concise group names (2-4 words). Do not invent tab indices not in the catalog.",
  "Skip pinned tabs if marked pinned.",
].join("\n");

export const ORGANIZE_TABS_GENERATION_CONFIG = {
  responseMimeType: "application/json",
  responseJsonSchema: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        enum: ["single_focus", "multi_topic", "research_vs_other"],
      },
      groups: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            tabIndices: { type: "array", items: { type: "number" } },
            rationale: { type: "string" },
          },
          required: ["name", "tabIndices"],
        },
      },
      ungroupedIndices: { type: "array", items: { type: "number" } },
      warnings: { type: "array", items: { type: "string" } },
    },
    required: ["mode", "groups", "ungroupedIndices", "warnings"],
  },
};

export function buildOrganizeTabsUserMessage(params: {
  mode: string;
  focus?: string;
  suggestedGroupName?: string;
  maxGroups: number;
  scopeLabel: string;
  catalog: Array<{
    index: number;
    title: string;
    url: string;
    domain: string;
    currentGroup: string | null;
    pinned: boolean;
    snippet?: string;
  }>;
}): string {
  const lines = [
    `Mode: ${params.mode}`,
    `Scope: ${params.scopeLabel}`,
    `Max groups: ${params.maxGroups}`,
  ];
  if (params.focus) {
    lines.push(`Focus topic: ${params.focus}`);
  }
  if (params.suggestedGroupName) {
    lines.push(`Suggested group name: ${params.suggestedGroupName}`);
  }
  lines.push(
    "",
    "Tab catalog (JSON):",
    JSON.stringify(params.catalog, null, 0)
  );
  return lines.join("\n");
}
