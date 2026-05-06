export type BadgeId =
  | "streak_master"
  | "streak_guardian"
  | "training_volume"
  | "training_accelerator";

export interface TrainingBadgeDefinition {
  id: BadgeId;
  title: string;
  description: string;
  track: "streak" | "submissions";
  milestones: number[];
}

export interface TrainingBadgeUnlock {
  id: BadgeId;
  toLevel: number;
  threshold: number;
  title: string;
}

export interface TrainingProgress {
  totalSubmissions: number;
  currentStreakDays: number;
  longestStreakDays: number;
  lastSubmissionDate: string | null;
  earnedBadgeIds: BadgeId[];
  badgeLevels: Record<BadgeId, number>;
}

export interface TrainingProgressUpdate {
  progress: TrainingProgress;
  unlockedBadges: TrainingBadgeUnlock[];
}

export interface TrainingProgressStore {
  load(): TrainingProgress;
  save(progress: TrainingProgress): void;
}

const TRAINING_PROGRESS_STORAGE_KEY = "oasis_training_progress_v1";

export const STREAK_MILESTONES = [3, 7, 14, 30, 60] as const;
export const SUBMISSION_MILESTONES = [5, 20, 50, 100, 250] as const;

export const TRAINING_BADGES: readonly TrainingBadgeDefinition[] = [
  {
    id: "streak_master",
    title: "Streak Master",
    description: "Keep a daily training streak alive.",
    track: "streak",
    milestones: [...STREAK_MILESTONES],
  },
  {
    id: "streak_guardian",
    title: "Consistency Guardian",
    description: "Return each day and continue coaching Oasis.",
    track: "streak",
    milestones: [2, 5, 10, 20, 45],
  },
  {
    id: "training_volume",
    title: "Training Volume",
    description: "Grow your total training submissions.",
    track: "submissions",
    milestones: [...SUBMISSION_MILESTONES],
  },
  {
    id: "training_accelerator",
    title: "Accelerator",
    description: "Build momentum with steady training activity.",
    track: "submissions",
    milestones: [8, 30, 70, 140, 280],
  },
];

function emptyBadgeLevels(): Record<BadgeId, number> {
  return {
    streak_master: 0,
    streak_guardian: 0,
    training_volume: 0,
    training_accelerator: 0,
  };
}

export function defaultTrainingProgress(): TrainingProgress {
  return {
    totalSubmissions: 0,
    currentStreakDays: 0,
    longestStreakDays: 0,
    lastSubmissionDate: null,
    earnedBadgeIds: [],
    badgeLevels: emptyBadgeLevels(),
  };
}

function normalizeProgress(value: unknown): TrainingProgress {
  const fallback = defaultTrainingProgress();
  if (!value || typeof value !== "object") {
    return fallback;
  }
  const raw = value as Partial<TrainingProgress>;
  const levels = raw.badgeLevels || ({} as Record<BadgeId, number>);
  return {
    totalSubmissions:
      typeof raw.totalSubmissions === "number" && raw.totalSubmissions >= 0
        ? Math.floor(raw.totalSubmissions)
        : 0,
    currentStreakDays:
      typeof raw.currentStreakDays === "number" && raw.currentStreakDays >= 0
        ? Math.floor(raw.currentStreakDays)
        : 0,
    longestStreakDays:
      typeof raw.longestStreakDays === "number" && raw.longestStreakDays >= 0
        ? Math.floor(raw.longestStreakDays)
        : 0,
    lastSubmissionDate:
      typeof raw.lastSubmissionDate === "string"
        ? raw.lastSubmissionDate
        : null,
    earnedBadgeIds: Array.isArray(raw.earnedBadgeIds)
      ? raw.earnedBadgeIds.filter((id): id is BadgeId =>
          TRAINING_BADGES.some(b => b.id === id)
        )
      : [],
    badgeLevels: {
      streak_master:
        typeof levels.streak_master === "number"
          ? Math.max(0, Math.floor(levels.streak_master))
          : 0,
      streak_guardian:
        typeof levels.streak_guardian === "number"
          ? Math.max(0, Math.floor(levels.streak_guardian))
          : 0,
      training_volume:
        typeof levels.training_volume === "number"
          ? Math.max(0, Math.floor(levels.training_volume))
          : 0,
      training_accelerator:
        typeof levels.training_accelerator === "number"
          ? Math.max(0, Math.floor(levels.training_accelerator))
          : 0,
    },
  };
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) {
    return null;
  }
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

