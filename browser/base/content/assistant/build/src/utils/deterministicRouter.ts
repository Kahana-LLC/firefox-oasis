import { decideDeterministicRoute } from "./decisionEngine.js";
import { routingStateCache } from "./routingStateCache.js";
import type {
  DeterministicRouteDecision,
  RoutingStateMutation,
} from "./routerTypes.js";

export function routeDeterministically(commandText: string): DeterministicRouteDecision {
  routingStateCache.ensureInitialized();
  const snapshot = routingStateCache.getSnapshotSync();
  return decideDeterministicRoute(commandText, snapshot);
}

export function markRoutingStateDirty(reason: string): void {
  routingStateCache.applyMutation({ kind: "dirty", reason });
}

export function applyRoutingStateMutation(mutation: RoutingStateMutation): void {
  routingStateCache.applyMutation(mutation);
}
