import { resolveExplicitOutreachEmailRoute } from "./outreachEmailExplicitResolver.js";
import { resolveExplicitResearchBriefRoute } from "./researchBriefExplicitResolver.js";
import type { RouteArgs, RoutingStateSnapshot } from "./routerTypes.js";

const EMPTY_ROUTING_SNAPSHOT: RoutingStateSnapshot = {
  folderNames: new Set(),
  groupNames: new Set(),
  stale: false,
};

const OUTREACH_TRUSTED_KEYS = [
  "recipient_name",
  "recipient_role",
  "purpose",
  "purpose_notes",
] as const;

const BRIEF_TRUSTED_KEYS = ["topic", "infer_topic_from_content"] as const;

function pickTrustedFields(
  args: RouteArgs,
  keys: readonly string[]
): RouteArgs {
  const picked: RouteArgs = {};
  for (const key of keys) {
    const value = args[key];
    if (value == null) {
      continue;
    }
    if (typeof value === "string" && !value.trim()) {
      continue;
    }
    picked[key] = value;
  }
  return picked;
}

export function trustedArgsFromUtterance(
  command: string,
  utterance: string
): RouteArgs {
  const input = String(utterance || "").trim();
  if (!input) {
    return {};
  }

  if (command === "draft_outreach_email") {
    const route = resolveExplicitOutreachEmailRoute(
      input,
      EMPTY_ROUTING_SNAPSHOT
    );
    if (route?.type === "tool" && route.next === command) {
      return pickTrustedFields(route.args, OUTREACH_TRUSTED_KEYS);
    }
  }

  if (command === "build_research_brief") {
    const route = resolveExplicitResearchBriefRoute(
      input,
      EMPTY_ROUTING_SNAPSHOT
    );
    if (route?.type === "tool" && route.next === command) {
      return pickTrustedFields(route.args, BRIEF_TRUSTED_KEYS);
    }
  }

  return {};
}

export function mergeTrustedArgsOntoAssist(
  command: string,
  assistArgs: RouteArgs,
  utterance: string
): RouteArgs {
  const trusted = trustedArgsFromUtterance(command, utterance);
  if (Object.keys(trusted).length === 0) {
    return assistArgs;
  }
  return { ...assistArgs, ...trusted };
}
