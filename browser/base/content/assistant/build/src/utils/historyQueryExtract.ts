const MAX_KEYWORD_WORDS = 6;

const FILLER_WORDS = new Set([
  "a",
  "an",
  "the",
  "that",
  "this",
  "my",
  "me",
  "i",
  "was",
  "were",
  "been",
  "being",
  "have",
  "had",
  "has",
  "something",
  "anything",
  "please",
  "could",
  "would",
  "can",
  "you",
  "trying",
  "to",
  "find",
  "remember",
  "recall",
  "looking",
  "for",
  "about",
  "from",
  "in",
  "on",
  "with",
  "really",
  "think",
  "maybe",
  "like",
  "just",
  "kind",
  "of",
  "sort",
  "um",
  "uh",
]);

const EXTRACT_PATTERNS: RegExp[] = [
  /(?:find|get|pull\s+up)\s+(?:that\s+)?(?<kw>.+?)\s+(?:video|article|page|site|recipe)\b/i,
  /(?:remember|recall)\s+(?:that\s+)?(?<kw>.+?\s+(?:video|article|recipe))\b/i,
  /(?:that|the)\s+(?<kw>.+?\s+(?:video|article|recipe))\b/i,
  /(?:search|find|look)\s+(?:my\s+)?(?:browsing\s+)?history\s+(?:for|about)\s+(?<kw>.+)/i,
  /(?:that|the)\s+(?<kw>.+?)\s+(?:I\s+)?(?:was\s+)?(?:reading|watching|looking\s+at|browsing)/i,
  /(?:remember|recall)\s+(?:watching|reading|seeing)\s+(?:that\s+)?(?<kw>.+)/i,
];

function capWords(text: string, maxWords: number): string {
  return String(text || "")
    .trim()
    .replace(/[.!?]+$/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords)
    .join(" ");
}

function normalizeHistoryUtterance(utterance: string): string {
  return String(utterance || "")
    .trim()
    .replace(/\bhistroy\b/gi, "history")
    .replace(/\bserach\b/gi, "search")
    .replace(/\bserch\b/gi, "search");
}

export function historyKeywordFallbacks(query: string): string[] {
  const q = String(query || "").trim();
  if (!q) {
    return [];
  }
  const fallbacks: string[] = [];
  const withoutMedia = q
    .replace(/\s+(?:video|article|page|recipe|site|clip)s?\s*$/i, "")
    .trim();
  if (withoutMedia && withoutMedia.toLowerCase() !== q.toLowerCase()) {
    fallbacks.push(withoutMedia);
  }
  const tokens = q
    .split(/\s+/)
    .map(token => token.replace(/[^a-z0-9'-]/gi, ""))
    .filter(Boolean);
  if (tokens.length > 1) {
    const significant = tokens.filter(
      token => !/^(?:video|article|page|recipe|site|clip)s?$/i.test(token)
    );
    if (significant.length === 1) {
      fallbacks.push(significant[0]);
    } else if (significant.length > 1) {
      fallbacks.push(significant[0]);
    }
  }
  return [...new Set(fallbacks)].filter(
    candidate => candidate.toLowerCase() !== q.toLowerCase()
  );
}

export function extractHistorySearchKeyword(utterance: string): string | null {
  const input = normalizeHistoryUtterance(utterance);
  if (!input) {
    return null;
  }

  for (const pattern of EXTRACT_PATTERNS) {
    const match = input.match(pattern);
    const raw = match?.groups?.kw?.trim();
    if (!raw) {
      continue;
    }
    const keyword = capWords(raw, MAX_KEYWORD_WORDS);
    if (keyword) {
      return keyword;
    }
  }

  if (!/\b(?:history|visited|browsing|remember|reading|watching)\b/i.test(input)) {
    return null;
  }

  let cleaned = input
    .replace(/^(?:can\s+you\s+)?(?:please\s+)?/i, "")
    .replace(
      /^(?:i\s+)?(?:was\s+)?(?:trying\s+to\s+)?(?:find|remember|recall|look\s+for)\b/i,
      ""
    )
    .replace(/^(?:that|the)\b/i, "")
    .replace(/\b(?:from|in)\s+(?:my\s+)?(?:browsing\s+)?history\b.*$/i, "")
    .replace(/\b(?:my|the)\s+(?:browsing\s+)?history\b/gi, "")
    .replace(/\b(?:a\s+)?(?:while\s+)?(?:ago|earlier|yesterday|recently)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = cleaned
    .split(/\s+/)
    .map(token => token.replace(/[^a-z0-9'-]/gi, ""))
    .filter(token => token && !FILLER_WORDS.has(token.toLowerCase()));

  if (tokens.length === 0 || tokens.length > MAX_KEYWORD_WORDS) {
    return null;
  }
  return tokens.join(" ");
}

export function sanitizeHistoryRefinedPrompt(prompt: string): string {
  const text = String(prompt || "").trim();
  if (!/\b(?:history|visited|browsing)\b/i.test(text)) {
    return text;
  }
  const extracted = extractHistorySearchKeyword(text);
  if (!extracted) {
    return text;
  }
  return `search my history for ${extracted}`;
}
