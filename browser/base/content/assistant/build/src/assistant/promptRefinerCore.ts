/**
 * Pure logic for the meta-prompting refiner: deterministic shorthand
 * and typo normalization, messiness heuristics, and LLM response
 * parsing. Free of network/LLM dependencies so it can be unit tested
 * directly. The LLM call lives in promptRefiner.ts.
 */
import type { ClarificationOption } from "../../../shared/contracts.js";

export const MAX_REFINED_INTENTS = 3;

// Token-level rewrites limited to assistant command vocabulary.
// Keys must match whole words (case-insensitive).
const SHORTHAND_TOKEN_MAP: Readonly<Record<string, string>> = {
  yt: "youtube",
  vid: "video",
  vids: "videos",
  wiki: "wikipedia",
  gh: "github",
  amzn: "amazon",
  bkmk: "bookmark",
  bkmks: "bookmarks",
  grp: "group",
  grps: "groups",
  tabz: "tabs",
  plz: "please",
  pls: "please",
  thx: "thanks",
  rly: "really",
  abt: "about",
  srch: "search",
  hist: "history",
  // Common command-verb typos.
  clse: "close",
  cloes: "close",
  colse: "close",
  closs: "close",
  opne: "open",
  oepn: "open",
  opn: "open",
  serach: "search",
  saerch: "search",
  searh: "search",
  seach: "search",
  fnd: "find",
  summrize: "summarize",
  sumarize: "summarize",
  summarise: "summarize",
  organze: "organize",
  orgnize: "organize",
  organise: "organize",
  bokmark: "bookmark",
  bookmrk: "bookmark",
  boomark: "bookmark",
  histroy: "history",
  histry: "history",
  hsitory: "history",
  creat: "create",
  bulid: "build",
  reserch: "research",
  nigth: "night",
  grup: "group",
  gropu: "group",
  widnow: "window",
  windwo: "window",
  tabb: "tab",
};

const ACTION_VERB_RE =
  /\b(open|close|delete|remove|create|make|add|save|move|put|rename|list|show|search|find|summarize|split|organize|play|watch|bookmark|group)\b/i;

const ANAPHORA_RE =
  /\b(do (?:that|it) again|the other one|that one|same as (?:before|last time)|like (?:before|last time)|again like|the previous one|undo that)\b/i;

const FILLER_RE =
  /\b(um+|uh+|hmm+|basically|kinda|sorta|like,|you know|i mean|idk|lol|btw|anyway|whatever)\b/gi;

const CHAIN_CONNECTOR_COUNT_RE =
  /\b(and then|then|also|after that|plus|as well as)\b/gi;

const RAMBLING_WORD_THRESHOLD = 40;
const MIN_WORDS_FOR_REFINEMENT = 4;

export function normalizeMessyPrompt(text: string): string {
  const trimmed = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/([?!.,])\1+/g, "$1")
    .trim();
  if (!trimmed) {
    return "";
  }
  return trimmed
    .split(" ")
    .map(token => {
      const bare = token.toLowerCase().replace(/[^a-z]/g, "");
      const replacement = SHORTHAND_TOKEN_MAP[bare];
      if (!replacement) {
        return token;
      }
      // Preserve trailing punctuation from the original token.
      const trailing = token.match(/[^a-zA-Z]+$/)?.[0] ?? "";
      return replacement + trailing;
    })
    .join(" ");
}

export type PromptMessiness = {
  messy: boolean;
  reasons: string[];
};

export function assessPromptMessiness(text: string): PromptMessiness {
  const raw = String(text || "").trim();
  const reasons: string[] = [];
  if (!raw) {
    return { messy: false, reasons };
  }

  const words = raw.split(/\s+/);
  if (words.length < MIN_WORDS_FOR_REFINEMENT) {
    return { messy: false, reasons };
  }

  // Check signals against normalized text so typo'd verbs still count.
  const normalized = normalizeMessyPrompt(raw);
  const hasActionSignal =
    ACTION_VERB_RE.test(normalized) || ANAPHORA_RE.test(normalized);
  if (!hasActionSignal) {
    return { messy: false, reasons };
  }

  if (ANAPHORA_RE.test(normalized)) {
    reasons.push("anaphora");
  }

  if (words.length > RAMBLING_WORD_THRESHOLD) {
    reasons.push("rambling");
  }

  const fillerMatches = normalized.match(FILLER_RE) || [];
  if (fillerMatches.length >= 2) {
    reasons.push("filler");
  }

  const connectorMatches = normalized.match(CHAIN_CONNECTOR_COUNT_RE) || [];
  const actionMatches =
    normalized.match(new RegExp(ACTION_VERB_RE.source, "gi")) || [];
  if (connectorMatches.length >= 1 && actionMatches.length >= 2) {
    reasons.push("compound");
  }

  if (normalized.toLowerCase() !== raw.replace(/\s+/g, " ").toLowerCase()) {
    reasons.push("shorthand");
  }

  return { messy: reasons.length > 0, reasons };
}

export type PromptRefinementResult =
  | { kind: "clean" }
  | { kind: "refined"; intents: string[] }
  | { kind: "clarify"; options: ClarificationOption[] };

function parseClarificationOptions(value: unknown): ClarificationOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(0, 2)
    .filter(
      (opt: unknown) =>
        typeof (opt as Record<string, unknown>)?.id === "string" &&
        typeof (opt as Record<string, unknown>)?.label === "string" &&
        typeof (opt as Record<string, unknown>)?.resolvedPrompt === "string"
    )
    .map((opt: unknown) => ({
      id: (opt as Record<string, string>).id,
      label: (opt as Record<string, string>).label,
      resolvedPrompt: (opt as Record<string, string>).resolvedPrompt,
    }));
}

export function parseRefinerResponse(
  parsed: Record<string, unknown>
): PromptRefinementResult {
  if (parsed.need_clarification === true) {
    const options = parseClarificationOptions(parsed.options);
    if (options.length === 2) {
      return { kind: "clarify", options };
    }
    return { kind: "clean" };
  }

  if (parsed.refined !== true) {
    return { kind: "clean" };
  }

  const rawIntents = Array.isArray(parsed.intents) ? parsed.intents : [];
  const intents = rawIntents
    .map((item: unknown) => {
      const record = item as Record<string, unknown>;
      return typeof record?.refinedPrompt === "string"
        ? record.refinedPrompt.trim()
        : "";
    })
    .filter(Boolean)
    .slice(0, MAX_REFINED_INTENTS);

  if (intents.length === 0) {
    return { kind: "clean" };
  }
  return { kind: "refined", intents };
}
