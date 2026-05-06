import { h } from "preact";
import { useEffect } from "preact/hooks";
import type { JSX } from "preact";
import {
  nextMilestone,
  STREAK_MILESTONES,
  SUBMISSION_MILESTONES,
  TRAINING_BADGES,
  type TrainingProgress,
} from "../utils/trainingProgress";

interface TrainingGalleryProps {
  open: boolean;
  progress: TrainingProgress;
  onClose: () => void;
}

const BADGE_MARKS: Record<string, string> = {
  streak_master: "SM",
  streak_guardian: "CG",
  training_volume: "TV",
  training_accelerator: "AC",
};

function progressPercent(value: number, currentThreshold: number, nextThreshold: number): number {
  const span = Math.max(1, nextThreshold - currentThreshold);
  const done = Math.min(span, Math.max(0, value - currentThreshold));
  return Math.round((done / span) * 100);
}

export function TrainingGallery({ open, progress, onClose }: TrainingGalleryProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const prev = document.body.style.overflow;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const nextStreak = nextMilestone(progress.currentStreakDays, STREAK_MILESTONES);
  const nextSubmission = nextMilestone(progress.totalSubmissions, SUBMISSION_MILESTONES);
  const streakStart = STREAK_MILESTONES
    .slice()
    .reverse()
    .find(v => v <= progress.currentStreakDays) || 0;
  const submissionStart = SUBMISSION_MILESTONES
    .slice()
    .reverse()
    .find(v => v <= progress.totalSubmissions) || 0;

  return (
    <div
      className="training-gallery-overlay"
      role="presentation"
      onMouseDown={(e: JSX.TargetedMouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="training-gallery-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="training-gallery-title"
        onMouseDown={(e: JSX.TargetedMouseEvent<HTMLDivElement>) => e.stopPropagation()}
      >
        <div className="training-gallery-head">
          <h2 id="training-gallery-title">Training progress</h2>
          <button
            type="button"
            className="training-gallery-close"
            onClick={onClose}
            aria-label="Close training progress"
          >
            ×
          </button>
        </div>

        <div className="training-gallery-stats">
          <div className="training-stat-card">
            <span className="training-stat-label">Current streak</span>
            <strong className="training-stat-value">{progress.currentStreakDays} days</strong>
          </div>
          <div className="training-stat-card">
            <span className="training-stat-label">Longest streak</span>
            <strong className="training-stat-value">{progress.longestStreakDays} days</strong>
          </div>
          <div className="training-stat-card">
            <span className="training-stat-label">Total trainings</span>
            <strong className="training-stat-value">{progress.totalSubmissions}</strong>
          </div>
        </div>

        <p className="training-gallery-streak-note">
          Streak counts consecutive calendar days with at least one saved training. More trainings the
          same day still add to total trainings above.
        </p>

        <div className="training-gallery-milestones">
          <div className="training-milestone-card">
            <div className="training-milestone-row">
              <span>Streak milestone</span>
              <strong>
                {nextStreak ? `${nextStreak - progress.currentStreakDays} days to ${nextStreak}` : "Max tier reached"}
              </strong>
            </div>
            {nextStreak ? (
              <div className="training-progress-track" aria-hidden="true">
                <span
                  className="training-progress-fill"
                  style={{
                    width: `${progressPercent(
                      progress.currentStreakDays,
                      streakStart,
                      nextStreak
                    )}%`,
                  }}
                />
              </div>
            ) : null}
          </div>

          <div className="training-milestone-card">
            <div className="training-milestone-row">
              <span>Submission milestone</span>
              <strong>
                {nextSubmission
                  ? `${nextSubmission - progress.totalSubmissions} to ${nextSubmission}`
                  : "Max tier reached"}
              </strong>
            </div>
            {nextSubmission ? (
              <div className="training-progress-track" aria-hidden="true">
                <span
                  className="training-progress-fill"
                  style={{
                    width: `${progressPercent(
                      progress.totalSubmissions,
                      submissionStart,
                      nextSubmission
                    )}%`,
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="training-gallery-badges">
          <h3>Badge gallery</h3>
          <div className="training-badge-grid">
            {TRAINING_BADGES.map(badge => {
              const level = progress.badgeLevels[badge.id] || 0;
              const earned = level > 0;
              return (
                <article
                  key={badge.id}
                  className={`training-badge-card${earned ? " training-badge-card--earned" : ""}`}
                >
                  <div className="training-badge-icon">{BADGE_MARKS[badge.id] || "BG"}</div>
                  <div className="training-badge-copy">
                    <strong>{badge.title}</strong>
                    <p>{badge.description}</p>
                    <span>
                      Level {level}/{badge.milestones.length}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <p className="training-gallery-footer-hint">
          Train the assistant from chat to earn bonus AI commands toward your daily allowance.
        </p>
      </div>
    </div>
  );
}

