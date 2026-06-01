import { normalizeRouteName } from "./intentParser.js";

export const SHORT_LABEL_MAX_CHARS = 24;
export const SHORT_LABEL_MAX_WORDS = 2;
export const DISTINCT_TOPIC_MIN_EXTRA_CHARS = 12;
export const DISTINCT_TOPIC_MIN_EXTRA_WORDS = 2;

export function isShortLabel(value: string): boolean {
  const text = String(value || "").trim();
  if (!text) {
    return true;
  }
  const words = text.split(/\s+/).filter(Boolean);
  return text.length <= SHORT_LABEL_MAX_CHARS || words.length <= SHORT_LABEL_MAX_WORDS;
}

export function isDistinctTopic(topic: string, scopeLabel: string): boolean {
  const t = normalizeRouteName(topic);
  const s = normalizeRouteName(scopeLabel);
  if (!t) {
    return false;
  }
  if (!s || t === s) {
    return !isShortLabel(topic);
  }
  if (s.includes(t) || t.includes(s)) {
    const extra = topic
      .replace(
        new RegExp(scopeLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
        ""
      )
      .trim();
    const extraWords = extra.split(/\s+/).filter(Boolean);
    return (
      extra.length >= DISTINCT_TOPIC_MIN_EXTRA_CHARS ||
      extraWords.length >= DISTINCT_TOPIC_MIN_EXTRA_WORDS
    );
  }
  return true;
}

export type BriefTopicResolution = {
  topic: string;
  inferTopicFromContent: boolean;
};

export function resolveBriefTopicFields(params: {
  userTopic?: string;
  scopeLabel?: string;
  groupName?: string;
  scope: "tab-group" | "window" | "tabs";
}): BriefTopicResolution {
  const userTopic = String(params.userTopic || "").trim();
  const groupName = String(params.groupName || "").trim();
  const scopeLabel =
    String(params.scopeLabel || "").trim() ||
    (groupName ? `Tab group: ${groupName}` : "");

  if (params.scope === "tabs") {
    if (userTopic && isDistinctTopic(userTopic, scopeLabel)) {
      return { topic: userTopic, inferTopicFromContent: false };
    }
    return { topic: "", inferTopicFromContent: true };
  }

  if (params.scope === "window") {
    if (userTopic) {
      return { topic: userTopic, inferTopicFromContent: false };
    }
    return { topic: "", inferTopicFromContent: true };
  }

  if (userTopic && isDistinctTopic(userTopic, groupName || scopeLabel)) {
    return { topic: userTopic, inferTopicFromContent: false };
  }

  if (!userTopic && groupName) {
    return { topic: "", inferTopicFromContent: true };
  }

  if (
    userTopic &&
    groupName &&
    normalizeRouteName(userTopic) === normalizeRouteName(groupName)
  ) {
    return { topic: "", inferTopicFromContent: true };
  }

  if (userTopic) {
    return { topic: userTopic, inferTopicFromContent: false };
  }

  return { topic: "", inferTopicFromContent: true };
}

const GENERIC_TOPIC_RE =
  /^(?:untitled|home|new tab|welcome|loading|page|article|news)$/i;

function stripSiteSuffix(title: string): string {
  return String(title || "")
    .replace(/\s*[-|–—]\s*[^-|–—]+$/, "")
    .trim();
}

function tokenizeTitle(title: string): string[] {
  return stripSiteSuffix(title)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(w => w.length >= 3 && !GENERIC_TOPIC_RE.test(w));
}

export function inferResearchBriefTopicHeuristic(
  digests: Array<{ title: string }>
): string {
  const titles = digests
    .map(d => stripSiteSuffix(d.title))
    .filter(t => t && !GENERIC_TOPIC_RE.test(t));
  if (titles.length === 0) {
    return "";
  }

  const tokenCounts = new Map<string, number>();
  for (const title of titles) {
    const seenInTitle = new Set<string>();
    for (const token of tokenizeTitle(title)) {
      if (seenInTitle.has(token)) {
        continue;
      }
      seenInTitle.add(token);
      tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
    }
  }

  const shared = [...tokenCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);

  if (shared.length > 0) {
    const phrase = shared
      .slice(0, 4)
      .map(([token]) => token)
      .join(" ");
    return phrase.length <= 80 ? phrase : phrase.slice(0, 77) + "...";
  }

  const primary = titles[0];
  if (titles.length === 1) {
    return primary.length <= 80 ? primary : primary.slice(0, 77) + "...";
  }

  const shortened = titles
    .slice(0, 3)
    .map(t => (t.length > 40 ? `${t.slice(0, 37)}...` : t))
    .join("; ");
  return shortened.length <= 80 ? shortened : shortened.slice(0, 77) + "...";
}
