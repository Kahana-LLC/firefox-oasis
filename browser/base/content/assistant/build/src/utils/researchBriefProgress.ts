import { OASIS_EVENT_BRIEF_PROGRESS } from "../../../shared/contracts.js";
import type { ResearchBriefProgressDetail } from "../../../shared/contracts.js";

let activeAbort: AbortController | null = null;

export function beginResearchBriefRun(): AbortSignal {
  activeAbort?.abort();
  activeAbort = new AbortController();
  return activeAbort.signal;
}

export function abortResearchBriefRun(): void {
  activeAbort?.abort();
}

export function endResearchBriefRun(): void {
  activeAbort = null;
  emitResearchBriefProgress(null);
}

export function getResearchBriefAbortSignal(): AbortSignal | undefined {
  return activeAbort?.signal;
}

export function throwIfResearchBriefAborted(signal?: AbortSignal): void {
  const active = signal ?? activeAbort?.signal;
  if (active?.aborted) {
    throw new DOMException("Research brief cancelled.", "AbortError");
  }
}

export function emitResearchBriefProgress(
  detail: ResearchBriefProgressDetail | null
): void {
  try {
    window.dispatchEvent(
      new CustomEvent(OASIS_EVENT_BRIEF_PROGRESS, { detail })
    );
  } catch {
    void 0;
  }
}

export function formatResearchBriefProgressLabel(
  detail: ResearchBriefProgressDetail
): string {
  if (detail.label?.trim()) {
    return detail.label.trim();
  }
  if (detail.phase === "resolving") {
    return "Finding tabs…";
  }
  if (detail.phase === "extracting" && detail.current != null && detail.total) {
    return `Reading page ${detail.current} of ${detail.total}…`;
  }
  if (detail.phase === "topic") {
    return "Choosing topic…";
  }
  if (detail.phase === "synthesizing") {
    return "Building your research brief…";
  }
  return "Building research brief…";
}

export type ResearchBriefProgressCallback = (
  detail: ResearchBriefProgressDetail
) => void;

export function createResearchBriefProgressReporter(
  signal?: AbortSignal
): ResearchBriefProgressCallback {
  return detail => {
    throwIfResearchBriefAborted(signal);
    emitResearchBriefProgress(detail);
  };
}
