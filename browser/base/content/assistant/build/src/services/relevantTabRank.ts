import { normalizeName } from "./firefoxFacade.js";
import { TAB_CATEGORY_KEYWORDS } from "../utils/tabCategoryQuery.js";
import type { TabCatalogEntry } from "./organizeTabsTypes.js";
import { RELEVANT_CATALOG_CAP } from "./relevantTabConstants.js";
import type {
  RelevantTabContext,
  RelevantTabRankedEntry,
} from "./relevantTabTypes.js";

const NOISE_CATEGORIES = new Set([
  "gmail",
  "outlook",
  "yahoo",
  "email",
  "work",
  "sports",
]);

const BOOST_URL_PATTERNS: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /linkedin\.com/i, score: 4 },
  { pattern: /\/about\b|about-us|who-we-are/i, score: 3 },
  { pattern: /notion\.so|docs\.google\.com|drive\.google/i, score: +2 },
  { pattern: /crunchbase\.com|angel\.co/i, score: 3 },
];

function tokenizeFocusQuery(focusQuery: string): string[] {
  const lower = String(focusQuery || "").toLowerCase();
  const raw = lower.match(/[a-z0-9][a-z0-9'.-]{2,}/g) || [];
  const stop = new Set([
    "the",
    "and",
    "for",
    "from",
    "with",
    "about",
    "this",
    "that",
    "your",
    "email",
    "draft",
    "write",
    "tabs",
    "open",
    "brief",
    "research",
    "outreach",
    "networking",
    "follow",
    "thank",
    "cold",
    "custom",
  ]);
  return [...new Set(raw.filter(token => !stop.has(token)))];
}

export function buildRelevantTabFocusQuery(
  context: RelevantTabContext
): string {
  const parts: string[] = [];
  if (context.recipientName?.trim()) {
    parts.push(context.recipientName.trim());
  }
  if (context.recipientRole?.trim()) {
    parts.push(context.recipientRole.trim());
  }
  if (context.topic?.trim()) {
    parts.push(context.topic.trim());
  }
  if (context.outlineHint?.trim()) {
    parts.push(context.outlineHint.trim());
  }
  if (context.purpose?.trim()) {
    parts.push(context.purpose.trim());
  }
  if (context.purposeNotes?.trim()) {
    parts.push(context.purposeNotes.trim());
  }
  if (parts.length === 0 && context.focusQuery.trim()) {
    return context.focusQuery.trim();
  }
  return parts.join(" ").trim() || context.focusQuery.trim();
}

export function buildRelevantTabContextFromOutreach(args: {
  purpose?: string;
  purposeNotes?: string;
  recipientName?: string;
  recipientRole?: string;
}): RelevantTabContext {
  const focusQuery = buildRelevantTabFocusQuery({
    kind: "outreach",
    focusQuery: "",
    purpose: args.purpose,
    purposeNotes: args.purposeNotes,
    recipientName: args.recipientName,
    recipientRole: args.recipientRole,
  });
  return {
    kind: "outreach",
    focusQuery,
    purpose: args.purpose,
    purposeNotes: args.purposeNotes,
    recipientName: args.recipientName,
    recipientRole: args.recipientRole,
  };
}

export function buildRelevantTabContextFromBrief(args: {
  topic?: string;
  outlineHint?: string;
  purposeNotes?: string;
}): RelevantTabContext {
  const focusQuery = buildRelevantTabFocusQuery({
    kind: "brief",
    focusQuery: "",
    topic: args.topic,
    outlineHint: args.outlineHint,
    purposeNotes: args.purposeNotes,
  });
  return {
    kind: "brief",
    focusQuery,
    topic: args.topic,
    outlineHint: args.outlineHint,
    purposeNotes: args.purposeNotes,
  };
}

function haystackForEntry(entry: TabCatalogEntry): string {
  return normalizeName(
    `${entry.title} ${entry.url} ${entry.domain} ${entry.snippet || ""}`
  );
}

function noisePenalty(entry: TabCatalogEntry, tokens: string[]): number {
  const hay = haystackForEntry(entry);
  let penalty = 0;
  for (const category of NOISE_CATEGORIES) {
    const keywords = TAB_CATEGORY_KEYWORDS[category] || [];
    const hit = keywords.some(keyword => hay.includes(normalizeName(keyword)));
    if (!hit) {
      continue;
    }
    const focusMentions = tokens.some(token => hay.includes(token));
    if (!focusMentions) {
      penalty += category === "email" || category === "work" ? 5 : 3;
    }
  }
  if (/localhost|127\.0\.0\.1|chrome:|about:blank/i.test(entry.url)) {
    penalty += 8;
  }
  return penalty;
}

export function scoreTabCatalogEntry(
  entry: TabCatalogEntry,
  tokens: string[]
): number {
  if (entry.pinned) {
    return -1000;
  }
  const hay = haystackForEntry(entry);
  let score = 0;
  for (const token of tokens) {
    if (token.length < 3) {
      continue;
    }
    if (hay.includes(token)) {
      score += token.length >= 6 ? 4 : 3;
    }
  }
  for (const { pattern, score: boost } of BOOST_URL_PATTERNS) {
    if (pattern.test(entry.url) || pattern.test(entry.title)) {
      score += boost;
    }
  }
  score -= noisePenalty(entry, tokens);
  return score;
}

export function rankTabsHeuristically(
  catalog: TabCatalogEntry[],
  context: RelevantTabContext,
  maxCandidates = RELEVANT_CATALOG_CAP
): RelevantTabRankedEntry[] {
  const focusQuery = buildRelevantTabFocusQuery(context);
  const tokens = tokenizeFocusQuery(focusQuery);
  const ranked = catalog
    .map(entry => ({
      ...entry,
      score: scoreTabCatalogEntry(entry, tokens),
    }))
    .filter(entry => entry.score > -100)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  if (ranked.length === 0) {
    return catalog
      .filter(entry => !entry.pinned)
      .slice(0, maxCandidates)
      .map(entry => ({ ...entry, score: 0 }));
  }

  return ranked.slice(0, maxCandidates);
}
