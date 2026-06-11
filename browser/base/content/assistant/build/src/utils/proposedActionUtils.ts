export type PendingProposedAction = {
  proposedPrompt: string;
  suggestedTool?: string;
};

const PROPOSAL_RE =
  /\b(?:i(?:'ll| will)|i can|would you like me to|let me|shall i|want me to)\b/i;

const ACTION_VERB_RE =
  /\b(?:open|search|close|play|watch|find|create|build|remove|delete|organize|summarize)\b/i;

const UNBACKED_CLAIM_RE =
  /\b(?:i(?:'ve| have)|done|opened|playing|closed|created|removed|searched|found)\b/i;

export function detectProposedActionFromText(
  text: string
): PendingProposedAction | null {
  const content = String(text || "").trim();
  if (!content || !PROPOSAL_RE.test(content) || !ACTION_VERB_RE.test(content)) {
    return null;
  }

  const youtubeMatch =
    content.match(
      /(?:search|look)\s+(?:on\s+)?youtube\s+for\s+["']?([^"'.]+)["']?/i
    ) ||
    content.match(/youtube\s+(?:search\s+)?for\s+["']?([^"'.]+)["']?/i) ||
    content.match(/watch\s+["']?([^"'.]+)["']?\s+on\s+youtube/i);
  if (youtubeMatch?.[1]) {
    return {
      proposedPrompt: `play ${youtubeMatch[1].trim()} on youtube`,
      suggestedTool: "play_video",
    };
  }

  const playMatch = content.match(
    /\b(?:play|watch)\s+(?:the\s+)?(.+?)(?:\s+on\s+youtube)?[.!?]*$/i
  );
  if (playMatch?.[1]) {
    return {
      proposedPrompt: `play ${playMatch[1].trim()}`,
      suggestedTool: "play_video",
    };
  }

  const searchMatch = content.match(
    /\bsearch\s+(?:the\s+web\s+)?for\s+["']?([^"'.]+)["']?/i
  );
  if (searchMatch?.[1]) {
    return {
      proposedPrompt: `search the web for ${searchMatch[1].trim()}`,
      suggestedTool: "web_search",
    };
  }

  return { proposedPrompt: content };
}

export function looksLikeUnbackedActionClaim(text: string): boolean {
  const content = String(text || "").trim();
  if (!content || !UNBACKED_CLAIM_RE.test(content)) {
    return false;
  }
  return ACTION_VERB_RE.test(content) || /\byoutube\b/i.test(content);
}

export function isAffirmativeFollowUp(text: string): boolean {
  return /^(?:yes|yeah|yep|y|ok|okay|do\s+it|go\s+ahead|sure|please|confirm)\.?$/i.test(
    String(text || "").trim()
  );
}
