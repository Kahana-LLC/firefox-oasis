import { isRecord } from "../assistant/messageUtils.js";
import type { TabCatalogEntry } from "../services/organizeTabsTypes.js";
import type { RelevantTabSelectionPlan } from "../services/relevantTabTypes.js";
import {
  UNTRUSTED_CONTENT_SYSTEM_RULES,
  buildTrustedUserIntentBlock,
  wrapUntrustedJsonBlock,
} from "../utils/untrustedContent.js";

export const RELEVANT_TAB_SELECT_SYSTEM_PROMPT = [
  "You select the most relevant open browser tabs for a research or outreach task.",
  "You receive a tab catalog (index, title, URL, domain, optional snippet) and a focus query.",
  "Return only valid JSON matching the required schema.",
  "Choose tab indices that best support the focus query.",
  "Prefer profiles, company pages, articles, and docs tied to the person, company, or topic.",
  "Skip email clients, chat, and unrelated browsing unless the focus query explicitly needs them.",
  "Never invent tab indices not present in the catalog.",
  UNTRUSTED_CONTENT_SYSTEM_RULES,
].join("\n");

export const RELEVANT_TAB_SELECT_GENERATION_CONFIG = {
  responseMimeType: "application/json",
  responseJsonSchema: {
    type: "object",
    properties: {
      selectedIndices: { type: "array", items: { type: "number" } },
      rationale: { type: "string" },
      warnings: { type: "array", items: { type: "string" } },
    },
    required: ["selectedIndices", "rationale", "warnings"],
  },
};

export function buildRelevantTabSelectUserMessage(params: {
  focusQuery: string;
  artifactKind: "brief" | "outreach";
  maxTabs: number;
  catalog: TabCatalogEntry[];
}): string {
  const trusted = buildTrustedUserIntentBlock({
    artifact: params.artifactKind,
    focus_query: params.focusQuery,
    max_tabs: String(params.maxTabs),
  });
  const catalog = wrapUntrustedJsonBlock("Tab catalog", params.catalog);
  return [trusted, "", catalog].join("\n");
}

export function parseRelevantTabSelectResponse(
  raw: unknown,
  catalog: TabCatalogEntry[],
  maxTabs: number
): RelevantTabSelectionPlan | null {
  if (!isRecord(raw)) {
    return null;
  }
  const validIndices = new Set(
    catalog.map(entry => entry.index).filter(index => index >= 1)
  );
  const selectedIndices = Array.isArray(raw.selectedIndices)
    ? [
        ...new Set(
          raw.selectedIndices
            .map(value => Number(value))
            .filter(value => Number.isFinite(value) && validIndices.has(value))
        ),
      ].slice(0, maxTabs)
    : [];
  const rationale = String(raw.rationale || "").trim();
  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings.map(value => String(value)).filter(Boolean)
    : [];
  if (selectedIndices.length === 0 || !rationale) {
    return null;
  }
  return { selectedIndices, rationale, warnings };
}
