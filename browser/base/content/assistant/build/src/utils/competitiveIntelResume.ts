import type { InteractionCommandArgs } from "../services/interactionState.js";

export const CI_WORKFLOW_CONTINUE_SENTINEL = "__CI_WORKFLOW_CONTINUE__";
export const CI_WORKFLOW_CANCEL_SENTINEL = "__CI_WORKFLOW_CANCEL__";
export const CI_POOL_CONFIRM_SENTINEL = "__CI_POOL_CONFIRM__";
export const CI_TIERS_CONFIRM_SENTINEL = "__CI_TIERS_CONFIRM__";
export const CI_REPORT_COMPACT_SENTINEL = "__CI_REPORT_COMPACT__";

const EXPAND_EXTERNAL_AI_RE =
  /^expand(?:\s+with)?\s+external\s+ai(?:\s+research)?$/i;
const REVIEW_DEEPEN_RE = /^add\s+review\s+enrichment$/i;
const REGENERATE_REPORT_RE = /^regenerate\s+report$/i;

export function isCompetitiveIntelExpandExternalAiText(text: string): boolean {
  return EXPAND_EXTERNAL_AI_RE.test(String(text || "").trim());
}

export function isCompetitiveIntelReviewDeepenText(text: string): boolean {
  return REVIEW_DEEPEN_RE.test(String(text || "").trim());
}

export function isCompetitiveIntelRegenerateReportText(text: string): boolean {
  return REGENERATE_REPORT_RE.test(String(text || "").trim());
}

const CONTINUE_RE =
  /^(?:continue|yes|go\s+ahead|proceed|next|i(?:'ve| have)\s+run\s+the\s+queries?)$/i;
const CANCEL_RE =
  /^(?:cancel(?:\s+competitive\s+intel)?|stop|nevermind|abort)$/i;

export function isCompetitiveIntelContinueText(text: string): boolean {
  return CONTINUE_RE.test(String(text || "").trim());
}

export function isCompetitiveIntelCancelText(text: string): boolean {
  return CANCEL_RE.test(String(text || "").trim());
}

export function buildCompetitiveIntelContinuePrompt(): string {
  return CI_WORKFLOW_CONTINUE_SENTINEL;
}

export function parseCompetitiveIntelWorkflowSentinel(
  text: string
): string | null {
  const raw = String(text || "").trim();
  if (
    raw === CI_WORKFLOW_CONTINUE_SENTINEL ||
    raw === CI_POOL_CONFIRM_SENTINEL ||
    raw === CI_TIERS_CONFIRM_SENTINEL ||
    raw === CI_REPORT_COMPACT_SENTINEL
  ) {
    return raw;
  }
  if (raw === CI_WORKFLOW_CANCEL_SENTINEL) {
    return raw;
  }
  return null;
}

const SENTINEL_DISPLAY_LABELS: Record<string, string> = {
  [CI_WORKFLOW_CONTINUE_SENTINEL]: "Continue",
  [CI_POOL_CONFIRM_SENTINEL]: "Continue",
  [CI_TIERS_CONFIRM_SENTINEL]: "Accept tiers & open enrichment tabs",
  [CI_REPORT_COMPACT_SENTINEL]: "Generate compact report",
  [CI_WORKFLOW_CANCEL_SENTINEL]: "Cancel competitive intel",
};

export function friendlyLabelForWorkflowSentinel(text: string): string | null {
  const sentinel = parseCompetitiveIntelWorkflowSentinel(text);
  if (!sentinel) {
    return null;
  }
  return SENTINEL_DISPLAY_LABELS[sentinel] || "Continue workflow";
}

export function buildCompetitiveIntelResumeArgs(
  sentinel: string
): InteractionCommandArgs {
  return {
    workflow_confirmed: true,
    workflow_action: sentinel,
  };
}
