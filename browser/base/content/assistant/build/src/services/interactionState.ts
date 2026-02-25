import type { AssistantWindowLike } from "../types/runtime.js";
import type {
  AmbiguityTarget,
  InteractionCommandArgs,
  PendingAmbiguityPayload,
  PendingConfirmationPayload,
} from "../../../shared/contracts.js";
import { OASIS_EVENT_CONFIRMATION_UPDATE } from "../../../shared/contracts.js";
import { assistantLogger } from "../utils/assistantLogger.js";

export type { InteractionCommandArgs, AmbiguityTarget };

export type PendingConfirmation = PendingConfirmationPayload;

export type PendingAmbiguity = PendingAmbiguityPayload;

class InteractionStateStore {
  private pendingConfirmation: PendingConfirmation | null = null;
  private pendingAmbiguity: PendingAmbiguity | null = null;
  private readonly assistantWindow: AssistantWindowLike;

  constructor(assistantWindow: AssistantWindowLike = window as AssistantWindowLike) {
    this.assistantWindow = assistantWindow;
    this.assistantWindow.oasisGetPendingConfirmation = () =>
      this.getPendingConfirmation();
    this.assistantWindow.oasisClearPendingConfirmation = () =>
      this.clearPendingConfirmation();
    this.assistantWindow.oasisGetPendingAmbiguity = () =>
      this.getPendingAmbiguity();
  }

  getPendingConfirmation(): PendingConfirmation | null {
    return this.pendingConfirmation;
  }

  setPendingConfirmation(pending: PendingConfirmation | null): void {
    this.pendingConfirmation = pending;
    if (pending) {
      this.clearPendingAmbiguity();
    }
    this.emitConfirmationUpdate(pending);
  }

  clearPendingConfirmation(): void {
    this.pendingConfirmation = null;
    this.emitConfirmationUpdate(null);
  }

  getPendingAmbiguity(): PendingAmbiguity | null {
    return this.pendingAmbiguity;
  }

  setPendingAmbiguity(pending: PendingAmbiguity | null): void {
    this.pendingAmbiguity = pending;
    if (pending) {
      assistantLogger.debug("interaction", "Pending ambiguity set", {
        kind: pending.kind,
        name: pending.name,
        query: pending.query || "",
        all: !!pending.all,
      });
      return;
    }
    assistantLogger.debug("interaction", "Pending ambiguity cleared");
  }

  clearPendingAmbiguity(): void {
    this.pendingAmbiguity = null;
  }

  private emitConfirmationUpdate(pending: PendingConfirmation | null): void {
    try {
      const relay = this.assistantWindow.oasisSetPendingConfirmationRelay;
      if (typeof relay === "function") {
        relay(pending);
      }
      window.dispatchEvent(
        new CustomEvent(OASIS_EVENT_CONFIRMATION_UPDATE, { detail: pending })
      );
    } catch (error) {
      assistantLogger.error(
        "interaction",
        "Failed to update pending confirmation state",
        error
      );
    }
  }
}

export const interactionState = new InteractionStateStore();

export function getPendingConfirmation(): PendingConfirmation | null {
  return interactionState.getPendingConfirmation();
}

export function setPendingConfirmation(pending: PendingConfirmation | null): void {
  interactionState.setPendingConfirmation(pending);
}

export function clearPendingConfirmation(): void {
  interactionState.clearPendingConfirmation();
}

export function getPendingAmbiguity(): PendingAmbiguity | null {
  return interactionState.getPendingAmbiguity();
}

export function setPendingAmbiguity(pending: PendingAmbiguity | null): void {
  interactionState.setPendingAmbiguity(pending);
}

export function clearPendingAmbiguity(): void {
  interactionState.clearPendingAmbiguity();
}
