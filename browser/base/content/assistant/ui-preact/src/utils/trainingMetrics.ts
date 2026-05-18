import type { OasisWindow } from "../types";

export const OASIS_TRAINING_METRICS_INVALIDATE =
  "oasis-training-metrics-invalidate";

export type TrainingGalleryMetrics = {
  totalTrainings: number;
  currentStreakDays: number;
  totalBonusTokens: number;
};

export const defaultTrainingGalleryMetrics = (): TrainingGalleryMetrics => ({
  totalTrainings: 0,
  currentStreakDays: 0,
  totalBonusTokens: 0,
});

export function invalidateTrainingGalleryMetrics(): void {
  window.dispatchEvent(new CustomEvent(OASIS_TRAINING_METRICS_INVALIDATE));
}

export async function fetchTrainingGalleryMetrics(): Promise<TrainingGalleryMetrics | null> {
  const supabase = (window as OasisWindow).supabaseAuth?.supabase;
  if (!supabase) {
    return null;
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }
  const { data, error } = await supabase.rpc("training_progress_from_grants");
  if (error) {
    console.warn("[trainingMetrics] training_progress_from_grants", error);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    return defaultTrainingGalleryMetrics();
  }
  const r = row as Record<string, unknown>;
  return {
    totalTrainings: Number(r.total_qualifying ?? 0),
    currentStreakDays: Number(r.current_streak ?? 0),
    totalBonusTokens: Number(r.total_bonus_tokens ?? 0),
  };
}

/** @deprecated Use fetchTrainingGalleryMetrics */
export async function fetchTrainingProgressFromGrants(): Promise<TrainingGalleryMetrics | null> {
  return fetchTrainingGalleryMetrics();
}
