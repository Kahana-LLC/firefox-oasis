import type {
  DeterministicRouteDecision,
  RouteArgs,
  RoutingStateSnapshot,
} from "./routerTypes.js";
import {
  GROUP_NAME,
  TAB_GROUP_SUFFIX,
  normalizeResearchBriefInput,
} from "./researchBriefUtterances.js";
import type { OutreachEmailPurpose } from "../services/outreachEmailTypes.js";

const EMAIL_VERB =
  "(?:draft|write|compose|create|generate|prepare)\\s+(?:me\\s+)?(?:a\\s+)?";
const EMAIL_KIND =
  "(?:networking|follow[\\s-]?up|thank[\\s-]?you|cold|outreach|personalized)";

function toolDecision(
  next: string,
  reason: string,
  args: RouteArgs
): DeterministicRouteDecision {
  return { type: "tool", next, args, reason };
}

function trimQuotes(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

export function inferOutreachEmailPurpose(input: string): {
  purpose: OutreachEmailPurpose;
  purposeNotes: string;
} {
  const normalized = String(input || "").trim();
  const lower = normalized.toLowerCase();
  if (/\bthank[\s-]?you\b/.test(lower)) {
    return { purpose: "thank_you", purposeNotes: normalized };
  }
  if (/\bfollow[\s-]?up\b/.test(lower)) {
    return { purpose: "follow_up", purposeNotes: normalized };
  }
  if (/\bcold\b/.test(lower) || /\boutreach\b/.test(lower)) {
    return { purpose: "cold", purposeNotes: normalized };
  }
  if (/\bnetwork(?:ing)?\b/.test(lower) || /\bintro(?:duction)?\b/.test(lower)) {
    return { purpose: "networking", purposeNotes: normalized };
  }
  return { purpose: "custom", purposeNotes: normalized };
}

export function extractOutreachRecipient(input: string): {
  recipientName?: string;
  recipientRole?: string;
} {
  const toMatch = input.match(
    /\b(?:to|for)\s+([A-Za-z][\w'.-]+(?:\s+[A-Za-z][\w'.-]+)?)(?:\s+about\s+(.+?))?(?:\s+from\b|\s+using\b|\s*$)/i
  );
  if (toMatch?.[1]) {
    return {
      recipientName: trimQuotes(toMatch[1]),
      recipientRole: toMatch[2] ? trimQuotes(toMatch[2]) : undefined,
    };
  }
  return {};
}

function baseEmailArgs(input: string, scopeArgs: RouteArgs): RouteArgs {
  const { purpose, purposeNotes } = inferOutreachEmailPurpose(input);
  const recipient = extractOutreachRecipient(input);
  return {
    ...scopeArgs,
    purpose,
    purpose_notes: purposeNotes,
    recipient_name: recipient.recipientName,
    recipient_role: recipient.recipientRole,
  };
}

function hasOutreachTabScope(normalized: string): boolean {
  return (
    /\bfrom\s+(?:relevant|related)\s+tabs?\b/i.test(normalized) ||
    /\bfrom\s+(?:these|my|the)\s+tabs?\b/i.test(normalized) ||
    /\bfrom\s+(?:my\s+)?research\s+tabs?\b/i.test(normalized) ||
    /\bfrom\s+tabs?\s+(?:related to|about)\b/i.test(normalized) ||
    /\busing\s+all\s+open\s+tabs?\b/i.test(normalized) ||
    /\b(?:tab\s+)?group\b/i.test(normalized) ||
    /\b(?:this|current|my)\s+(?:tab\s+)?group\b/i.test(normalized) ||
    /\bfrom\s+(?:this|current|my)\s+window\b/i.test(normalized)
  );
}

export function looksLikeOutreachEmailCommand(input: string): boolean {
  const normalized = normalizeResearchBriefInput(input).toLowerCase();
  if (!/\b(?:email|e-mail|mail)\b/.test(normalized)) {
    return false;
  }
  return (
    new RegExp(`^${EMAIL_VERB}`, "i").test(normalized) ||
    /\b(?:networking|follow[\s-]?up|thank[\s-]?you|outreach|cold)\s+(?:email|e-mail|mail)\b/i.test(
      normalized
    ) ||
    /\bpersonalized\s+(?:email|e-mail|mail)\b/i.test(normalized)
  );
}

export function isObviousOutreachEmailRequest(userText: string): boolean {
  const normalized = normalizeResearchBriefInput(userText);
  if (!looksLikeOutreachEmailCommand(normalized)) {
    return false;
  }
  return hasOutreachTabScope(normalized);
}

export function finalizeOutreachEmailArgs(
  args: RouteArgs,
  _snapshot: RoutingStateSnapshot
): RouteArgs | null {
  const scope =
    args.scope === "relevant"
      ? "relevant"
      : args.scope === "window"
        ? "window"
        : args.scope === "tabs"
          ? "tabs"
          : "tab-group";
  const merged: RouteArgs = { ...args, scope };

  if (args.use_active_tab_group === true) {
    merged.use_active_tab_group = true;
    merged.scope = "tab-group";
    delete merged.name;
  } else if (scope === "tab-group" && !String(merged.name || "").trim()) {
    return null;
  }

  if (scope === "tabs") {
    const queries = Array.isArray(merged.tab_queries) ? merged.tab_queries : [];
    const indices = Array.isArray(merged.tab_indices) ? merged.tab_indices : [];
    if (queries.length === 0 && indices.length === 0) {
      return null;
    }
  }

  return merged;
}

