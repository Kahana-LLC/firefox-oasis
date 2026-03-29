/**
 * Stream guards — infinite loop detection for graph execution.
 *
 * Tracks step count and same-step streaks during graph.stream().
 * If the graph exceeds 36 total steps or repeats the same node
 * 8+ times, execution is halted to prevent runaway loops.
 * Used by stream.ts.
 */
export type StreamGuardConfig = {
  maxStreamSteps: number;
  maxSameStepStreak: number;
};

export type StreamGuardState = {
  stepCount: number;
  previousStepName: string;
  sameStepStreak: number;
};

export const STREAM_GUARD_DEFAULTS: StreamGuardConfig = {
  maxStreamSteps: 36,
  maxSameStepStreak: 8,
};

export function createStreamGuardState(): StreamGuardState {
  return {
    stepCount: 0,
    previousStepName: "",
    sameStepStreak: 0,
  };
}

export function advanceStreamGuard(
  state: StreamGuardState,
  stepName: string
): StreamGuardState {
  const nextStepCount = state.stepCount + 1;
  if (stepName === state.previousStepName) {
    return {
      stepCount: nextStepCount,
      previousStepName: state.previousStepName,
      sameStepStreak: state.sameStepStreak + 1,
    };
  }
  return {
    stepCount: nextStepCount,
    previousStepName: stepName,
    sameStepStreak: 1,
  };
}

export function shouldStopForStreamGuard(
  state: StreamGuardState,
  config: StreamGuardConfig = STREAM_GUARD_DEFAULTS
): boolean {
  return (
    state.stepCount > config.maxStreamSteps ||
    state.sameStepStreak > config.maxSameStepStreak
  );
}
