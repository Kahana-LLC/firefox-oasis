import { OASIS_EVENT_CI_REPORT_READY } from "../../../shared/contracts.js";
import {
  clearPendingClarification,
  clearPendingConfirmation,
} from "../services/interactionState.js";
import { endResearchBriefRun } from "./researchBriefProgress.js";
import { hasCompetitiveIntelMarker } from "./competitiveIntelRequest.js";

export function emitCiReportReady(): void {
  try {
    window.dispatchEvent(new CustomEvent(OASIS_EVENT_CI_REPORT_READY));
  } catch {
    void 0;
  }
}

export function emitOasisUsageUpdate(immediate = false): void {
  try {
    window.dispatchEvent(
      new CustomEvent("oasis-usage-update", {
        detail: immediate ? { immediate: true } : undefined,
      })
    );
  } catch {
    void 0;
  }
}

export function finalizeCiReportInteractionUnlock(): void {
  endResearchBriefRun();
  clearPendingClarification();
  clearPendingConfirmation();
  emitCiReportReady();
}

export function maybeFinalizeCiReportFromText(text: string): boolean {
  if (!hasCompetitiveIntelMarker(text)) {
    return false;
  }
  finalizeCiReportInteractionUnlock();
  emitOasisUsageUpdate(true);
  return true;
}
