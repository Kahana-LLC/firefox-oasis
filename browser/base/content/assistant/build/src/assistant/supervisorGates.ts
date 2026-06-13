/**
 * Confirmation, ambiguity & clarification gates — checked BEFORE any routing.
 *
 * When the supervisor receives a new user message, these gates run first:
 * - Confirmation gate: if a destructive action is pending and the user
 *   says "yes"/"no", routes directly to confirm_action (skips LLM).
 * - Ambiguity gate: if the user was asked "tab group or bookmark folder?",
 *   routes to resolve_ambiguity based on their reply.
 * - Clarification gate: if the LLM asked the user to pick from 2-3
 *   reformulations, resolves the selected option and re-routes with it.
 *
 * If no gate fires, normal routing proceeds.
 */
import type {
  InteractionCommandArgs,
  PendingAmbiguity,
  PendingClarification,
  PendingConfirmation,
} from "../services/interactionState.js";
import {
  getCompetitiveIntelWorkflow,
  isCompetitiveIntelWorkflowActive,
  restoreCompetitiveIntelWorkflowFromStorage,
} from "../services/competitiveIntelWorkflow.js";
import type { PendingProposedAction } from "../utils/proposedActionUtils.js";
import { isAffirmativeFollowUp } from "../utils/proposedActionUtils.js";
import {
  CI_REPORT_COMPACT_SENTINEL,
  CI_TIERS_CONFIRM_SENTINEL,
  CI_WORKFLOW_CANCEL_SENTINEL,
  isCompetitiveIntelCancelText,
  isCompetitiveIntelContinueText,
  isCompetitiveIntelExpandExternalAiText,
  isCompetitiveIntelRegenerateReportText,
  isCompetitiveIntelReviewDeepenText,
  parseCompetitiveIntelWorkflowSentinel,
} from "../utils/competitiveIntelResume.js";
import { looksLikeUrlOverrideText } from "../utils/competitiveIntelUrlOverrides.js";
import {
  looksLikeNewActionCommand,
  parseAmbiguityResolution,
} from "../utils/routingUtils.js";

const CONFIRM_RE = /^(?:yes|confirm|do\s+it|go\s+ahead|approve|ok|okay)$/i;
const CI_TIER_CONFIRM_RE =
  /^(?:continue|yes|confirm|do\s+it|go\s+ahead|approve|ok|okay)$/i;
