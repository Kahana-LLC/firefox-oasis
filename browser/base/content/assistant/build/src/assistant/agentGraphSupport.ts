/**
 * Shared graph helpers (supervisor / tool arg shaping, ambiguity wiring).
 * Keeps graph.ts slimmer; see agentSteps.ts for per-command tool nodes.
 */
import type { PendingAmbiguityPayload } from "../../../shared/contracts.js";
import type { PendingAmbiguityPayload as RouterPendingAmbiguityPayload } from "../utils/routerTypes.js";
import { setPendingAmbiguity } from "../services/interactionState.js";
import { assistantLogger } from "../utils/assistantLogger.js";
import type { GraphArgs } from "./messageUtils.js";
import { INTERNAL_CHAIN_NOTICE_ARG } from "./constants.js";

export function splitInternalArgs(args: GraphArgs): {
  commandArgs: GraphArgs;
  chainNotice: string | null;
} {
  const commandArgs: GraphArgs = {};
  let chainNotice: string | null = null;

  for (const [key, value] of Object.entries(args || {})) {
    if (key === INTERNAL_CHAIN_NOTICE_ARG && typeof value === "string") {
      chainNotice = value.trim() || null;
      continue;
    }
    if (key.startsWith("__oasis")) {
      continue;
    }
    commandArgs[key] = value;
  }

  return { commandArgs, chainNotice };
}

export function toAmbiguityPayload(
  routePending: RouterPendingAmbiguityPayload
): PendingAmbiguityPayload {
  return {
    kind: routePending.kind || "container_target",
    name: routePending.name,
    query: routePending.query,
    all: routePending.all,
    choices: routePending.choices,
    tabIndex: routePending.tabIndex,
    verb: routePending.verb,
    originalText: routePending.originalText,
    description:
      routePending.kind === "close_delete_target"
        ? `Ambiguous close/delete target for "${routePending.name}"`
        : `Ambiguous container target for "${routePending.name}"`,
  };
}

export function setRoutePendingAmbiguity(
  routePending: RouterPendingAmbiguityPayload
): void {
  setPendingAmbiguity(toAmbiguityPayload(routePending));
  assistantLogger.debug("router", "Ambiguity detected", {
    name: routePending.name,
    query: routePending.query || "",
    all: !!routePending.all,
    kind: routePending.kind || "container_target",
  });
}
