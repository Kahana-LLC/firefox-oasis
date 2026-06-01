import { useEffect, useState } from 'preact/hooks';
import {
  OASIS_EVENT_BRIEF_PROGRESS,
  type ResearchBriefProgressDetail,
} from '../../../shared/contracts.js';

function formatResearchBriefProgressLabel(
  detail: ResearchBriefProgressDetail
): string {
  if (detail.label?.trim()) {
    return detail.label.trim();
  }
  if (detail.phase === 'resolving') {
    return 'Finding tabs…';
  }
  if (detail.phase === 'extracting' && detail.current != null && detail.total) {
    return `Reading page ${detail.current} of ${detail.total}…`;
  }
  if (detail.phase === 'topic') {
    return 'Choosing topic…';
  }
  if (detail.phase === 'synthesizing') {
    return 'Building your research brief…';
  }
  return 'Building research brief…';
}

export function useResearchBriefProgress() {
  const [briefProgressLabel, setBriefProgressLabel] = useState<string | null>(
    null
  );

  useEffect(() => {
    const onProgress = (event: Event) => {
      const detail = (event as CustomEvent<ResearchBriefProgressDetail | null>)
        .detail;
      if (detail === null) {
        setBriefProgressLabel(null);
        return;
      }
      setBriefProgressLabel(formatResearchBriefProgressLabel(detail));
    };
    window.addEventListener(OASIS_EVENT_BRIEF_PROGRESS, onProgress);
    return () => {
      window.removeEventListener(OASIS_EVENT_BRIEF_PROGRESS, onProgress);
    };
  }, []);

  return { briefProgressLabel, setBriefProgressLabel };
}
