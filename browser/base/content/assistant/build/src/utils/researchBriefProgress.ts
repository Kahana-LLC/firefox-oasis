import { OASIS_EVENT_BRIEF_PROGRESS } from "../../../shared/contracts.js";
import type {
  AssistantProgressContext,
  ResearchBriefProgressDetail,
} from "../../../shared/contracts.js";
import { assistantLogger } from "./assistantLogger.js";

let activeAbort: AbortController | null = null;

export function beginResearchBriefRun(): AbortSignal {
  activeAbort?.abort();
  activeAbort = new AbortController();
  return activeAbort.signal;
}

export function abortResearchBriefRun(): void {
  activeAbort?.abort();
}

export function clearResearchBriefRunAbort(): void {
  activeAbort = null;
}

export function finishResearchBriefRunFinalizing(
  context: AssistantProgressContext = "competitive_intel"
): void {
  clearResearchBriefRunAbort();
  emitResearchBriefProgress({
    phase: "synthesizing",
    context,
    label:
      context === "competitive_intel"
        ? "Finalizing report…"
        : "Finalizing brief…",
  });
  if (context === "competitive_intel") {
    assistantLogger.debug("competitiveIntel", "ci_finalizing");
  }
}

export function endResearchBriefRun(): void {
  clearResearchBriefRunAbort();
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
  const isCi = detail.context === "competitive_intel";
  if (detail.phase === "resolving") {
    return isCi ? "Matching enrichment tabs…" : "Finding tabs…";
  }
  if (detail.phase === "extracting" && detail.current != null && detail.total) {
    return isCi
      ? `Reading tab content (${detail.current} of ${detail.total})…`
      : `Reading page ${detail.current} of ${detail.total}…`;
  }
  if (detail.phase === "topic") {
    return "Choosing topic…";
  }
  if (detail.phase === "validating") {
    if (detail.attempt != null && detail.maxAttempts) {
      return isCi
        ? `Validating report grounding (attempt ${detail.attempt} of ${detail.maxAttempts})…`
        : `Validating output (attempt ${detail.attempt} of ${detail.maxAttempts})…`;
    }
    return isCi ? "Validating report grounding…" : "Validating output…";
  }
  if (detail.phase === "synthesizing") {
    return isCi
      ? "Writing competitive intelligence report…"
      : "Building your research brief…";
  }
  return isCi
    ? "Generating competitive intelligence report…"
    : "Building research brief…";
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
