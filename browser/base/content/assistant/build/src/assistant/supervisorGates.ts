import type {
  PendingAmbiguity,
  PendingConfirmation,
} from "../services/interactionState.js";
import {
  looksLikeNewActionCommand,
  parseAmbiguityResolution,
} from "../utils/routingUtils.js";

const CONFIRM_RE = /^(?:yes|confirm|do\s+it|go\s+ahead|approve|ok|okay)$/i;
const CANCEL_RE = /^(?:no|cancel|nevermind|don'?t|stop)$/i;

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
  const { pendingAmbiguity, confirmationText, commandText, lastWorker } = params;
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
