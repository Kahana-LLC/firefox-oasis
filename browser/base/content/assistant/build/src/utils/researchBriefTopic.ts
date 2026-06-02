import { assistRemote } from "../proxyClient.js";
import type { TabDigest } from "../services/researchBriefTypes.js";
import { inferResearchBriefTopicHeuristic } from "./researchBriefTopicPolicy.js";

export {
  isShortLabel,
  isDistinctTopic,
  resolveBriefTopicFields,
  inferResearchBriefTopicHeuristic,
  type BriefTopicResolution,
} from "./researchBriefTopicPolicy.js";

const GENERIC_TOPIC_RE =
  /^(?:untitled|home|new tab|welcome|loading|page|article|news)$/i;

const TOPIC_INFER_CONFIG = {
  responseMimeType: "application/json",
  responseJsonSchema: {
    type: "object",
    properties: {
      topic: { type: "string" },
    },
    required: ["topic"],
  },
};

const TOPIC_INFER_SYSTEM = [
  "Given excerpts from open browser tabs, return a concise research topic title (under 80 characters).",
  "Use themes shared across the pages, not a single site name.",
  'Return only JSON: {"topic": "..."}',
].join("\n");

function isWeakHeuristicTopic(topic: string): boolean {
  const t = String(topic || "").trim();
  if (!t || t.length < 4) {
    return true;
  }
  if (GENERIC_TOPIC_RE.test(t)) {
    return true;
  }
  const words = t.split(/\s+/).filter(Boolean);
  return words.length < 2 && t.length < 12;
}

export async function inferResearchBriefTopicFromDigests(
  digests: TabDigest[]
): Promise<string> {
  const heuristic = inferResearchBriefTopicHeuristic(digests);
  if (heuristic && !isWeakHeuristicTopic(heuristic)) {
    return heuristic;
  }

  const readable = digests.filter(d => d.status === "ok" && d.content?.trim());
  if (readable.length === 0) {
    return heuristic || "Research notes";
  }

  const payload = readable.slice(0, 8).map(d => ({
    title: d.title,
    excerpt: d.content.slice(0, 400),
  }));

  try {
    const res = await assistRemote(
      TOPIC_INFER_SYSTEM,
      [
        {
          role: "user",
          content: `Tab excerpts (JSON):\n${JSON.stringify(payload)}`,
        },
      ],
      ["chat"],
      [],
      TOPIC_INFER_CONFIG
    );
    const content = res.content;
    let parsed: { topic?: string } | null = null;
    if (typeof content === "object" && content && "topic" in content) {
      parsed = content as { topic?: string };
    } else if (typeof content === "string") {
      try {
        parsed = JSON.parse(content) as { topic?: string };
      } catch {
        parsed = null;
      }
    }
    const topic =
      parsed && typeof parsed.topic === "string" ? parsed.topic.trim() : "";
    if (topic && !isWeakHeuristicTopic(topic)) {
      return topic.length <= 80 ? topic : topic.slice(0, 77) + "...";
    }
  } catch {
    // fall through
  }

  return heuristic || readable[0]?.title?.trim() || "Research notes";
}
