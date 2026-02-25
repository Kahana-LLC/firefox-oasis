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
