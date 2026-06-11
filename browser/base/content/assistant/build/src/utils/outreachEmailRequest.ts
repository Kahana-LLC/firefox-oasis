import type { OutreachEmailDraft } from "../services/outreachEmailTypes.js";

export const OUTREACH_EMAIL_MARKER = "__OUTREACH_EMAIL__";

export type OutreachEmailToolPayload = {
  markdown: string;
  plainEmail: string;
  draft: OutreachEmailDraft;
  draftId?: string;
};

export function buildOutreachEmailToolMessage(
  payload: OutreachEmailToolPayload
): string {
  return `${OUTREACH_EMAIL_MARKER}\n${JSON.stringify(payload)}`;
}

export function hasOutreachEmailMarker(text: string): boolean {
  return String(text || "").includes(OUTREACH_EMAIL_MARKER);
}

export function parseOutreachEmailToolMessage(
  text: string
): OutreachEmailToolPayload | null {
  const input = String(text || "");
  const markerIndex = input.indexOf(OUTREACH_EMAIL_MARKER);
  if (markerIndex < 0) {
    return null;
  }
  try {
    const raw = JSON.parse(
      input.slice(markerIndex + OUTREACH_EMAIL_MARKER.length).trim()
    ) as Record<string, unknown>;
    if (
      typeof raw.markdown === "string" &&
      typeof raw.plainEmail === "string" &&
      raw.draft &&
      typeof raw.draft === "object"
    ) {
      return {
        markdown: raw.markdown,
        plainEmail: raw.plainEmail,
        draft: raw.draft as OutreachEmailDraft,
        draftId: typeof raw.draftId === "string" ? raw.draftId : undefined,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function displayMarkdownFromOutreachEmailToolMessage(
  text: string
): string {
  const parsed = parseOutreachEmailToolMessage(text);
  if (parsed?.markdown) {
    return parsed.markdown;
  }
  const markerIndex = String(text || "").indexOf(OUTREACH_EMAIL_MARKER);
  if (markerIndex >= 0) {
    return String(text || "")
      .slice(0, markerIndex)
      .trim();
  }
  return String(text || "").trim();
}
