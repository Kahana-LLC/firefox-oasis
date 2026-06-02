import type {
  ResearchBrief,
  TabDigest,
} from "../services/researchBriefTypes.js";

export const RESEARCH_BRIEF_MARKER = "__RESEARCH_BRIEF__";

export type ResearchBriefToolPayload = {
  markdown: string;
  brief: ResearchBrief;
  briefId?: string;
  digests?: TabDigest[];
};

export function buildResearchBriefToolMessage(
  payload: ResearchBriefToolPayload
): string {
  return `${RESEARCH_BRIEF_MARKER}\n${JSON.stringify(payload)}`;
}

export function hasResearchBriefMarker(text: string): boolean {
  return String(text || "").includes(RESEARCH_BRIEF_MARKER);
}

export function parseResearchBriefToolMessage(
  text: string
): ResearchBriefToolPayload | null {
  const input = String(text || "");
  const markerIndex = input.indexOf(RESEARCH_BRIEF_MARKER);
  if (markerIndex < 0) {
    return null;
  }

  const jsonText = input
    .slice(markerIndex + RESEARCH_BRIEF_MARKER.length)
    .trim();

  try {
    const raw = JSON.parse(jsonText) as Record<string, unknown>;
    if (
      typeof raw.markdown === "string" &&
      raw.brief &&
      typeof raw.brief === "object"
    ) {
      return {
        markdown: raw.markdown,
        brief: raw.brief as ResearchBrief,
        briefId: typeof raw.briefId === "string" ? raw.briefId : undefined,
        digests: Array.isArray(raw.digests)
          ? (raw.digests as TabDigest[])
          : undefined,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function displayMarkdownFromResearchBriefToolMessage(
  text: string
): string {
  const parsed = parseResearchBriefToolMessage(text);
  if (parsed?.markdown) {
    return parsed.markdown;
  }
  const markerIndex = String(text || "").indexOf(RESEARCH_BRIEF_MARKER);
  if (markerIndex >= 0) {
    return String(text || "")
      .slice(0, markerIndex)
      .trim();
  }
  return String(text || "").trim();
}
