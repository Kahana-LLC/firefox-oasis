export const VERB_PREFIX =
  "(?:create|make|build|write|generate|draft|prepare)\\s+(?:me\\s+)?(?:a\\s+)?(?:new\\s+)?(?:document\\s+for\\s+(?:a\\s+)?)?";

export const PRODUCT_NOUN_ALT =
  "(?:research\\s+)?(?:brief|report|digest|rundown|outline|briefing|write[- ]?up|memo|dossier)";

export const PRODUCT_START = `(?:${VERB_PREFIX})?(?:a\\s+)?${PRODUCT_NOUN_ALT}`;

export const TOPIC_SEGMENT = "(?:on|about|for)\\s+(?<topic>.+?)";

export const SCOPE_PREP = "(?:from|in|using|based\\s+on|for\\s+my)\\s+";

export const ACROSS_SCOPE = "(?:across|over)\\s+";

export const GROUP_NAME = "['\"]?(?<name>[^'\"]+?)['\"]?";

export const TAB_GROUP_SUFFIX = `(?:the\\s+)?(?:my\\s+)?(?:tab\\s+)?group\\s+${GROUP_NAME}`;

export const SYNTHESIS_VERB =
  "(?:consolidat(?:e|ing)|synthesiz(?:e|ing)|compil(?:e|ing)|merg(?:e|ing)|combin(?:e|ing)|distill(?:ing)?)";

export const SYNTHESIS_START = `(?:please\\s+)?${SYNTHESIS_VERB}\\s*(?:the\\s+)?(?:findings|research|notes|tabs?|pages?|sources?)?\\s*`;

export const BRIEF_SYNONYM_NOUN_RE =
  /\b(?:research\s+)?(?:report|digest|rundown|outline|briefing|write[- ]?up|memo|dossier)\b/i;

export const MULTI_TAB_SYNTHESIS_VERB_RE =
  /\b(?:consolidat(?:e|ing)|synthesiz(?:e|ing)|compil(?:e|ing)|merg(?:e|ing)|combin(?:e|ing)|distill(?:ing)?)\b/i;

const SINGLE_TAB_SUMMARIZE_RE =
  /\bsummariz(?:e|ing)\s+(?:the\s+)?(?:this|current|active)\s+(?:page|tab)\b/i;

const SINGLE_TAB_INDEX_SUMMARIZE_RE =
  /\bsummariz(?:e|ing)\s+(?:the\s+)?tab\s+\d+\b/i;

export function normalizeResearchBriefInput(input: string): string {
  return String(input || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bresearhc\b/gi, "research");
}

export function hasMultiTabScope(normalized: string): boolean {
  return (
    /\b(?:tab\s+)?group\b/i.test(normalized) ||
    /\b(?:this|current|my)\s+(?:tab\s+)?group\b/i.test(normalized) ||
    /\bwindow\b/i.test(normalized) ||
    /\bfrom\s+tabs?\b/i.test(normalized) ||
    /\bacross\s+(?:these\s+)?tabs?\b/i.test(normalized) ||
    /\ball\s+tabs?\s+(?:in|from)\b/i.test(normalized) ||
    /\beverything\s+in\s+(?:(?:this|current|my)\s+)?(?:tab\s+)?group\b/i.test(
      normalized
    ) ||
    /\bacross\s+(?:this|current|my)\s+(?:tab\s+)?group\b/i.test(normalized) ||
    /\btab\s+(?:titled|named|called)\b/i.test(normalized) ||
    /\btabs?\s+matching\b/i.test(normalized)
  );
}

export function isBriefSynonymNoun(normalized: string): boolean {
  return BRIEF_SYNONYM_NOUN_RE.test(normalized);
}

export function isMultiTabSynthesisVerb(normalized: string): boolean {
  return MULTI_TAB_SYNTHESIS_VERB_RE.test(normalized);
}

export function isMultiTabSummarizePhrase(normalized: string): boolean {
  if (!/\bsummariz(?:e|ing)\b/i.test(normalized)) {
    return false;
  }
  if (SINGLE_TAB_SUMMARIZE_RE.test(normalized)) {
    return false;
  }
  if (SINGLE_TAB_INDEX_SUMMARIZE_RE.test(normalized)) {
    return false;
  }
  return hasMultiTabScope(normalized);
}

export function isScopedSummaryPhrase(normalized: string): boolean {
  if (!/\bsummary\b/i.test(normalized)) {
    return false;
  }
  if (/\b(?:this|current)\s+(?:page|tab)\b/i.test(normalized)) {
    return false;
  }
  return hasMultiTabScope(normalized);
}

export function looksLikeResearchBriefCommand(input: string): boolean {
  const normalized = normalizeResearchBriefInput(input);
  if (/research\s+brief/i.test(normalized)) {
    return true;
  }
  if (/\bbrief\b/i.test(normalized)) {
    return (
      /^(?:create|make|build|write|generate|draft|prepare)\b/i.test(
        normalized
      ) ||
      /\bbrief\s+(?:based\s+on|from|for|about|on)\b/i.test(normalized) ||
      hasMultiTabScope(normalized)
    );
  }
  if (isMultiTabSummarizePhrase(normalized)) {
    return true;
  }
  if (isMultiTabSynthesisVerb(normalized) && hasMultiTabScope(normalized)) {
    return true;
  }
  if (isBriefSynonymNoun(normalized) && hasMultiTabScope(normalized)) {
    return true;
  }
  if (isScopedSummaryPhrase(normalized)) {
    return true;
  }
  return false;
}

export function isObviousResearchBriefRequest(userText: string): boolean {
  const normalized = normalizeResearchBriefInput(userText);
  if (!looksLikeResearchBriefCommand(normalized)) {
    return false;
  }
  return hasMultiTabScope(normalized);
}
