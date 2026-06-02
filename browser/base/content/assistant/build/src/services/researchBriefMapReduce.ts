import { isRecord } from "../assistant/messageUtils.js";
import { assistRemote } from "../proxyClient.js";
import { assistantLogger } from "../utils/assistantLogger.js";
import { throwIfResearchBriefAborted } from "../utils/researchBriefProgress.js";
import {
  RESEARCH_BRIEF_GENERATION_CONFIG,
  RESEARCH_BRIEF_SYSTEM_PROMPT,
  buildResearchBriefUserMessage,
} from "../prompts/researchBriefPrompt.js";
import { syncSubscriptionFromAssistResponse } from "./syncAssistUsage.js";
import { subscriptionService } from "./subscription.js";
import {
  parseResearchBriefFromAssistContent,
  truncateDigestsToBudget,
} from "./researchBriefFormat.js";
import type { ResearchBrief, TabDigest } from "./researchBriefTypes.js";
import { synthesizeResearchBrief } from "./researchBrief.js";

const MICRO_SUMMARY_MAX_CHARS = 2500;
const MAX_MICRO_CALLS = 10;

function tryJsonParseLoose(str: string): unknown {
  const trimmed = String(str || "").trim();
  if (!trimmed) {
    return null;
  }
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : trimmed;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

function parseAssistResponseContent(res: unknown): unknown {
  if (!isRecord(res)) {
    return null;
  }
  const content = res.content;
  if (isRecord(content)) {
    return content;
  }
  if (typeof content === "string") {
    return tryJsonParseLoose(content);
  }
  return null;
}

async function microSummarizeDigest(
  digest: TabDigest,
  topic: string,
  signal?: AbortSignal
): Promise<TabDigest> {
  throwIfResearchBriefAborted(signal);
  const snippet = digest.content.slice(0, MICRO_SUMMARY_MAX_CHARS);
  const res = await assistRemote(
    "You summarize one web page for a multi-tab research brief. Return JSON: { summary: string, quotes: [{ text, context? }] }",
    [
      {
        role: "user",
        content: `Topic: ${topic}\nTitle: ${digest.title}\nURL: ${digest.url}\n\nContent:\n${snippet}`,
      },
    ],
    ["chat"],
    [],
    { ...RESEARCH_BRIEF_GENERATION_CONFIG, maxOutputTokens: 1024 },
    undefined,
    signal
  );
  if (res.quota) {
    subscriptionService.updateFromQuota(res.quota);
  }
  syncSubscriptionFromAssistResponse(res);
  const parsed = parseAssistResponseContent(res);
  const summary =
    isRecord(parsed) && typeof parsed.summary === "string"
      ? parsed.summary
      : snippet.slice(0, 1200);
  return {
    ...digest,
    content: summary,
    status: "ok",
  };
}

export function isMapReduceEnabled(): boolean {
  try {
    const Services = (
      window as {
        Services?: {
          prefs?: { getBoolPref?: (k: string, d: boolean) => boolean };
        };
      }
    ).Services;
    return (
      Services?.prefs?.getBoolPref?.(
        "browser.oasis.assistant.researchBrief.mapReduce",
        false
      ) ?? false
    );
  } catch {
    return false;
  }
}

export async function synthesizeResearchBriefWithBudget(params: {
  topic: string;
  outlineHint?: string;
  scopeLabel: string;
  digests: TabDigest[];
  maxTotalChars: number;
  signal?: AbortSignal;
}): Promise<{
  brief: ResearchBrief;
  digests: TabDigest[];
  truncated: boolean;
}> {
  const totalChars = params.digests.reduce(
    (sum, d) => sum + String(d.content || "").length,
    0
  );

  if (totalChars <= params.maxTotalChars || !isMapReduceEnabled()) {
    const { digests, truncated } = truncateDigestsToBudget(
      params.digests,
      params.maxTotalChars
    );
    const brief = await synthesizeResearchBrief({
      topic: params.topic,
      outlineHint: params.outlineHint,
      scopeLabel: params.scopeLabel,
      digests,
      signal: params.signal,
    });
    return { brief, digests, truncated };
  }

  const readable = params.digests.filter(d => d.status === "ok" && d.content);
  const microTargets = readable.slice(0, MAX_MICRO_CALLS);
  const microDigests: TabDigest[] = [];
  for (const digest of microTargets) {
    microDigests.push(
      await microSummarizeDigest(digest, params.topic, params.signal)
    );
  }
  const remainder = params.digests.filter(
    d => !microTargets.some(t => t.url === d.url)
  );
  const merged = [...microDigests, ...remainder];
  const { digests: budgetDigests, truncated } = truncateDigestsToBudget(
    merged,
    params.maxTotalChars
  );
  const brief = await synthesizeResearchBrief({
    topic: params.topic,
    outlineHint: params.outlineHint,
    scopeLabel: params.scopeLabel,
    digests: budgetDigests,
    signal: params.signal,
  });
  return { brief, digests: budgetDigests, truncated: truncated || true };
}
