import { looksLikeNewActionCommand } from "./routingUtils.js";

export type HistorySearchFilters = {
  domain?: string;
  sinceMs?: number;
  untilMs?: number;
  extraTerms?: string[];
};

export type PendingHistoryRefinement = {
  query: string;
  mode: HistorySearchMode;
  filters: HistorySearchFilters;
  totalMatches: number;
};

export type HistorySearchResultLike = {
  title: string;
  url: string;
  snippet?: string;
  excerpt?: string;
  visitDate: number;
  score: number;
};

const MS_DAY = 86_400_000;
const REFINEMENT_MATCH_THRESHOLD = 6;
const SCORE_BUNCH_DELTA = 0.08;
const TIME_PHRASE_RE =
  /\b(?:today|yesterday|last\s+week|last\s+month|past\s+\d+\s+days?|last\s+\d+\s+days?)\b/gi;
const DOMAIN_PHRASE_RE =
  /\b(?:on|from|at)\s+(?:the\s+)?([a-z0-9][\w.-]*(?:\.[a-z]{2,})?)\b/gi;

let pendingRefinement: PendingHistoryRefinement | null = null;

export function getPendingHistoryRefinement(): PendingHistoryRefinement | null {
  return pendingRefinement;
}

export function setPendingHistoryRefinement(
  pending: PendingHistoryRefinement | null
): void {
  pendingRefinement = pending;
}

export function clearPendingHistoryRefinement(): void {
  pendingRefinement = null;
}

export function parseHistorySearchFiltersFromArgs(
  args: Record<string, unknown>
): HistorySearchFilters {
  const filters: HistorySearchFilters = {};
  const domain = String(args.domain || args.site || "").trim();
  if (domain) {
    filters.domain = normalizeDomainHint(domain);
  }
  const sinceRaw = String(args.since || "").trim();
  if (sinceRaw) {
    const parsed = parseTimeRange(sinceRaw);
    if (parsed.sinceMs) {
      filters.sinceMs = parsed.sinceMs;
    }
    if (parsed.untilMs) {
      filters.untilMs = parsed.untilMs;
    }
  }
  const extraRaw = String(args.extra || args.extraTerms || "").trim();
  if (extraRaw) {
    filters.extraTerms = tokenizeExtraTerms(extraRaw);
  }
  return filters;
}

export function filtersToCommandArgs(
  filters: HistorySearchFilters
): Record<string, string> {
  const args: Record<string, string> = {};
  if (filters.domain) {
    args.domain = filters.domain;
  }
  if (filters.sinceMs != null) {
    args.since = new Date(filters.sinceMs).toISOString();
  }
  if (filters.extraTerms?.length) {
    args.extra = filters.extraTerms.join(" ");
  }
  return args;
}

export function mergeHistorySearchFilters(
  base: HistorySearchFilters,
  next: HistorySearchFilters
): HistorySearchFilters {
  return {
    domain: next.domain || base.domain,
    sinceMs: next.sinceMs ?? base.sinceMs,
    untilMs: next.untilMs ?? base.untilMs,
    extraTerms: [...(base.extraTerms || []), ...(next.extraTerms || [])].filter(
      Boolean
    ),
  };
}

export function shouldPromptHistoryRefinement(
  results: HistorySearchResultLike[],
  options: { skip?: boolean } = {}
): boolean {
  if (options.skip) {
    return false;
  }
  if (results.length >= REFINEMENT_MATCH_THRESHOLD) {
    return true;
  }
  const top = results.slice(0, 5);
  if (top.length >= 5) {
    const spread = (top[0]?.score || 0) - (top[top.length - 1]?.score || 0);
    return spread <= SCORE_BUNCH_DELTA;
  }
  return false;
}

export function buildHistoryRefinementPrompt(
  query: string,
  totalMatches: number
): string {
  return (
    `I found ${totalMatches} pages in your history matching "${query}". ` +
    "To narrow this down, reply with any details you remember — for example: " +
    "**when** you visited (yesterday, last week), **which site** (GitHub, NYT), or **other keywords**. " +
    "Say **show all** to see the top matches anyway, or **cancel** to stop."
  );
}

export function parseHistoryRefinementReply(
  text: string
): HistorySearchFilters {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return {};
  }

  const timeRange = parseTimeRange(trimmed);
  const domain = parseDomainHint(trimmed);
  let remainder = trimmed
    .replace(TIME_PHRASE_RE, " ")
    .replace(DOMAIN_PHRASE_RE, " ")
    .replace(/\b(?:on|from|at|the|a|an|about|around|maybe|probably)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const extraTerms = tokenizeExtraTerms(remainder);
  return {
    ...timeRange,
    domain,
    extraTerms: extraTerms.length > 0 ? extraTerms : undefined,
  };
}

export function applyHistorySearchFilters<T extends HistorySearchResultLike>(
  results: T[],
  filters: HistorySearchFilters
): T[] {
  if (!filters.domain && filters.sinceMs == null && filters.untilMs == null) {
    if (!filters.extraTerms?.length) {
      return results;
    }
  }

  return results.filter(result => matchesHistorySearchFilters(result, filters));
}

