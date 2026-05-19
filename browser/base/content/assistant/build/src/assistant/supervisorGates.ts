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
  PendingAmbiguity,
  PendingClarification,
  PendingConfirmation,
} from "../services/interactionState.js";
import {
  looksLikeNewActionCommand,
  parseAmbiguityResolution,
} from "../utils/routingUtils.js";

const CONFIRM_RE = /^(?:yes|confirm|do\s+it|go\s+ahead|approve|ok|okay)$/i;
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

export function resolvePendingConfirmationGate(params: {
  confirmationText: string;
  pendingConfirmation: PendingConfirmation | null;
  justRanConfirm: boolean;
}): ConfirmationGateDecision {
  const { confirmationText, pendingConfirmation, justRanConfirm } = params;
  const confirmMatch = CONFIRM_RE.test(confirmationText);
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

  if (looksLikeNewActionCommand(commandText)) {
    return { kind: "clear" };
  }

  return { kind: "cancel" };
}
