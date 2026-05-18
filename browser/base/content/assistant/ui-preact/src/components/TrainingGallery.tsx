import { h } from "preact";
import { useCallback, useEffect, useState } from "preact/hooks";
import type { JSX } from "preact";
import {
  OASIS_TRAINING_METRICS_INVALIDATE,
  defaultTrainingGalleryMetrics,
  fetchTrainingGalleryMetrics,
  type TrainingGalleryMetrics,
} from "../utils/trainingMetrics";

interface TrainingGalleryProps {
  open: boolean;
  onClose: () => void;
}

function formatStreakDays(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

export function TrainingGallery({ open, onClose }: TrainingGalleryProps) {
  const [metrics, setMetrics] = useState<TrainingGalleryMetrics>(() =>
    defaultTrainingGalleryMetrics()
  );
  const [loading, setLoading] = useState(false);
  const [fetchErr, setFetchErr] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchErr(false);
    try {
      const next = await fetchTrainingGalleryMetrics();
      if (next) {
        setMetrics(next);
      } else {
        setFetchErr(true);
        setMetrics(defaultTrainingGalleryMetrics());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    void load();
  }, [open, load]);

  useEffect(() => {
    const onInv = () => {
      if (!open) {
        return;
      }
      void load();
    };
    window.addEventListener(OASIS_TRAINING_METRICS_INVALIDATE, onInv);
    return () => window.removeEventListener(OASIS_TRAINING_METRICS_INVALIDATE, onInv);
  }, [open, load]);

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

        {fetchErr ? (
          <p className="training-gallery-fetch-err" role="status">
            Could not load training stats. Check your connection and try again.
          </p>
        ) : null}

        <div className="training-gallery-stats" aria-busy={loading}>
          <div className="training-stat-card">
            <span className="training-stat-label">Current streak</span>
            <strong className="training-stat-value">
              {loading ? "…" : formatStreakDays(metrics.currentStreakDays)}
            </strong>
          </div>
          <div className="training-stat-card">
            <span className="training-stat-label">Total trainings</span>
            <strong className="training-stat-value">
              {loading ? "…" : metrics.totalTrainings}
            </strong>
          </div>
          <div className="training-stat-card">
            <span className="training-stat-label">Bonus tokens earned</span>
            <strong className="training-stat-value">
              {loading ? "…" : metrics.totalBonusTokens.toLocaleString()}
            </strong>
          </div>
        </div>

        <p className="training-gallery-streak-note">
          Only qualifying trainings count (badges plus a detailed comment, same rules as
          bonus tokens). Streak uses consecutive UTC calendar days with at least one
          qualifying training per day.
        </p>

        <p className="training-gallery-footer-hint">
          Train the assistant from chat to earn bonus AI commands toward your daily
          allowance.
        </p>
      </div>
    </div>
  );
}
