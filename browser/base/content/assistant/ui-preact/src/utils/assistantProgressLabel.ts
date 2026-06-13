import type {
  AssistantProgressContext,
  ResearchBriefProgressDetail,
  ResearchBriefProgressPhase,
} from "../../../shared/contracts.js";

export function formatAssistantProgressLabel(
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

export function assistantProgressHeadline(
  context: AssistantProgressContext | undefined
): string | null {
  if (context === "competitive_intel") {
    return "Generating competitive intelligence report";
  }
  if (context === "research_brief") {
    return "Building research brief";
  }
  return null;
}

const CI_REPORT_PHASE_ORDER: ResearchBriefProgressPhase[] = [
  "resolving",
  "extracting",
  "synthesizing",
  "validating",
];

const CI_REPORT_STEP_LABELS: Record<ResearchBriefProgressPhase, string> = {
  resolving: "Match enrichment tabs",
  extracting: "Read tab content",
  synthesizing: "Write report",
  validating: "Validate grounding",
  topic: "Choose topic",
};

export type ProgressStepStatus = "done" | "active" | "pending";

export type ProgressStepRow = {
  phase: ResearchBriefProgressPhase;
  label: string;
  status: ProgressStepStatus;
  detail?: string;
};

export function buildCiReportProgressSteps(
  detail: ResearchBriefProgressDetail | null
): ProgressStepRow[] {
  const phases = CI_REPORT_PHASE_ORDER;
  if (!detail || detail.context !== "competitive_intel") {
    return [];
  }
  const activeIndex = phases.indexOf(detail.phase);
  return phases.map((phase, index) => {
    let status: ProgressStepStatus = "pending";
    if (activeIndex >= 0 && index < activeIndex) {
      status = "done";
    } else if (phase === detail.phase) {
      status = "active";
    }
    let stepDetail: string | undefined;
    if (status === "active" && phase === "extracting" && detail.total) {
      stepDetail = `${detail.current ?? 0} of ${detail.total}`;
    }
    if (
      status === "active" &&
      phase === "validating" &&
      detail.attempt != null &&
      detail.maxAttempts
    ) {
      stepDetail = `attempt ${detail.attempt} of ${detail.maxAttempts}`;
    }
    return {
      phase,
      label: CI_REPORT_STEP_LABELS[phase],
      status,
      detail: stepDetail,
    };
  });
}
