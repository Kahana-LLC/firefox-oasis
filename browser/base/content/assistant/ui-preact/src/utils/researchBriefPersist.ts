import {
  parseResearchBriefToolMessage,
  RESEARCH_BRIEF_MARKER,
} from '../../../build/src/utils/researchBriefRequest.js';
import type { PinnedResearchBrief } from '../researchBriefPinStore';
import type { TabDigest } from '../../../build/src/services/researchBriefTypes.js';

export function isResearchBriefToolMessage(content: string): boolean {
  return String(content || '').includes(RESEARCH_BRIEF_MARKER);
}

export function pinnedEntryFromToolMessage(
  userId: string,
  content: string,
  digests: TabDigest[] = [],
  pinned = true
): PinnedResearchBrief | null {
  const parsed = parseResearchBriefToolMessage(content);
  if (!parsed) {
    return null;
  }
  const digestList = parsed.digests?.length ? parsed.digests : digests;
  return {
    userId,
    briefId: parsed.briefId || crypto.randomUUID?.() || String(Date.now()),
    markdown: parsed.markdown,
    briefJson: JSON.stringify(parsed.brief),
    digestsJson: JSON.stringify(digestList),
    topic: parsed.brief.topic,
    scopeLabel: parsed.brief.scopeLabel || '',
    updatedAt: Date.now(),
    pinned,
  };
}