function daysBetweenLocal(a: Date, b: Date): number {
  const startA = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const startB = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((startB - startA) / 86400000);
}

export function computeStreakTransition(
  lastSubmissionDate: string | null,
  nowDateKey: string,
  currentStreakDays: number
): number {
  if (!lastSubmissionDate) {
    return 1;
  }
  if (lastSubmissionDate === nowDateKey) {
    return currentStreakDays > 0 ? currentStreakDays : 1;
  }
  const last = parseDateKey(lastSubmissionDate);
  const now = parseDateKey(nowDateKey);
  if (!last || !now) {
    return 1;
  }
  const diff = daysBetweenLocal(last, now);
  if (diff === 1) {
    return Math.max(1, currentStreakDays + 1);
  }
  return 1;
}

function levelForValue(value: number, milestones: number[]): number {
  let level = 0;
  for (const threshold of milestones) {
    if (value >= threshold) {
      level += 1;
    }
  }
  return level;
}

export function computeNewUnlocks(
  progress: TrainingProgress
): TrainingBadgeUnlock[] {
  const unlocks: TrainingBadgeUnlock[] = [];
  for (const badge of TRAINING_BADGES) {
    const value =
      badge.track === "streak"
        ? progress.currentStreakDays
        : progress.totalSubmissions;
    const nextLevel = levelForValue(value, badge.milestones);
    const prevLevel = progress.badgeLevels[badge.id] || 0;
    if (nextLevel > prevLevel) {
      for (let level = prevLevel + 1; level <= nextLevel; level++) {
        unlocks.push({
          id: badge.id,
          toLevel: level,
          threshold:
            badge.milestones[level - 1] ||
            badge.milestones[badge.milestones.length - 1],
          title: badge.title,
        });
      }
      progress.badgeLevels[badge.id] = nextLevel;
      if (!progress.earnedBadgeIds.includes(badge.id)) {
        progress.earnedBadgeIds.push(badge.id);
      }
    }
  }
  return unlocks;
}

export const localTrainingProgressStore: TrainingProgressStore = {
  load() {
    try {
      const raw = window.localStorage.getItem(TRAINING_PROGRESS_STORAGE_KEY);
      if (!raw) {
        return defaultTrainingProgress();
      }
      return normalizeProgress(JSON.parse(raw));
    } catch {
      return defaultTrainingProgress();
    }
  },
  save(progress) {
    try {
      window.localStorage.setItem(
        TRAINING_PROGRESS_STORAGE_KEY,
        JSON.stringify(normalizeProgress(progress))
      );
    } catch (err) {
      console.warn("[trainingProgress] localStorage save failed", err);
    }
  },
};

export function loadTrainingProgress(
  store: TrainingProgressStore = localTrainingProgressStore
): TrainingProgress {
  return store.load();
}

export function saveTrainingProgress(
  progress: TrainingProgress,
  store: TrainingProgressStore = localTrainingProgressStore
): void {
  store.save(progress);
}

export function recordTrainingSubmission(
  now: Date = new Date(),
  store: TrainingProgressStore = localTrainingProgressStore
): TrainingProgressUpdate {
  const progress = loadTrainingProgress(store);
  const dayKey = toDateKey(now);
  progress.totalSubmissions += 1;
  progress.currentStreakDays = computeStreakTransition(
    progress.lastSubmissionDate,
    dayKey,
    progress.currentStreakDays
  );
  progress.longestStreakDays = Math.max(
    progress.longestStreakDays,
    progress.currentStreakDays
  );
  progress.lastSubmissionDate = dayKey;
  const unlockedBadges = computeNewUnlocks(progress);
  saveTrainingProgress(progress, store);
  return { progress, unlockedBadges };
}

export function nextMilestone(
  value: number,
  milestones: readonly number[]
): number | null {
  for (const threshold of milestones) {
    if (value < threshold) {
      return threshold;
    }
  }
  return null;
}
