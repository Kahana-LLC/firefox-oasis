import type { OasisWindow } from '../types';
import {
  defaultTrainingProgress,
  trainingProgressFromMetrics,
  type TrainingProgress,
} from './trainingProgress';

export const OASIS_TRAINING_METRICS_INVALIDATE = 'oasis-training-metrics-invalidate';

export function invalidateTrainingGalleryMetrics(): void {
  window.dispatchEvent(new CustomEvent(OASIS_TRAINING_METRICS_INVALIDATE));
}

export async function fetchTrainingProgressFromGrants(): Promise<TrainingProgress | null> {
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
  const { data, error } = await supabase.rpc('training_progress_from_grants');
  if (error) {
    console.warn('[trainingMetrics] training_progress_from_grants', error);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    return trainingProgressFromMetrics(0, 0, 0, null);
  }
  const r = row as Record<string, unknown>;
  const total = Number(r.total_qualifying ?? 0);
  const cur = Number(r.current_streak ?? 0);
  const lng = Number(r.longest_streak ?? 0);
  const last = r.last_grant_date;
  let lastStr: string | null = null;
  if (last != null) {
    lastStr = typeof last === 'string' ? last.slice(0, 10) : String(last).slice(0, 10);
  }
  return trainingProgressFromMetrics(total, cur, lng, lastStr);
}
