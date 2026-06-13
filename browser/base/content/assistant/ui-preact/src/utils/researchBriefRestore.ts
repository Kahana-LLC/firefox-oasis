import { buildResearchBriefToolMessage } from "../../../build/src/utils/researchBriefRequest.js";
import type {
  ResearchBrief,
  TabDigest,
} from "../../../build/src/services/researchBriefTypes.js";
import type { PinnedResearchBrief } from "../researchBriefPinStore";
import type { OasisWindow } from "../types";

const oasisWindow = window as OasisWindow;

export function toolMessageFromPinned(row: PinnedResearchBrief): string {
  const brief = JSON.parse(row.briefJson) as ResearchBrief;
  const digests = JSON.parse(row.digestsJson) as TabDigest[];
  return buildResearchBriefToolMessage({
    markdown: row.markdown,
    brief,
    briefId: row.briefId,
    digests,
  });
}

export function hydrateResearchBriefCacheFromPinned(
  row: PinnedResearchBrief
): void {
  const brief = JSON.parse(row.briefJson) as ResearchBrief;
  const digests = JSON.parse(row.digestsJson) as TabDigest[];
  oasisWindow.oasisStoreResearchBriefRun?.({
    briefId: row.briefId,
    brief,
    digests,
    markdown: row.markdown,
  });
}
