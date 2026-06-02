import { isRecord } from "../assistant/messageUtils.js";
import { assistRemote } from "../proxyClient.js";
import { throwIfResearchBriefAborted } from "../utils/researchBriefProgress.js";
import { syncSubscriptionFromAssistResponse } from "./syncAssistUsage.js";
import { subscriptionService } from "./subscription.js";
import { buildResearchBriefUserMessage } from "../prompts/researchBriefPrompt.js";
import type { ResearchBrief, TabDigest } from "./researchBriefTypes.js";
import type { ResearchBriefSectionId } from "./researchBriefSectionMerge.js";

const SECTION_SCHEMAS: Record<
  ResearchBriefSectionId,
  Record<string, unknown>
> = {
  executiveSummary: {
    type: "object",
    properties: {
      executiveSummary: { type: "string" },
    },
    required: ["executiveSummary"],
  },
  outline: {
    type: "object",
    properties: {
      outline: {
        type: "array",
        items: {
          type: "object",
          properties: {
            heading: { type: "string" },
            bullets: { type: "array", items: { type: "string" } },
          },
          required: ["heading", "bullets"],
        },
      },
    },
    required: ["outline"],
  },
  themes: {
    type: "object",
    properties: {
      themes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            synthesis: { type: "string" },
            sourceUrls: { type: "array", items: { type: "string" } },
          },
          required: ["label", "synthesis", "sourceUrls"],
        },
      },
    },
    required: ["themes"],
  },
  sources: {
    type: "object",
    properties: {
      sources: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            url: { type: "string" },
            status: { type: "string" },
            failureReason: { type: "string" },
            keyClaims: { type: "array", items: { type: "string" } },
            quotes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  context: { type: "string" },
                },
                required: ["text"],
              },
            },
          },
          required: ["title", "url", "status", "keyClaims", "quotes"],
        },
      },
    },
    required: ["sources"],
  },
  gapsAndContradictions: {
    type: "object",
    properties: {
      gapsAndContradictions: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["gapsAndContradictions"],
  },
};

function parseSectionContent(res: unknown): unknown {
  if (!isRecord(res)) {
    return null;
  }
  const content = res.content;
  if (isRecord(content)) {
    return content;
  }
  if (typeof content === "string") {
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  return null;
}

export async function synthesizeResearchBriefSection(params: {
  section: ResearchBriefSectionId;
  topic: string;
  scopeLabel: string;
  digests: TabDigest[];
  existingBrief: ResearchBrief;
  signal?: AbortSignal;
}): Promise<unknown> {
  throwIfResearchBriefAborted(params.signal);
  const system = [
    "You regenerate one section of a multi-tab research brief.",
    `Return ONLY valid JSON for the "${params.section}" section.`,
    "Ground content ONLY in the provided tab digests.",
    "Do not invent URLs or quotes.",
  ].join("\n");

  const userMessage = [
    buildResearchBriefUserMessage({
      topic: params.topic,
      scopeLabel: params.scopeLabel,
      digests: params.digests,
    }),
    "",
    "Current brief section snapshot (for consistency):",
    JSON.stringify({ [params.section]: params.existingBrief[params.section] }),
  ].join("\n");

  const res = await assistRemote(
    system,
    [{ role: "user", content: userMessage }],
    ["chat"],
    [],
    {
      responseMimeType: "application/json",
      responseJsonSchema: SECTION_SCHEMAS[params.section],
    },
    undefined,
    params.signal
  );

  throwIfResearchBriefAborted(params.signal);

  if (res.quota) {
    subscriptionService.updateFromQuota(res.quota);
  }
  syncSubscriptionFromAssistResponse(res);

  const parsed = parseSectionContent(res);
  if (!parsed || !isRecord(parsed)) {
    throw new Error(`Could not parse regenerated ${params.section} section.`);
  }
  return parsed[params.section] ?? parsed;
}
