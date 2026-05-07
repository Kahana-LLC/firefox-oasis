/**
 * Intent parser — regex-based NLP for classifying user input.
 *
 * Key functions:
 * - classifyCommandFamily(): list / search / mutation / other
 * - parseContainerAddIntent(): "add X to Y" pattern extraction
 * - parseCloseDeleteTargetIntent(): "close/delete X" extraction
 * - parseSearchMemoryIntent(): "search X in Y folder" extraction
 * - looksActionableText(): has an action verb + browser object?
 *
 * Used by decisionEngine.ts and the family resolvers.
 */
import type { ContainerType, IntentFamily, ParsedIntent } from "./routerTypes.js";

const ACTION_WORD_RE =
  /\b(?:open|close|delete|remove|create|make|new|add|save|move|put|rename|list|show|search|find|summarize|split|organize|copy)\b/i;

const ACTION_OBJECT_RE =
  /\b(?:tab|tabs|group|folder|bookmark|window|history|memory|page|url|result|split)\b/i;
const LIST_VERB_RE = /^list\b/i;
const SHOW_VERB_RE = /^show\b/i;
const LIST_OBJECT_RE =
  /\b(?:tabs?|tab\s*groups?|groups?|bookmark\s*folders?|folders?|hubs?)\b/i;
const SEARCH_FAMILY_RE =
  /^(?:search|find|look\s*up)\b|^have\s+i\s+(?:visited|been\s+to|seen|saved|bookmarked|read|looked\s+at)\b|^do\s+i\s+have\b|^what(?:'s|\s+is|\s+did\s+i\s+(?:save|read|visit|look\s+at|browse))\s+/i;
const HISTORY_FAMILY_RE =
  /\b(?:visited|browsed|looked\s+at|read|viewed)\b.*\b(?:page|pages|site|sites|article|articles|earlier|before|recently|yesterday|last\s+week|previously)\b|\b(?:page|pages|site|sites|article|articles)\s+(?:i|i've|i\s+have)\s+(?:visited|read|seen|looked\s+at|browsed|viewed)\b|\b(?:pull|get|find|show)\s+that\s+(?:page|article|site)\b|\bwhat\s+(?:was|were|is)\s+that\s+.{2,}\s+(?:i\s+was|i've\s+been)\s+(?:reading|looking\s+at|browsing|viewing)\b|\b(?:my|the)\s+(?:browsing\s+)?history\b|\bpages\s+(?:i(?:'ve)?\s+)?visited\b|\bwhat\s+(?:did\s+i|have\s+i)\s+(?:visit|read|browse|look\s+at|view)\b/i;
const MUTATION_FAMILY_RE =
  /^(?:add|save|move|put|close|delete|remove|rename|create|make|split|unsplit|ungroup)\b/i;

const GROUP_LABEL_RE = /\btab\s*group\b|\bgroup\b/i;
const FOLDER_LABEL_RE = /\bbookmark\s*folder\b|\bfolder\b|\bhub\b|\bbookmarks?\b/i;
const GENERIC_FOLDER_NAME_RE = /^(?:bookmark(?:\s+folders?)?|folders?|hubs?)$/i;

function cleanCaptured(text: string): string {
  return String(text || "")
    .replace(/["']/g, "")
    .replace(/^\s*(?:my|the)\s+/i, "")
    .trim();
}

function extractContainerType(text: string): ContainerType | null {
  const hasGroup = GROUP_LABEL_RE.test(text);
  const hasFolder = FOLDER_LABEL_RE.test(text);
  if (hasGroup && hasFolder) {
    return null;
  }
  if (hasGroup) {
    return "tab-group";
  }
  if (hasFolder) {
    return "bookmark-folder";
  }
  return null;
}

function extractTargetName(raw: string): string {
  let name = cleanCaptured(raw);
  name = name.replace(/^bookmark\s+folder\s+/i, "");
  name = name.replace(/^bookmarks?\s+/i, "");
  name = name.replace(/^tab\s*group\s+/i, "");
  name = name.replace(/^folder\s+/i, "");
  name = name.replace(/^hub\s+/i, "");
  name = name.replace(/^group\s+/i, "");
  name = name.replace(/\s+bookmarks?\s*$/i, "");
  name = name.replace(/\s+bookmark\s+folder\s*$/i, "");
  name = name.replace(/\s+tab\s*group\s*$/i, "");
  name = name.replace(/\s+folder\s*$/i, "");
  name = name.replace(/\s+hub\s*$/i, "");
  name = name.replace(/\s+group\s*$/i, "");
  return name.trim();
}

function isNonContainerTarget(rawTarget: string): boolean {
  return /\bnew\s+window\b|\bwindow\b|\bsplit\s*view\b/i.test(rawTarget);
}

export function looksActionableText(text: string): boolean {
  const input = String(text || "");
  return ACTION_WORD_RE.test(input) && ACTION_OBJECT_RE.test(input);
}

const LIST_OPEN_TABS_QUESTION_RE =
  /^(?:what|which)\s+tabs\b|\btabs\s+do\s+i\s+have\s+open\b|\btabs\s+are\s+open\b/i;

export function classifyCommandFamily(commandText: string): IntentFamily {
  const input = String(commandText || "").trim();
  if (!input) {
    return "other";
  }
  if (LIST_OPEN_TABS_QUESTION_RE.test(input)) {
    return "list";
  }
  if (LIST_VERB_RE.test(input)) {
    return "list";
  }
  if (SHOW_VERB_RE.test(input) && LIST_OBJECT_RE.test(input)) {
    return "list";
  }
  if (SEARCH_FAMILY_RE.test(input) || HISTORY_FAMILY_RE.test(input)) {
    return "search";
  }
  if (MUTATION_FAMILY_RE.test(input)) {
    return "mutation";
  }
  return "other";
}

export function normalizeRouteName(value: string): string {
  return String(value || "").trim().toLowerCase();
}

export function parseContainerAddIntent(commandText: string): ParsedIntent | null {
  const input = String(commandText || "").trim();
  if (!input) return null;

  const allMatch = input.match(
    /^(?<verb>add|save|move|put)\s+all\s+(?:tabs?|existing\s+tabs?)\s+to\s+(?<target>.+)$/i
  );
  if (allMatch?.groups) {
    if (isNonContainerTarget(allMatch.groups.target)) {
      return null;
    }
    const explicitContainer = extractContainerType(allMatch.groups.target);
    const targetName = extractTargetName(allMatch.groups.target);
    if (!targetName) return null;
    return {
      rawText: input,
      normalizedText: input.toLowerCase(),
      verb: allMatch.groups.verb.toLowerCase(),
      isActionLike: true,
      explicitContainer,
      targetName,
      all: true,
      kind: "container_add",
    };
  }

  const currentMatch = input.match(
    /^(?<verb>add|save|move|put)\s+(?:this|current|active)\s+tab\s+to\s+(?<target>.+)$/i
  );
  if (currentMatch?.groups) {
    if (isNonContainerTarget(currentMatch.groups.target)) {
      return null;
    }
    const explicitContainer = extractContainerType(currentMatch.groups.target);
    const targetName = extractTargetName(currentMatch.groups.target);
    if (!targetName) return null;
    return {
      rawText: input,
      normalizedText: input.toLowerCase(),
      verb: currentMatch.groups.verb.toLowerCase(),
      isActionLike: true,
      explicitContainer,
      targetName,
      current: true,
      kind: "container_add",
    };
  }

  const queryMatch = input.match(
    /^(?<verb>add|save|move|put)\s+(?<query>.+?)\s+to\s+(?<target>.+)$/i
  );
  if (queryMatch?.groups) {
    if (isNonContainerTarget(queryMatch.groups.target)) {
      return null;
    }
    const explicitContainer = extractContainerType(queryMatch.groups.target);
    const targetName = extractTargetName(queryMatch.groups.target);
    const query = cleanCaptured(queryMatch.groups.query);
    if (!targetName || !query) return null;
    return {
      rawText: input,
      normalizedText: input.toLowerCase(),
      verb: queryMatch.groups.verb.toLowerCase(),
      isActionLike: true,
      explicitContainer,
      targetName,
      all: /^(?:all\s+tabs?|all\s+existing\s+tabs?)$/i.test(query),
      current: /^(?:this|current|active)\s+tab$/i.test(query),
      query,
      kind: "container_add",
    };
  }

  return null;
}

export function parseCloseDeleteTargetIntent(commandText: string): ParsedIntent | null {
  const input = String(commandText || "").trim();
  if (!input) return null;

  const match = input.match(/^(?<verb>close|delete|remove)\s+(?<target>.+)$/i);
  if (!match?.groups) return null;

  const verb = match.groups.verb.toLowerCase();
  const target = cleanCaptured(match.groups.target);
  if (!target) return null;

  return {
    rawText: input,
    normalizedText: input.toLowerCase(),
    verb,
    isActionLike: true,
    explicitContainer: extractContainerType(target),
    targetName: extractTargetName(target),
    kind: "close_delete_target",
  };
}

export function parseSearchFolderSlots(commandText: string):
  | { query: string; folder: string }
  | null {
  const input = String(commandText || "").trim();
  if (!input) return null;

  const quotedQueryFirst = input.match(
    /^(?:search|find|look\s*up)\s+(?:for\s+)?(?<query>.+?)\s+(?:in|inside|within|from)\s+(?:my\s+)?(?:the\s+)?["'](?<folder>[^"']+?)["']\s*(?:bookmark\s+folder|folder|hub|bookmarks?)?\s*$/i
  );
  if (quotedQueryFirst?.groups) {
    const folder = cleanCaptured(quotedQueryFirst.groups.folder);
    if (!folder || GENERIC_FOLDER_NAME_RE.test(folder)) {
      return null;
    }
    return {
      query: cleanCaptured(quotedQueryFirst.groups.query),
      folder,
    };
  }

  const quotedFolderFirst = input.match(
    /^(?:search|find|look\s*up)\s+(?:(?:in|inside|within|from)\s+)?(?:my\s+)?(?:the\s+)?["'](?<folder>[^"']+?)["']\s*(?:bookmark\s+folder|folder|hub|bookmarks?)?\s+(?:for\s+)?(?<query>.+?)\s*$/i
  );
  if (quotedFolderFirst?.groups) {
    const folder = cleanCaptured(quotedFolderFirst.groups.folder);
    if (!folder || GENERIC_FOLDER_NAME_RE.test(folder)) {
      return null;
    }
    return {
      query: cleanCaptured(quotedFolderFirst.groups.query),
      folder,
    };
  }

  const queryFirst = input.match(
    /^(?:search|find|look\s*up)\s+(?:for\s+)?(?<query>.+?)\s+(?:in|inside|within|from)\s+(?:my\s+)?(?:the\s+)?(?<folder>[\w\s-]+?)\s+(?:bookmark\s+folder|folder|hub|bookmarks?)\s*$/i
  );
  if (queryFirst?.groups) {
    const folder = cleanCaptured(queryFirst.groups.folder);
    if (!folder || GENERIC_FOLDER_NAME_RE.test(folder)) {
      return null;
    }
    return {
      query: cleanCaptured(queryFirst.groups.query),
      folder,
    };
  }

  const folderFirst = input.match(
    /^(?:search|find|look\s*up)\s+(?:(?:in|inside|within|from)\s+)?(?:my\s+)?(?:the\s+)?(?<folder>[\w\s-]+?)\s+(?:bookmark\s+folder|folder|hub|bookmarks?)\s+(?:for\s+)?(?<query>.+?)\s*$/i
  );
  if (folderFirst?.groups) {
    const folder = cleanCaptured(folderFirst.groups.folder);
    if (!folder || GENERIC_FOLDER_NAME_RE.test(folder)) {
      return null;
    }
    return {
      query: cleanCaptured(folderFirst.groups.query),
      folder,
    };
  }

  return null;
}

export function parseSearchMemoryIntent(commandText: string):
  | { query: string; folder?: string; source?: "bookmark-folder" }
  | null {
  const input = String(commandText || "").trim();
  if (!input) {
    return null;
  }

  const folderSourceScope = input.match(
    /^(?:search|find|look\s*up)\s+(?:(?:in|inside|within|from)\s+)?(?:my\s+)?(?:the\s+)?(?:bookmark\s+folders?|folders?|hubs?|bookmarks?)\s+(?:for\s+)?(?<query>.+?)\s*$/i
  );
  if (folderSourceScope?.groups?.query) {
    const scopedQuery = cleanCaptured(folderSourceScope.groups.query);
    if (scopedQuery) {
      return { query: scopedQuery, source: "bookmark-folder" };
    }
  }

  const folderSlots = parseSearchFolderSlots(input);
  if (folderSlots) {
    return folderSlots;
  }

  const wildcard = input.match(
    /what(?:'s|\s+is|\s+did\s+i\s+save)\s+in\s+(?:my\s+)?(?:the\s+)?(?<folder>[\w\s-]+?)\s+(?:bookmark\s+folder|folder|hub|bookmarks?)\b/i
  );
  const wildcardFolder = wildcard?.groups?.folder;
  if (wildcardFolder) {
    return { query: "*", folder: cleanCaptured(wildcardFolder) };
  }

  const queryMatch =
    input.match(
      /(?:search|find|look\s*up)\s+(?:for\s+)?(?:(?:in|inside|within|from)\s+(?:my\s+)?(?:history|bookmarks?|memory|tabs?)\s+)?"?(?<query>.+?)"?\s*$/i
    ) ||
    input.match(
      /have\s+i\s+(?:visited|been\s+to|seen|saved|bookmarked)\s+(?:any\s+)?"?(?<query>.+?)"?\s*$/i
    ) ||
    input.match(
      /(?:do\s+i\s+have)\s+(?:any(?:thing)?\s+(?:about|on|related\s+to)\s+)?"?(?<query>.+?)"?\s*(?:saved|bookmarked|in\s+my)/i
    );
  const query = cleanCaptured(queryMatch?.groups?.query || "");
  if (!query) {
    return null;
  }
  return { query };
}
