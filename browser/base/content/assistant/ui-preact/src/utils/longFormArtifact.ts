import { hasOutreachEmailMarker } from "../../../build/src/utils/outreachEmailRequest.js";
import { hasResearchBriefMarker } from "../../../build/src/utils/researchBriefRequest.js";
import { hasCompetitiveIntelMarker } from "../../../build/src/utils/competitiveIntelRequest.js";
import { hasCompetitiveIntelWorkflowMarker } from "../../../build/src/utils/competitiveIntelWorkflowRequest.js";
import {
  isCompetitiveIntelMarkdown,
  isResearchBriefMarkdown,
  textForClipboard,
} from "./copyToClipboard";

const LONG_MARKDOWN_CHAR_THRESHOLD = 1200;
const STRUCTURED_MARKDOWN_CHAR_THRESHOLD = 400;
const MULTILINE_ARTIFACT_LINE_THRESHOLD = 3;
const MULTILINE_ARTIFACT_CHAR_THRESHOLD = 200;

export function isLongFormAiArtifact(content: string): boolean {
  const raw = String(content || "");
  if (!raw.trim()) {
    return false;
  }
  if (hasResearchBriefMarker(raw) || hasOutreachEmailMarker(raw)) {
    return true;
  }
  if (
    hasCompetitiveIntelMarker(raw) ||
    hasCompetitiveIntelWorkflowMarker(raw)
  ) {
    return true;
  }

  const display = textForClipboard(raw);
  if (isResearchBriefMarkdown(raw) || isCompetitiveIntelMarkdown(raw)) {
    return true;
  }
  if (
    /^# /m.test(display) &&
    display.length > STRUCTURED_MARKDOWN_CHAR_THRESHOLD
  ) {
    return true;
  }
  if ((display.match(/^## /gm) || []).length >= 2) {
    return true;
  }
  if ((display.match(/^- /gm) || []).length >= 4) {
    return true;
  }
  const nonEmptyLines = display
    .split("\n")
    .filter(line => line.trim().length > 0);
  if (
    nonEmptyLines.length >= MULTILINE_ARTIFACT_LINE_THRESHOLD &&
    display.length >= MULTILINE_ARTIFACT_CHAR_THRESHOLD
  ) {
    return true;
  }
  if (
    /\bContinue\?\s*$/i.test(display) &&
    (display.length > 180 || nonEmptyLines.length >= 3)
  ) {
    return true;
  }
  if (
    /\bProceed\?\s*$/i.test(display) &&
    (display.length > 120 || nonEmptyLines.length >= 2)
  ) {
    return true;
  }
  if (display.length >= LONG_MARKDOWN_CHAR_THRESHOLD) {
    return true;
  }
  return false;
}
