export type OrganizeTabsMode =
  | "single_focus"
  | "multi_topic"
  | "research_vs_other";

export type OrganizeTabsParseConfidence = "exact" | "heuristic" | "fallback";

export type OrganizeTabsQuery = {
  mode: OrganizeTabsMode;
  focus?: string;
  name?: string;
  scope?: "window" | "tab-group" | "tabs" | "ungrouped_only";
  use_active_tab_group?: boolean;
  exclude_indices?: number[];
  exclude_queries?: string[];
  confidence: OrganizeTabsParseConfidence;
};

export const ORGANIZE_VERB =
  "(?:group|organize|organise|sort|cluster|tidy|clean\\s+up|bundle|categorize|consolidate|combine|collect|gather|arrange)";

export const ORGANIZE_SCOPE =
  "(?:my\\s+)?(?:open\\s+)?(?:the\\s+)?tabs?(?:\\s+in\\s+(?:this\\s+)?(?:window|browser))?";

export const FOCUS_PREPOSITION =
  "(?:about|on|related\\s+to|reltated\\s+to|relatd\\s+to|realted\\s+to|for|around|involving|regarding|concerning|pertaining\\s+to|dealing\\s+with)";

export const FOCUS_SEGMENT = `${FOCUS_PREPOSITION}\\s+(?<focus>.+?)`;

export const GROUP_NAME = "['\"]?(?<name>[^'\"]+?)['\"]?";

export const TAB_GROUP_SUFFIX = `(?:the\\s+)?(?:my\\s+)?(?:tab\\s+)?group\\s+${GROUP_NAME}`;

export const SPLIT_FROM_REST =
  "(?:from|and)\\s+(?:everything\\s+else|the\\s+rest|other\\s+(?:tabs?|work|stuff)|unrelated\\s+(?:tabs?|work)?)";