const CANCEL_RE = /^(?:no|cancel|nevermind|don'?t|stop)$/i;
const CLARIFY_OPTION_RE = /^(?:clarify:opt_(\d+)|^(\d+)$)/i;
const CLARIFY_NONE_RE = /^(?:none|cancel|nevermind|other|skip)$/i;

type RouteGateDecision = {
  kind: "route";
  next: "confirm_action" | "resolve_ambiguity" | "chat";
  args: Record<string, unknown>;
};

type EndGateDecision = {
  kind: "end";
};

type ClearGateDecision = {
  kind: "clear";
};

type NoneGateDecision = {
  kind: "none";
};

export type ConfirmationGateDecision =
  | RouteGateDecision
  | EndGateDecision
  | NoneGateDecision;

export type AmbiguityGateDecision =
  | RouteGateDecision
  | ClearGateDecision
  | NoneGateDecision;

type ClarificationResolvedDecision = {
  kind: "resolved";
  resolvedPrompt: string;
};

type ClarificationCancelDecision = {
  kind: "cancel";
};

export type ClarificationGateDecision =
  | ClarificationResolvedDecision
  | ClarificationCancelDecision
  | ClearGateDecision
  | NoneGateDecision;

type ProposedActionResolvedDecision = {
  kind: "resolved";
  resolvedPrompt: string;
  suggestedTool?: string;
};

type ProposedActionCancelDecision = {
  kind: "cancel";
};

export type ProposedActionGateDecision =
  | ProposedActionResolvedDecision
  | ProposedActionCancelDecision
  | NoneGateDecision;

type CompetitiveIntelRouteDecision = {
  kind: "route";
  args: InteractionCommandArgs;
  clearPendingConfirmation?: boolean;
};

type CompetitiveIntelBlockDecision = {
  kind: "block";
  message: string;
};

export type CompetitiveIntelGateDecision =
  | CompetitiveIntelRouteDecision
  | CompetitiveIntelBlockDecision
  | NoneGateDecision;

export function resolveCompetitiveIntelWorkflowGate(params: {
  commandText: string;
  confirmationText: string;
  pendingConfirmation: PendingConfirmation | null;
  hasQueuedCommands: boolean;
  justRanTool?: boolean;
}): CompetitiveIntelGateDecision {
  const {
    commandText,
    confirmationText,
    pendingConfirmation,
    hasQueuedCommands,
    justRanTool = false,
  } = params;

  if (pendingConfirmation?.command === "run_competitive_intel") {
    const acceptText = String(confirmationText || commandText || "").trim();
    if (CI_TIER_CONFIRM_RE.test(acceptText)) {
      return {
        kind: "route",
        args: { ...pendingConfirmation.args },
        clearPendingConfirmation: true,
      };
    }
    if (isCompetitiveIntelCancelText(acceptText)) {
      return {
        kind: "route",
        args: {
          industry:
            typeof pendingConfirmation.args.industry === "string"
              ? pendingConfirmation.args.industry
              : getCompetitiveIntelWorkflow()?.industry,
          workflow_action: CI_WORKFLOW_CANCEL_SENTINEL,
        },
        clearPendingConfirmation: true,
      };
    }
    return { kind: "none" };
  }

  if (hasQueuedCommands || justRanTool) {
    return { kind: "none" };
  }

  restoreCompetitiveIntelWorkflowFromStorage();
  const workflow = getCompetitiveIntelWorkflow();
  if (!workflow) {
    return { kind: "none" };
  }

  if (
    workflow.step === "done" &&
    isCompetitiveIntelExpandExternalAiText(commandText)
  ) {
    const args: InteractionCommandArgs = {
      industry: workflow.industry,
      workflow_confirmed: true,
      workflow_action: "expand_external_ai",
    };
    if (workflow.focus) args.focus = workflow.focus;
    return { kind: "route", args };
  }

  if (
    workflow.step === "done" &&
    isCompetitiveIntelReviewDeepenText(commandText)
  ) {
    const args: InteractionCommandArgs = {
      industry: workflow.industry,
      workflow_confirmed: true,
      workflow_action: "review_deepen",
    };
    if (workflow.focus) args.focus = workflow.focus;
    return { kind: "route", args };
  }

  if (
    workflow.step === "done" &&
    isCompetitiveIntelRegenerateReportText(commandText)
  ) {
    const args: InteractionCommandArgs = {
      industry: workflow.industry,
      workflow_confirmed: true,
      workflow_action: "regenerate_report",
    };
    if (workflow.focus) args.focus = workflow.focus;
    return { kind: "route", args };
  }

  if (!isCompetitiveIntelWorkflowActive()) {
    return { kind: "none" };
  }

  const sentinel =
    parseCompetitiveIntelWorkflowSentinel(commandText) ||
    parseCompetitiveIntelWorkflowSentinel(confirmationText);

  if (
    sentinel === CI_WORKFLOW_CANCEL_SENTINEL ||
    isCompetitiveIntelCancelText(commandText) ||
    isCompetitiveIntelCancelText(confirmationText)
  ) {
    return {
      kind: "route",
      args: {
        industry: workflow.industry,
        workflow_action: CI_WORKFLOW_CANCEL_SENTINEL,
      },
    };
  }

  if (
    sentinel ||
    isCompetitiveIntelContinueText(commandText) ||
    isCompetitiveIntelContinueText(confirmationText)
  ) {
    const args: InteractionCommandArgs = {
      industry: workflow.industry,
      workflow_confirmed: true,
    };
    if (workflow.focus) {
      args.focus = workflow.focus;
    }
    if (sentinel === CI_TIERS_CONFIRM_SENTINEL) {
      args.workflow_action = CI_TIERS_CONFIRM_SENTINEL;
    } else if (sentinel === CI_REPORT_COMPACT_SENTINEL) {
      args.workflow_action = CI_REPORT_COMPACT_SENTINEL;
      args.quota_mode = "compact";
    } else if (sentinel) {
      args.workflow_action = sentinel;
    }
    return { kind: "route", args };
  }

  const tierEditMatch = commandText.match(
    /\bmove\s+(.+?)\s+to\s+(high|medium|low|adjacent)\b/i
  );
  if (tierEditMatch && workflow.step === "tiers") {
    const args: InteractionCommandArgs = {
      industry: workflow.industry,
      tier_edit: commandText,
    };
    if (workflow.focus) {
      args.focus = workflow.focus;
    }
    return { kind: "route", args };
  }

  if (looksLikeUrlOverrideText(commandText) && workflow.step === "tiers") {
    const args: InteractionCommandArgs = {
      industry: workflow.industry,
      tier_edit: commandText,
    };
    if (workflow.focus) {
      args.focus = workflow.focus;
    }
    return { kind: "route", args };
  }

  if (!pendingConfirmation && looksLikeNewActionCommand(commandText)) {
    return {
      kind: "block",
      message:
        "A competitive intelligence workflow is in progress. Reply **continue** to advance, or say **cancel competitive intel** to stop.",
    };
  }

  return { kind: "none" };
}

export function resolvePendingProposedActionGate(params: {
  confirmationText: string;
  pendingProposedAction: PendingProposedAction | null;
  pendingConfirmation: PendingConfirmation | null;
  hasPendingContinuation?: boolean;
}): ProposedActionGateDecision {
  const {
    confirmationText,
    pendingProposedAction,
    pendingConfirmation,
    hasPendingContinuation = false,
  } = params;
  if (hasPendingContinuation) {
    return { kind: "none" };
  }
  if (!pendingProposedAction || pendingConfirmation) {
    return { kind: "none" };
  }

  if (CANCEL_RE.test(confirmationText)) {
    return { kind: "cancel" };
  }

  if (isAffirmativeFollowUp(confirmationText)) {
    return {
      kind: "resolved",
      resolvedPrompt: pendingProposedAction.proposedPrompt,
      suggestedTool: pendingProposedAction.suggestedTool,
    };
  }

  return { kind: "none" };
}

export function resolvePendingConfirmationGate(params: {
  confirmationText: string;
  pendingConfirmation: PendingConfirmation | null;
  justRanConfirm: boolean;
}): ConfirmationGateDecision {
  const { confirmationText, pendingConfirmation, justRanConfirm } = params;
  const confirmMatch =
    CONFIRM_RE.test(confirmationText) ||
    (pendingConfirmation?.command === "run_competitive_intel" &&
      CI_TIER_CONFIRM_RE.test(confirmationText));
  const cancelMatch = CANCEL_RE.test(confirmationText);

  if ((confirmMatch || cancelMatch) && pendingConfirmation && !justRanConfirm) {
    return {
      kind: "route",
      next: "confirm_action",
      args: { confirmed: confirmMatch },
    };
  }

  if (pendingConfirmation) {
    return { kind: "end" };
  }

  return { kind: "none" };
}

export function resolvePendingAmbiguityGate(params: {
  pendingAmbiguity: PendingAmbiguity | null;
  confirmationText: string;
  commandText: string;
  lastWorker: string;
}): AmbiguityGateDecision {
  const { pendingAmbiguity, confirmationText, commandText, lastWorker } =
    params;
  if (!pendingAmbiguity) {
    return { kind: "none" };
  }

  if (lastWorker === "resolve_ambiguity") {
    return { kind: "route", next: "chat", args: {} };
  }

  const resolution = parseAmbiguityResolution(confirmationText);
  if (resolution) {
    return {
      kind: "route",
      next: "resolve_ambiguity",
      args: { target: resolution },
    };
  }

  const wordCount = confirmationText.split(/\s+/).filter(Boolean).length;
  if (!looksLikeNewActionCommand(commandText) && wordCount <= 3) {
    return { kind: "route", next: "resolve_ambiguity", args: {} };
  }

  return { kind: "clear" };
}

export function resolvePendingClarificationGate(params: {
  pendingClarification: PendingClarification | null;
  confirmationText: string;
  commandText: string;
}): ClarificationGateDecision {
  const { pendingClarification, confirmationText, commandText } = params;
  if (!pendingClarification) {
    return { kind: "none" };
  }

  if (CLARIFY_NONE_RE.test(confirmationText.trim())) {
    return { kind: "cancel" };
  }

  const optMatch = CLARIFY_OPTION_RE.exec(confirmationText.trim());
  if (optMatch) {
    const idx = parseInt(optMatch[1] || optMatch[2], 10) - 1;
    if (idx === pendingClarification.options.length) {
      return { kind: "cancel" };
    }
    const option = pendingClarification.options[idx];
    if (option) {
      return { kind: "resolved", resolvedPrompt: option.resolvedPrompt };
    }
  }

  const lower = confirmationText.trim().toLowerCase();
  for (const option of pendingClarification.options) {
    if (option.label.toLowerCase() === lower || option.id === lower) {
      return { kind: "resolved", resolvedPrompt: option.resolvedPrompt };
    }
  }

  const briefOptions = pendingClarification.options.filter(o =>
    /research\s+brief/i.test(o.label)
  );
  if (CONFIRM_RE.test(confirmationText.trim())) {
    if (briefOptions.length === 1) {
      return {
        kind: "resolved",
        resolvedPrompt: briefOptions[0].resolvedPrompt,
      };
    }
    const second = pendingClarification.options[1];
    if (second && /research\s+brief/i.test(second.label)) {
      return { kind: "resolved", resolvedPrompt: second.resolvedPrompt };
    }
  }

  const minFuzzyLen = 8;
  if (lower.length >= minFuzzyLen) {
    for (const option of pendingClarification.options) {
      const labelLower = option.label.toLowerCase();
      if (labelLower.includes(lower) || lower.includes(labelLower)) {
        return { kind: "resolved", resolvedPrompt: option.resolvedPrompt };
      }
    }
  }

  return { kind: "clear" };
}
