import { useEffect, useMemo, useState } from "preact/hooks";
import {
  OASIS_EVENT_BRIEF_PROGRESS,
  type ResearchBriefProgressDetail,
} from "../../../shared/contracts.js";
import {
  assistantProgressHeadline,
  buildCiReportProgressSteps,
  formatAssistantProgressLabel,
  type ProgressStepRow,
} from "../utils/assistantProgressLabel";

export function useResearchBriefProgress() {
  const [progressDetail, setProgressDetail] =
    useState<ResearchBriefProgressDetail | null>(null);

  useEffect(() => {
    const onProgress = (event: Event) => {
      const detail = (event as CustomEvent<ResearchBriefProgressDetail | null>)
        .detail;
      if (detail === null) {
        setProgressDetail(null);
        return;
      }
      setProgressDetail(detail);
    };
    window.addEventListener(OASIS_EVENT_BRIEF_PROGRESS, onProgress);
    return () => {
      window.removeEventListener(OASIS_EVENT_BRIEF_PROGRESS, onProgress);
    };
  }, []);

  const briefProgressLabel = useMemo(
    () =>
      progressDetail ? formatAssistantProgressLabel(progressDetail) : null,
    [progressDetail]
  );

  const progressHeadline = useMemo(
    () => assistantProgressHeadline(progressDetail?.context),
    [progressDetail?.context]
  );

  const progressSteps: ProgressStepRow[] = useMemo(
    () => buildCiReportProgressSteps(progressDetail),
    [progressDetail]
  );

  return {
    briefProgressLabel,
    progressDetail,
    progressHeadline,
    progressSteps,
    setBriefProgressLabel: (label: string | null) => {
      setProgressDetail(
        label
          ? {
              phase: "synthesizing",
              label,
            }
          : null
      );
    },
  };
}
