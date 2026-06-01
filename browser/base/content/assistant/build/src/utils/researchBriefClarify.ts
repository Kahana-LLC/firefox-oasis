import type { BrowserTabGroupLike } from "../types/runtime.js";
import type { TabDigest } from "../services/researchBriefTypes.js";
import { estimateSynthesisTokens } from "../services/researchBriefFormat.js";
import {
  buildAmbiguousGroupClarification,
  type GroupClarifyCandidate,
} from "./researchBriefResume.js";

export function groupCandidatesFromFuzzy(
  alternatives: BrowserTabGroupLike[]
): GroupClarifyCandidate[] {
  return alternatives.map(group => {
    const name = String(group.label || "Untitled").trim();
    const tabCount = Array.from(group.tabs || []).length;
    return {
      id: `brief_group:${encodeURIComponent(name)}`,
      label: `Tab group: ${name} (${tabCount} tabs)`,
      name,
      tabCount,
    };
  });
}

export function suggestTabCountForQuota(
  digests: TabDigest[],
  remainingTokens: number
): number {
  if (digests.length === 0 || remainingTokens <= 0) {
    return 1;
  }
  let low = 1;
  let high = digests.length;
  let best = 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const slice = digests.slice(0, mid);
    const estimate = estimateSynthesisTokens(slice);
    if (estimate <= remainingTokens) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return Math.max(1, best);
}

export { buildAmbiguousGroupClarification, buildOverQuotaClarification } from "./researchBriefResume.js";