const OUTREACH_EMAIL_PATTERNS: Array<{
  reason: string;
  match: RegExp;
  resolve: (match: RegExpMatchArray, input: string) => RouteArgs | null;
}> = [
  {
    reason: "outreach-email-from-these-tabs",
    match: new RegExp(
      `^${EMAIL_VERB}(?:${EMAIL_KIND}\\s+)?(?:email|e-mail|mail)(?:\\s+to\\s+(?<recipient>[\\w\\s'.-]+?))?(?:\\s+from\\s+)?(?:these|my|the)\\s+tabs?\\s*$`,
      "i"
    ),
    resolve: (_match, input) => baseEmailArgs(input, { scope: "relevant" }),
  },
  {
    reason: "outreach-email-from-relevant-tabs",
    match: new RegExp(
      `^${EMAIL_VERB}(?:${EMAIL_KIND}\\s+)?(?:email|e-mail|mail)(?:\\s+to\\s+(?<recipient>[\\w\\s'.-]+?))?\\s+from\\s+(?:relevant|related)\\s+tabs?\\s*$`,
      "i"
    ),
    resolve: (_match, input) => baseEmailArgs(input, { scope: "relevant" }),
  },
  {
    reason: "outreach-email-from-tabs-about",
    match: new RegExp(
      `^${EMAIL_VERB}(?:${EMAIL_KIND}\\s+)?(?:email|e-mail|mail)\\s+from\\s+tabs?\\s+(?:related to|about)\\s+(.+?)\\s*$`,
      "i"
    ),
    resolve: (_match, input) => baseEmailArgs(input, { scope: "relevant" }),
  },
  {
    reason: "outreach-email-from-tab-group",
    match: new RegExp(
      `^${EMAIL_VERB}(?:${EMAIL_KIND}\\s+)?(?:email|e-mail|mail)(?:\\s+to\\s+(?<recipient>[\\w\\s'.-]+?))?\\s+from\\s+(?:my\\s+)?(?:tab\\s+)?group\\s+${GROUP_NAME}\\s*$`,
      "i"
    ),
    resolve: (match, input) => {
      const name = trimQuotes(match.groups?.name || "");
      return name
        ? baseEmailArgs(input, { scope: "tab-group", name })
        : null;
    },
  },
  {
    reason: "outreach-email-tab-group-suffix",
    match: new RegExp(
      `^${EMAIL_VERB}(?:${EMAIL_KIND}\\s+)?(?:email|e-mail|mail)\\s+${TAB_GROUP_SUFFIX}\\s*$`,
      "i"
    ),
    resolve: (match, input) => {
      const name = trimQuotes(match.groups?.name || "");
      return name
        ? baseEmailArgs(input, { scope: "tab-group", name })
        : null;
    },
  },
  {
    reason: "outreach-email-active-tab-group",
    match: new RegExp(
      `^${EMAIL_VERB}(?:${EMAIL_KIND}\\s+)?(?:email|e-mail|mail)\\s+from\\s+(?:this|current|my)\\s+(?:tab\\s+)?group\\s*$`,
      "i"
    ),
    resolve: (_match, input) =>
      baseEmailArgs(input, {
        scope: "tab-group",
        use_active_tab_group: true,
      }),
  },
  {
    reason: "outreach-email-research-tabs",
    match: new RegExp(
      `^${EMAIL_VERB}(?:${EMAIL_KIND}\\s+)?(?:email|e-mail|mail)(?:\\s+to\\s+(?<recipient>[\\w\\s'.-]+?))?\\s+from\\s+(?:my\\s+)?research\\s+tabs?\\s*$`,
      "i"
    ),
    resolve: (_match, input) => baseEmailArgs(input, { scope: "relevant" }),
  },
  {
    reason: "outreach-email-using-all-open-tabs",
    match: new RegExp(
      `^${EMAIL_VERB}(?:${EMAIL_KIND}\\s+)?(?:email|e-mail|mail)(?:\\s+to\\s+(?<recipient>[\\w\\s'.-]+?))?\\s+using\\s+all\\s+open\\s+tabs?\\s*$`,
      "i"
    ),
    resolve: (_match, input) => baseEmailArgs(input, { scope: "relevant" }),
  },
  {
    reason: "outreach-email-using-active-tab",
    match: new RegExp(
      `^${EMAIL_VERB}(?:${EMAIL_KIND}\\s+)?(?:email|e-mail|mail)(?:\\s+to\\s+(?<recipient>[\\w\\s'.-]+?))?\\s+using\\s+(?:the\\s+)?active\\s+tab\\s*$`,
      "i"
    ),
    resolve: (_match, input) =>
      baseEmailArgs(input, { scope: "relevant", max_tabs: 1 }),
  },
  {
    reason: "outreach-email-generic",
    match: new RegExp(
      `^${EMAIL_VERB}(?:${EMAIL_KIND}\\s+)?(?:email|e-mail|mail)\\b`,
      "i"
    ),
    resolve: (_match, input) => baseEmailArgs(input, { scope: "window" }),
  },
];

export function resolveExplicitOutreachEmailRoute(
  input: string,
  snapshot: RoutingStateSnapshot
): DeterministicRouteDecision | null {
  const normalized = normalizeResearchBriefInput(input).trim();
  if (!normalized || !looksLikeOutreachEmailCommand(normalized)) {
    return null;
  }

  for (const pattern of OUTREACH_EMAIL_PATTERNS) {
    const match = normalized.match(pattern.match);
    if (!match) {
      continue;
    }
    const rawArgs = pattern.resolve(match, normalized);
    if (!rawArgs) {
      continue;
    }
    const args = finalizeOutreachEmailArgs(rawArgs, snapshot);
    if (!args) {
      continue;
    }
    return toolDecision("draft_outreach_email", pattern.reason, args);
  }

  return null;
}
