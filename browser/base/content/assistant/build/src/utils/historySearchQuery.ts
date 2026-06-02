export type HistorySearchMode = "keyword" | "semantic" | "recent" | "auto";

export type HistorySearchQuery = {
  query: string;
  mode: HistorySearchMode;
  quoted: boolean;
};

const TRAILING_NOISE_RE = /\s+(?:articles?|pages?|sites?|about)\s*$/i;

function cleanQuery(raw: string, quoted: boolean): string {
  let query = String(raw || "").trim();
  if (!quoted) {
    query = query.replace(TRAILING_NOISE_RE, "").trim();
  }
  return query.replace(/^["']|["']$/g, "").trim();
}

function parseQuotedQuery(input: string): HistorySearchQuery | null {
  const match = input.match(
    /^search\s+(?:my\s+)?(?:browsing\s+|browser\s+)?history\s+for\s+"(?<query>[^"]+)"\s*$/i
  );
  if (!match?.groups?.query) {
    return null;
  }
  const query = cleanQuery(match.groups.query, true);
  if (!query) {
    return null;
  }
  return { query, mode: "keyword", quoted: true };
}

const KEYWORD_PATTERNS: Array<{
  re: RegExp;
  quoted?: boolean;
}> = [
  {
    re: /^search\s+(?:my\s+)?(?:browsing\s+|browser\s+)?history\s+for\s+"?(?<query>.+?)"?\s*$/i,
  },
  {
    re: /^search\s+history\s+for\s+"?(?<query>.+?)"?\s*$/i,
  },
  {
    re: /^find\s+(?:in\s+)?(?:my\s+)?(?:browsing\s+|browser\s+)?history\s+(?:for\s+)?"?(?<query>.+?)"?\s*$/i,
  },
  {
    re: /^find\s+(?:in\s+)?(?:my\s+)?history\s+for\s+"?(?<query>.+?)"?\s*$/i,
  },
];

const RECENT_PATTERNS = [
  /^search\s+(?:my\s+)?(?:browsing\s+|browser\s+)?history\s*$/i,
  /^search\s+history\s*$/i,
  /^show\s+(?:my\s+)?(?:recent\s+)?(?:browsing\s+)?history\s*$/i,
  /^list\s+(?:my\s+)?(?:recent\s+)?(?:browsing\s+)?history\s*$/i,
];

export function looksLikeHistoryKeywordSearch(input: string): boolean {
  const trimmed = String(input || "").trim();
  if (!trimmed) {
    return false;
  }
  if (parseQuotedQuery(trimmed)) {
    return true;
  }
  for (const { re } of KEYWORD_PATTERNS) {
    if (re.test(trimmed)) {
      return true;
    }
  }
  return false;
}

export function parseHistorySearchQuery(
  input: string
): HistorySearchQuery | null {
  const trimmed = String(input || "").trim();
  if (!trimmed) {
    return null;
  }

  for (const pattern of RECENT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { query: "", mode: "recent", quoted: false };
    }
  }

  const quoted = parseQuotedQuery(trimmed);
  if (quoted) {
    return quoted;
  }

  for (const { re } of KEYWORD_PATTERNS) {
    const match = trimmed.match(re);
    if (!match?.groups?.query) {
      continue;
    }
    const isQuoted =
      /^search\s+(?:my\s+)?(?:browsing\s+|browser\s+)?history\s+for\s+"/i.test(
        trimmed
      );
    const query = cleanQuery(match.groups.query, isQuoted);
    if (!query) {
      continue;
    }
    return { query, mode: "keyword", quoted: isQuoted };
  }

  return null;
}

export function inferHistorySearchMode(
  query: string,
  explicitMode?: string
): HistorySearchMode {
  const mode = String(explicitMode || "").trim();
  if (
    mode === "keyword" ||
    mode === "semantic" ||
    mode === "recent" ||
    mode === "auto"
  ) {
    return mode;
  }
  if (!query) {
    return "recent";
  }
  return "auto";
}
