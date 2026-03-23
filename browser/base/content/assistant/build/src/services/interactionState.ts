/**
 * Interaction state store — transient state for multi-turn flows.
 *
 * Singleton managing:
 * - pendingConfirmation: destructive action awaiting "yes"/"no"
 * - pendingAmbiguity: target matching both a tab group and folder
 * - continuationQueue: remaining chained commands after confirmation
 * - recentSearchResults: cached results for "open result #N" follow-ups
 *
 * Emits CustomEvents to notify the UI of state changes.
 */
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

export type RecentSearchResult = {
  index: number;
  source: string;
  title: string;
  url: string;
  bookmarkGuid?: string;
  context?: string;
  snippet?: string;
};

class InteractionStateStore {
  private pendingConfirmation: PendingConfirmation | null = null;
  private pendingAmbiguity: PendingAmbiguity | null = null;
  private continuationQueue: string[] = [];
  private recentSearchResults: RecentSearchResult[] = [];
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

  getContinuationQueue(): string[] {
    return [...this.continuationQueue];
  }

  setContinuationQueue(queue: string[]): void {
    this.continuationQueue = queue
      .map(item => String(item || "").trim())
      .filter(Boolean);
    assistantLogger.debug("interaction", "Continuation queue updated", {
      length: this.continuationQueue.length,
    });
  }

  takeContinuationQueue(): string[] {
    const next = [...this.continuationQueue];
    this.continuationQueue = [];
    if (next.length > 0) {
      assistantLogger.debug("interaction", "Continuation queue consumed", {
        length: next.length,
      });
    }
    return next;
  }

  clearContinuationQueue(): void {
    if (this.continuationQueue.length > 0) {
      assistantLogger.debug("interaction", "Continuation queue cleared", {
        length: this.continuationQueue.length,
      });
    }
    this.continuationQueue = [];
  }

  getRecentSearchResults(): RecentSearchResult[] {
    return this.recentSearchResults.map(result => ({ ...result }));
  }

  setRecentSearchResults(results: RecentSearchResult[]): void {
    this.recentSearchResults = results
      .filter(result => !!result.url)
      .slice(0, 25)
      .map(result => ({ ...result }));
    assistantLogger.debug("interaction", "Recent search results updated", {
      count: this.recentSearchResults.length,
    });
  }

  clearRecentSearchResults(): void {
    if (this.recentSearchResults.length > 0) {
      assistantLogger.debug("interaction", "Recent search results cleared");
    }
    this.recentSearchResults = [];
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

export function getContinuationQueue(): string[] {
  return interactionState.getContinuationQueue();
}

export function setContinuationQueue(queue: string[]): void {
  interactionState.setContinuationQueue(queue);
}

export function takeContinuationQueue(): string[] {
  return interactionState.takeContinuationQueue();
}

export function clearContinuationQueue(): void {
  interactionState.clearContinuationQueue();
}

export function getRecentSearchResults(): RecentSearchResult[] {
  return interactionState.getRecentSearchResults();
}

export function setRecentSearchResults(results: RecentSearchResult[]): void {
  interactionState.setRecentSearchResults(results);
}

export function clearRecentSearchResults(): void {
  interactionState.clearRecentSearchResults();
}