function matchesHistorySearchFilters(
  result: HistorySearchResultLike,
  filters: HistorySearchFilters
): boolean {
  if (filters.domain && !urlMatchesDomain(result.url, filters.domain)) {
    return false;
  }
  if (filters.sinceMs != null && result.visitDate < filters.sinceMs) {
    return false;
  }
  if (filters.untilMs != null && result.visitDate > filters.untilMs) {
    return false;
  }
  if (filters.extraTerms?.length) {
    const haystack =
      `${result.title} ${result.url} ${result.snippet || ""} ${result.excerpt || ""}`.toLowerCase();
    if (!filters.extraTerms.every(term => haystack.includes(term))) {
      return false;
    }
  }
  return true;
}

export function resolvePendingHistoryRefinementGate(params: {
  pending: PendingHistoryRefinement | null;
  userText: string;
}):
  | { kind: "none" }
  | { kind: "cancel" }
  | { kind: "search"; args: Record<string, unknown> } {
  const { pending, userText } = params;
  if (!pending) {
    return { kind: "none" };
  }

  const trimmed = String(userText || "").trim();
  if (
    looksLikeNewActionCommand(trimmed) &&
    !/^show\s+(?:all|everything|top|matches)\b/i.test(trimmed) &&
    !/^(?:cancel|nevermind|never\s+mind|stop|skip)$/i.test(trimmed)
  ) {
    clearPendingHistoryRefinement();
    return { kind: "none" };
  }

  if (/^(?:cancel|nevermind|never\s+mind|stop|skip)$/i.test(trimmed)) {
    clearPendingHistoryRefinement();
    return { kind: "cancel" };
  }

  if (/^show\s+(?:all|everything|top|matches)\b/i.test(trimmed)) {
    clearPendingHistoryRefinement();
    return {
      kind: "search",
      args: {
        query: pending.query,
        mode: pending.mode,
        ...filtersToCommandArgs(pending.filters),
        skipRefinement: true,
        refined: true,
      },
    };
  }

  const parsed = parseHistoryRefinementReply(trimmed);
  const filters = mergeHistorySearchFilters(pending.filters, parsed);
  clearPendingHistoryRefinement();
  return {
    kind: "search",
    args: {
      query: pending.query,
      mode: pending.mode,
      ...filtersToCommandArgs(filters),
      refined: true,
    },
  };
}

function parseTimeRange(
  text: string
): Pick<HistorySearchFilters, "sinceMs" | "untilMs"> {
  const lower = String(text || "").toLowerCase();
  const now = Date.now();

  if (/\byesterday\b/.test(lower)) {
    const start = startOfDay(new Date());
    start.setDate(start.getDate() - 1);
    const end = endOfDay(start);
    return { sinceMs: start.getTime(), untilMs: end.getTime() };
  }
  if (/\btoday\b/.test(lower)) {
    return { sinceMs: startOfDay(new Date()).getTime() };
  }
  if (/\blast\s+week\b/.test(lower)) {
    return { sinceMs: now - 7 * MS_DAY };
  }
  if (/\blast\s+month\b/.test(lower)) {
    return { sinceMs: now - 30 * MS_DAY };
  }

  const daysMatch = lower.match(/\b(?:past|last)\s+(\d+)\s+days?\b/);
  if (daysMatch?.[1]) {
    return { sinceMs: now - parseInt(daysMatch[1], 10) * MS_DAY };
  }

  return {};
}

function parseDomainHint(text: string): string | undefined {
  const trimmed = String(text || "").trim();
  const onDomain = trimmed.match(
    /\b(?:on|from|at)\s+(?:the\s+)?([a-z0-9][\w.-]*(?:\.[a-z]{2,})?)\b/i
  );
  if (onDomain?.[1]) {
    return normalizeDomainHint(onDomain[1]);
  }
  const onSite = trimmed.match(
    /\b(?:on|from)\s+(?:the\s+)?([a-z][\w-]{1,})\b/i
  );
  if (onSite?.[1] && !isTimeWord(onSite[1])) {
    return normalizeDomainHint(onSite[1]);
  }
  const bareDomain = trimmed.match(/\b([a-z0-9][\w.-]*\.[a-z]{2,})\b/i);
  if (bareDomain?.[1]) {
    return normalizeDomainHint(bareDomain[1]);
  }
  return undefined;
}

function normalizeDomainHint(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
}

function urlMatchesDomain(url: string, domainHint: string): boolean {
  const hint = normalizeDomainHint(domainHint);
  if (!hint) {
    return true;
  }
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return hostname.includes(hint) || hint.includes(hostname);
  } catch {
    return url.toLowerCase().includes(hint);
  }
}

function tokenizeExtraTerms(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .split(/\s+/)
    .map(token => token.replace(/^[^\w]+|[^\w]+$/g, ""))
    .filter(token => token.length >= 2 && !isTimeWord(token));
}

function isTimeWord(word: string): boolean {
  return /^(?:today|yesterday|week|month|days?|last|past)$/i.test(word);
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}
