/**
 * Deterministic router — entry point for non-AI routing.
 *
 * Called from graph.ts as a fallback when the LLM-based routing is
 * unavailable. Gets a snapshot of the current browser state (tab
 * groups, bookmark folders) and delegates to decisionEngine.ts.
 */
import { decideDeterministicRoute } from "./decisionEngine.js";
import { routingStateCache } from "./routingStateCache.js";
import type {
  DeterministicRouteDecision,
  RoutingStateMutation,
} from "./routerTypes.js";

export function routeDeterministically(
  commandText: string
): DeterministicRouteDecision {
  routingStateCache.ensureInitialized();
  const snapshot = routingStateCache.getSnapshotSync();
  return decideDeterministicRoute(commandText, snapshot);
}

export function markRoutingStateDirty(reason: string): void {
  routingStateCache.applyMutation({ kind: "dirty", reason });
}

export function applyRoutingStateMutation(
  mutation: RoutingStateMutation
): void {
  routingStateCache.applyMutation(mutation);
}
