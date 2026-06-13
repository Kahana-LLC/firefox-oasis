import type { CompetitiveIntelWorkflowState } from "../services/competitiveIntelTypes.js";

export const CI_WORKFLOW_MARKER = "__CI_WORKFLOW__";

export type CompetitiveIntelWorkflowPayload = {
  markdown: string;
  workflow: CompetitiveIntelWorkflowState;
  discoveryQuery: string;
  discoveryTools: string[];
  status: "awaiting_continue" | "in_progress" | "awaiting_user" | "complete";
};

export function buildCompetitiveIntelWorkflowMessage(
  payload: CompetitiveIntelWorkflowPayload
): string {
  return `${CI_WORKFLOW_MARKER}\n${JSON.stringify(payload)}`;
}

export function hasCompetitiveIntelWorkflowMarker(text: string): boolean {
  return String(text || "").includes(CI_WORKFLOW_MARKER);
}

export function displayMarkdownFromCompetitiveIntelWorkflowMessage(
  text: string
): string {
  const parsed = parseCompetitiveIntelWorkflowMessage(text);
  if (parsed?.markdown) {
    return parsed.markdown;
  }
  const markerIndex = String(text || "").indexOf(CI_WORKFLOW_MARKER);
  if (markerIndex >= 0) {
    return String(text || "")
      .slice(0, markerIndex)
      .trim();
  }
  return String(text || "").trim();
}

export function parseCompetitiveIntelWorkflowMessage(
  text: string
): CompetitiveIntelWorkflowPayload | null {
  const input = String(text || "");
  const markerIndex = input.indexOf(CI_WORKFLOW_MARKER);
  if (markerIndex < 0) {
    return null;
  }
  try {
    const raw = JSON.parse(
      input.slice(markerIndex + CI_WORKFLOW_MARKER.length).trim()
    ) as Record<string, unknown>;
    if (
      typeof raw.markdown === "string" &&
      raw.workflow &&
      typeof raw.workflow === "object"
    ) {
      return {
        markdown: raw.markdown,
        workflow: raw.workflow as CompetitiveIntelWorkflowState,
        discoveryQuery:
          typeof raw.discoveryQuery === "string" ? raw.discoveryQuery : "",
        discoveryTools: Array.isArray(raw.discoveryTools)
          ? raw.discoveryTools.map(item => String(item))
          : [],
        status:
          raw.status === "awaiting_continue" ||
          raw.status === "in_progress" ||
          raw.status === "awaiting_user" ||
          raw.status === "complete"
            ? raw.status
            : "awaiting_user",
      };
    }
  } catch {
    return null;
  }
  return null;
}
