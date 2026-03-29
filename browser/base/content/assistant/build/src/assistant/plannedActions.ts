/**
 * Planned actions — encode/decode multi-step action plans.
 *
 * When the LLM returns a route_action_plan (multiple commands to run
 * sequentially), this module serializes each planned action into the
 * command queue as prefixed JSON strings, and deserializes them when
 * the supervisor dequeues the next command.
 */
import type { GraphArgs } from "./messageUtils.js";

export type PlannedAction = {
  next: string;
  args: GraphArgs;
};

const PLAN_PREFIX = "__oasis_plan__:";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeAction(
  value: unknown,
  memberNameSet: ReadonlySet<string>
): PlannedAction | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const nextRaw = record.next;
  const next =
    typeof nextRaw === "string" ? nextRaw.trim() : String(nextRaw || "").trim();
  if (!next || !memberNameSet.has(next)) {
    return null;
  }
  const argsRecord = asRecord(record.args) || {};
  return { next, args: argsRecord };
}

export function parsePlannedActions(
  rawArgs: Record<string, unknown>,
  memberNameSet: ReadonlySet<string>,
  maxActions: number
): PlannedAction[] {
  const rawActions = Array.isArray(rawArgs.actions) ? rawArgs.actions : [];
  const actions: PlannedAction[] = [];

  for (const item of rawActions) {
    const normalized = normalizeAction(item, memberNameSet);
    if (!normalized) {
      continue;
    }
    actions.push(normalized);
    if (actions.length >= maxActions) {
      break;
    }
  }

  return actions;
}

export function encodePlannedAction(action: PlannedAction): string {
  return `${PLAN_PREFIX}${JSON.stringify(action)}`;
}

export function decodePlannedAction(value: string): PlannedAction | null {
  const text = String(value || "").trim();
  if (!text.startsWith(PLAN_PREFIX)) {
    return null;
  }

  try {
    const parsed = JSON.parse(text.slice(PLAN_PREFIX.length));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const next = String((parsed as { next?: unknown }).next || "").trim();
    if (!next) {
      return null;
    }
    const args = asRecord((parsed as { args?: unknown }).args) || {};
    return { next, args };
  } catch {
    return null;
  }
}
