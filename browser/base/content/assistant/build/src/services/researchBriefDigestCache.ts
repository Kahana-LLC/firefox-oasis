import type { TabDigest } from "./researchBriefTypes.js";
import type { ResearchBrief } from "./researchBriefTypes.js";

export type CachedResearchBriefRun = {
  briefId: string;
  brief: ResearchBrief;
  digests: TabDigest[];
  markdown: string;
};

const cache = new Map<string, CachedResearchBriefRun>();
let latestBriefId: string | null = null;

export function storeResearchBriefRun(run: CachedResearchBriefRun): void {
  cache.set(run.briefId, run);
  latestBriefId = run.briefId;
}

export function getCachedResearchBriefRun(
  briefId?: string
): CachedResearchBriefRun | null {
  const id = briefId || latestBriefId;
  if (!id) {
    return null;
  }
  return cache.get(id) ?? null;
}

export function getLatestResearchBriefRun(): CachedResearchBriefRun | null {
  return latestBriefId ? cache.get(latestBriefId) ?? null : null;
}
