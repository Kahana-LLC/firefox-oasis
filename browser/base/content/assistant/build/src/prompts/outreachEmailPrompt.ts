import type { TabDigest } from "../services/researchBriefTypes.js";
import type {
  OutreachEmailPurpose,
  OutreachEmailTone,
} from "../services/outreachEmailTypes.js";
import {
  UNTRUSTED_CONTENT_SYSTEM_RULES,
  buildTrustedUserIntentBlock,
  wrapUntrustedJsonBlock,
} from "../utils/untrustedContent.js";

export const OUTREACH_EMAIL_SYSTEM_PROMPT = [
  "You are an assistant helping the user draft personalized outreach email copy.",
  "You receive extracted text from open browser tabs (profiles, articles, company pages, notes).",
  "Write a ready-to-send email grounded ONLY in the provided tab digests and user instructions.",
  "Do not invent facts about the recipient or company that are not supported by the digests.",
  "Keep the body concise (roughly 120-220 words unless purpose requires more).",
  "personalizationBullets are internal notes for the user — not part of the email body.",
  "EMAIL FORMAT (required):",
  "- body must use real email structure with blank lines between blocks (use \\n\\n in JSON).",
  "- Line 1: greeting with comma, e.g. Hi Alex,",
  "- Blank line, then 2-3 short paragraphs (1-3 sentences each).",
  "- Blank line, then a simple sign-off on its own line, e.g. Best,",
  "- Put a space after every comma and period. Never glue sentences together.",
  "- Never include URLs, markdown links, or bare domain links in subject or body.",
  "- Never use em dashes or en dashes. Use commas, periods, or short separate sentences instead.",
  "- Quotes are fine in plain text; attribute briefly in prose without pasting URLs.",
  "Return only valid JSON matching the required schema.",
  UNTRUSTED_CONTENT_SYSTEM_RULES,
].join("\n");

export const OUTREACH_EMAIL_GENERATION_CONFIG = {
  responseMimeType: "application/json",
  responseJsonSchema: {
    type: "object",
    properties: {
      subject: { type: "string" },
      body: { type: "string" },
      personalizationBullets: { type: "array", items: { type: "string" } },
      suggestedEdits: { type: "array", items: { type: "string" } },
      sources: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            url: { type: "string" },
            status: { type: "string", enum: ["ok", "skipped", "failed"] },
            failureReason: { type: "string" },
          },
          required: ["title", "url", "status"],
        },
      },
    },
    required: ["subject", "body", "personalizationBullets", "sources"],
  },
};

export function buildOutreachEmailUserMessage(params: {
  purpose: OutreachEmailPurpose;
  purposeNotes?: string;
  recipientName?: string;
  recipientRole?: string;
  tone?: OutreachEmailTone;
  scopeLabel: string;
  digests: TabDigest[];
}): string {
  const trusted = buildTrustedUserIntentBlock({
    purpose: params.purpose,
    scope: params.scopeLabel,
    recipient_name: params.recipientName,
    recipient_context: params.recipientRole,
    user_notes: params.purposeNotes,
    tone: params.tone,
  });
  const digests = wrapUntrustedJsonBlock("Tab digests", params.digests);
  return [trusted, "", digests].join("\n");
}