const PREFIX_RE =
  /^(?:please\s+|(?:can|could)\s+you\s+|help\s+me\s+|(?:i\s+(?:want|need)\s+to\s+)|(?:i\s+(?:would|'d)\s+like\s+to\s+))+/i;

const SUFFIX_RE = /(?:\s+please|\s+thanks|\s+thank\s+you|\s+now)?[\s?.!]*$/i;

const CREATE_TAB_GROUP_RE =
  /\b(?:create|make|new)\s+(?:a\s+)?(?:new\s+)?(?:tab\s+)?(?:group|gorup|gruop)\b/i;

const ADD_TO_GROUP_RE =
  /\badd\s+(?:all\s+)?tabs?\s+.*\s+to\s+(?:the\s+)?(?:tab\s+)?group\b/i;

const RESEARCH_BRIEF_RE =
  /\b(?:research\s+)?(?:brief|report|digest|rundown|outline|briefing|write[- ]?up|memo|dossier)\b/i;

const ORGANIZE_WINDOWS_RE = /\borganize\s+windows?\b/i;

const LIST_TABS_RE =
  /^\s*(?:what|which|list|show)\s+(?:tabs?|pages?)\s+(?:do\s+i\s+have\s+)?(?:open)?/i;

const FOCUS_HEURISTIC_PATTERNS: RegExp[] = [
  new RegExp(
    `\\b(?:group|organize|sort|cluster|bundle|categorize|collect|gather|combine|consolidate|arrange)\\s+(?:all\\s+)?(?:the\\s+)?tabs?\\s+${FOCUS_PREPOSITION}\\s+["']?(?<focus>.+?)["']?(?:\\s+except|\\s+in\\s+(?:a\\s+)?(?:tab\\s+)?group|$)`,
    "i"
  ),
  new RegExp(
    `\\btabs?\\s+(?:that\\s+are|which\\s+are)\\s+${FOCUS_PREPOSITION}\\s+["']?(?<focus>.+?)["']?(?:\\s+except|$)`,
    "i"
  ),
  new RegExp(
    `\\b(?:group|organize)\\s+(?:all\\s+)?(?:the\\s+)?tabs?\\s+["'](?<focus>[^"']+)["']`,
    "i"
  ),
  new RegExp(
    `\\b(?:put|collect|gather|bundle)\\s+(?:all\\s+)?(?:my\\s+)?(?<focus>.+?)\\s+tabs?\\s+(?:together|into\\s+(?:a\\s+)?(?:tab\\s+)?group)`,
    "i"
  ),
  new RegExp(
    `\\b(?:all\\s+)?(?:the\\s+)?tabs?\\s+${FOCUS_PREPOSITION}\\s+["']?(?<focus>.+?)["']?\\s*[—-]\\s*(?:group|organize)\\s+(?:them|those|these)?`,
    "i"
  ),
];

function trimQuotes(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

function stripTrailingFocusNoise(value: string): string {
  return String(value || "")
    .replace(/\s+in\s+(?:a\s+)?(?:tab\s+)?group\s+(?:called|named)\s+.+$/i, "")
    .replace(/\s+into\s+(?:a\s+)?(?:tab\s+)?group\s*$/i, "")
    .replace(/\s+except\s+.+$/i, "")
    .replace(
      /\s*[—-]\s*(?:group|organize)\s+(?:them|those|these|my\s+tabs?)\s*$/i,
      ""
    )
    .trim();
}

export function trimOrganizeFocus(value: string): string {
  return stripTrailingFocusNoise(trimQuotes(value));
}

export function normalizeOrganizeTabsInput(input: string): string {
  return String(input || "")
    .trim()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/\borganise\b/gi, "organize")
    .replace(/\breltated\b/gi, "related")
    .replace(/\brelatd\b/gi, "related")
    .replace(/\brealted\b/gi, "related")
    .replace(/\bgorup\b/gi, "group")
    .replace(/\bgruop\b/gi, "group")
    .replace(/\btabbs\b/gi, "tabs");
}

export function prepareOrganizeTabsCommandBody(input: string): string {
  let body = normalizeOrganizeTabsInput(input);
  body = body.replace(PREFIX_RE, "").trim();
  body = body.replace(SUFFIX_RE, "").trim();
  body = body.replace(/\ball the tabs\b/gi, "all tabs");
  return body.trim();
}

export function isOrganizeTabsNegative(normalized: string): boolean {
  if (CREATE_TAB_GROUP_RE.test(normalized)) {
    return true;
  }
  if (ADD_TO_GROUP_RE.test(normalized)) {
    return true;
  }
  if (RESEARCH_BRIEF_RE.test(normalized)) {
    return true;
  }
  if (ORGANIZE_WINDOWS_RE.test(normalized)) {
    return true;
  }
  if (LIST_TABS_RE.test(normalized)) {
    return true;
  }
  return false;
}

export function looksLikeOrganizeTabsCommand(input: string): boolean {
  const normalized = prepareOrganizeTabsCommandBody(input);
  if (!normalized || isOrganizeTabsNegative(normalized)) {
    return false;
  }

  if (
    new RegExp(`^${ORGANIZE_VERB}\\s+(?:all\\s+)?${ORGANIZE_SCOPE}`, "i").test(
      normalized
    )
  ) {
    return true;
  }

  if (
    new RegExp(
      `\\bgroup\\s+(?:all\\s+)?(?:the\\s+)?tabs?\\s+${FOCUS_PREPOSITION}\\b`,
      "i"
    ).test(normalized)
  ) {
    return true;
  }

  if (
    /\b(?:separate|split|isolate)\s+.+\s+(?:from|and)\s+(?:everything\s+else|the\s+rest|other)\b/i.test(
      normalized
    )
  ) {
    return true;
  }

  if (/\b(?:organize|sort|cluster|group)\b.+\bby\s+topic\b/i.test(normalized)) {
    return true;
  }

  if (
    /\b(?:sort|cluster)\s+(?:these|my|the)?\s*tabs?\s+into\s+groups?\b/i.test(
      normalized
    )
  ) {
    return true;
  }

  if (/\btidy\s+up\s+(?:my\s+)?(?:open\s+)?tabs?\b/i.test(normalized)) {
    return true;
  }

  if (
    /\borganize\s+(?:this|current|my)\s+(?:tab\s+)?group\b/i.test(normalized)
  ) {
    return true;
  }

  if (
    /\b(?:separate|split|isolate)\s+.+\s+(?:from|and)\s+(?:unrelated|other)\s+tabs?\b/i.test(
      normalized
    )
  ) {
    return true;
  }

  if (
    /\b(?:i'?m|i\s+am)\s+(?:doing\s+)?(?:research(?:ing)?|working)\s+(?:on|about)\s+.+\b(?:group|organize)\b/i.test(
      normalized
    )
  ) {
    return true;
  }

  if (
    /\b(?:organize|sort|cluster|group)\s+(?:tabs?\s+)?(?:in|from|within)\s+(?:this|current|my)\s+(?:tab\s+)?group\b/i.test(
      normalized
    )
  ) {
    return true;
  }

  if (
    /\b(?:organize|sort|cluster)\s+(?:ungrouped|un\s*grouped)\s+tabs?\b/i.test(
      normalized
    )
  ) {
    return true;
  }

  if (
    /\b(?:organize|sort|cluster)\s+tabs?\s+in\s+(?:tab\s+)?group\b/i.test(
      normalized
    )
  ) {
    return true;
  }

  if (
    /\bput\s+(?:my\s+)?(?:.+?\s+)?tabs?\s+in\s+(?:a\s+)?(?:tab\s+)?group\s+(?:called|named)\b/i.test(
      normalized
    )
  ) {
    return true;
  }

  if (
    /\b(?:put|collect|gather|bundle)\s+(?:all\s+)?(?:my\s+)?\S+\s+tabs?\s+(?:together|into\s+(?:a\s+)?(?:tab\s+)?group)\b/i.test(
      normalized
    )
  ) {
    return true;
  }

  if (
    new RegExp(
      `\\btabs?\\s+(?:that\\s+are|which\\s+are)\\s+${FOCUS_PREPOSITION}\\b`,
      "i"
    ).test(normalized)
  ) {
    return true;
  }

  if (
    new RegExp(
      `(?:all\\s+)?(?:the\\s+)?tabs?\\s+${FOCUS_PREPOSITION}\\s+.+\\s*[—-]\\s*(?:group|organize)\\s+(?:them|those|these)`,
      "i"
    ).test(normalized)
  ) {
    return true;
  }

  if (
    new RegExp(
      `\\btabs?\\s+(?:that\\s+are|which\\s+are)\\s+${FOCUS_PREPOSITION}\\b`,
      "i"
    ).test(normalized) &&
    /\b(?:group|organize)\b/i.test(normalized)
  ) {
    return true;
  }

  return false;
}

export function extractOrganizeTabsFocus(normalized: string): string | null {
  const body = prepareOrganizeTabsCommandBody(normalized);
  for (const pattern of FOCUS_HEURISTIC_PATTERNS) {
    const match = body.match(pattern);
    const focus = trimOrganizeFocus(match?.groups?.focus || "");
    if (focus.length >= 2) {
      return focus;
    }
  }
  return null;
}

export function inferOrganizeTabsMode(
  args: { mode?: OrganizeTabsMode; focus?: string },
  normalized: string
): OrganizeTabsMode {
  const focus = String(args.focus || "").trim();
  if (args.mode === "research_vs_other") {
    return "research_vs_other";
  }
  if (focus) {
    return "single_focus";
  }
  if (args.mode) {
    return args.mode;
  }
  if (
    /\b(?:separate|split|isolate)\b/i.test(normalized) &&
    /\b(?:from|and)\s+(?:everything\s+else|the\s+rest|other)\b/i.test(
      normalized
    )
  ) {
    return "research_vs_other";
  }
  if (/\bby\s+topic\b/i.test(normalized)) {
    return "multi_topic";
  }
  if (/\b(?:organize|sort|cluster|group)\b/i.test(normalized)) {
    return "multi_topic";
  }
  return "single_focus";
}

export function enrichOrganizeTabsRouteArgs(
  utterance: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  const normalized = prepareOrganizeTabsCommandBody(utterance);
  const enriched: Record<string, unknown> = { ...args };

  if (!enriched.focus) {
    const focus = extractOrganizeTabsFocus(normalized);
    if (focus) {
      enriched.focus = focus;
    }
  }

  const mode = inferOrganizeTabsMode(
    {
      mode: enriched.mode as OrganizeTabsMode | undefined,
      focus: String(enriched.focus || ""),
    },
    normalized
  );
  if (!enriched.mode || enriched.focus) {
    enriched.mode = mode;
  }

  if (!enriched.scope) {
    enriched.scope = "window";
  }

  return enriched;
}
