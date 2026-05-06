import { h, Fragment } from 'preact';
import type { JSX } from 'preact';
import { createPortal } from 'preact/compat';
import { useState, useEffect, useCallback } from 'preact/hooks';
import type { OasisWindow } from '../types';
import { playTrainingConfetti } from '../utils/confetti';
import {
  recordTrainingSubmission,
  type TrainingBadgeUnlock,
  type TrainingProgress,
} from '../utils/trainingProgress';
import {
  FEEDBACK_BONUS_TOKENS,
  FEEDBACK_MIN_DETAIL_CHARS,
  OASIS_PRICING_URL,
} from '../utils/trainingRewards';

export interface TrainingSubmittedPayload {
  messageId: string;
  sentiment: 'up' | 'down';
  progress: TrainingProgress;
  unlockedBadges: TrainingBadgeUnlock[];
}

interface FeedbackProps {
  messageId: string;
  userPrompt: string;
  assistantReply: string;
  onClose?: () => void;
  /** When backend returns token grants, extend payload and show toast / bonus confetti here. */
  onTrainingSubmitted?: (payload: TrainingSubmittedPayload) => void;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRAINING_HINT_SEEN_KEY = 'oasis_training_hint_seen_count';
const TRAINING_HINT_EXPOSURE_LIMIT = 3;

function isUuidString(value: string): boolean {
  return UUID_RE.test(String(value || '').trim());
}

const BADGES_POSITIVE = [
  'Accurate',
  'Helpful',
  'Fast',
  'Clear',
  'Creative',
  'Complete',
  'Other',
];

const BADGES_NEGATIVE = [
  "Didn't work",
  'Wrong result',
  'Too slow',
  'Safety concern',
  'Confusing',
  'Suggestion',
  'Other',
];

export function Feedback({
  messageId,
  userPrompt,
  assistantReply,
  onClose,
  onTrainingSubmitted,
}: FeedbackProps) {
  const oasisWindow = window as OasisWindow;
  const [modalOpen, setModalOpen] = useState(false);
  const [sentiment, setSentiment] = useState<'up' | 'down' | null>(null);
  const [selectedBadges, setSelectedBadges] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [includeContext, setIncludeContext] = useState(true);
  const [contactMe, setContactMe] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [thanksInline, setThanksInline] = useState(false);
  const [showSubmitHint, setShowSubmitHint] = useState(false);
  const [trainingHintSeenCount, setTrainingHintSeenCount] = useState(0);
  const [trainingHintDismissed, setTrainingHintDismissed] = useState(false);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setSentiment(null);
    setSelectedBadges([]);
    setComment('');
    setSubmitted(false);
    setShowSubmitHint(false);
  }, []);

  useEffect(() => {
    if (!modalOpen) {
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [modalOpen, closeModal]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TRAINING_HINT_SEEN_KEY);
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 0) {
        setTrainingHintSeenCount(Math.min(parsed, TRAINING_HINT_EXPOSURE_LIMIT));
      }
    } catch {
      // Ignore localStorage read failures.
    }
  }, []);

  const persistTrainingHintSeenCount = (count: number) => {
    const next = Math.min(Math.max(count, 0), TRAINING_HINT_EXPOSURE_LIMIT);
    setTrainingHintSeenCount(next);
    try {
      window.localStorage.setItem(TRAINING_HINT_SEEN_KEY, String(next));
    } catch {
      // Ignore localStorage write failures.
    }
  };

  const toggleBadge = (badge: string) => {
    setSelectedBadges(prev =>
      prev.includes(badge) ? prev.filter(b => b !== badge) : [...prev, badge]
    );
    setShowSubmitHint(false);
  };

  const mpTrack = (event: string, props: Record<string, unknown> = {}) => {
    if (oasisWindow.mpTrack) {
      oasisWindow.mpTrack(event, props);
    }
  };

  const openPricingPage = () => {
    if (typeof oasisWindow.openWebLinkIn === 'function') {
      oasisWindow.openWebLinkIn(OASIS_PRICING_URL, 'tab', {});
      return;
    }
    if (window.top && typeof (window.top as OasisWindow).openWebLinkIn === 'function') {
      (window.top as OasisWindow).openWebLinkIn!(OASIS_PRICING_URL, 'tab', {});
      return;
    }
    window.open(OASIS_PRICING_URL, '_blank');
  };

  const showFeedbackMessage = (message: string, isError = false) => {
    if (isError) {
      console.error(`[Feedback] ${message}`);
    }
  };

  const submitToSupabase = async (
    isNegative: boolean,
    category: string,
    commentTrimmed: string,
    sentimentValue: 'up' | 'down'
  ) => {
    const supabase = oasisWindow.supabaseAuth?.supabase;
    const sessionId = oasisWindow.supabaseAuth?.currentSession?.session_id || null;

    if (!supabase) {
      showFeedbackMessage('Training could not be saved (service unavailable).', true);
      return false;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        showFeedbackMessage('Please sign in to save training.', true);
        return false;
      }

      const payload: Record<string, unknown> = {
        user_id: user.id,
        session_id: sessionId,
        reported_at: new Date().toISOString(),
        negative_rating: isNegative,
        category,
        additional_info: {
          badges: selectedBadges,
          comment: commentTrimmed,
          include_context: includeContext,
          contact_me: contactMe,
          sentiment: sentimentValue,
          user_prompt: includeContext ? userPrompt.trim() || null : null,
          assistant_reply: includeContext ? assistantReply : null,
          ...(isUuidString(messageId) ? {} : { client_message_id: messageId }),
        },
      };
      payload.message_id = isUuidString(messageId) ? messageId : null;

      const { error } = await supabase.from('feedback_events').insert(payload);
      if (error) {
        console.error('Feedback insert failed:', error);
        mpTrack('feedback_submit_error', { message: error.message || String(error) });
        showFeedbackMessage('Training could not be saved. Please try again.', true);
        return false;
      }

      mpTrack('feedback_submit_success', { negative_rating: isNegative, category });
      return true;
    } catch (err) {
      console.error('Feedback submission exception:', err);
      return false;
    }
  };

  const openModal = (next: 'up' | 'down') => {
    setSentiment(next);
    setSelectedBadges([]);
    setComment('');
    setSubmitted(false);
    setShowSubmitHint(false);
    setModalOpen(true);
    if (trainingHintSeenCount < TRAINING_HINT_EXPOSURE_LIMIT) {
      persistTrainingHintSeenCount(trainingHintSeenCount + 1);
    }
    setTrainingHintDismissed(true);
    if (next === 'up') {
      mpTrack('feedback_thumb_up', { messageId });
    } else {
      mpTrack('feedback_thumb_down', { messageId });
    }
  };

  const handleModalSubmit = async () => {
    if (!sentiment) {
      return;
    }
    if (selectedBadges.length < 1 || comment.trim().length < FEEDBACK_MIN_DETAIL_CHARS) {
      return;
    }

    setIsSubmitting(true);
    const commentTrimmed = comment.trim();
    let category = 'Helpful';
    if (sentiment === 'down') {
      category = selectedBadges.length > 0 ? selectedBadges[0] : 'Other';
    } else if (selectedBadges.length > 0) {
      category = selectedBadges[0];
    }

    const success = await submitToSupabase(
      sentiment === 'down',
      category,
      commentTrimmed,
      sentiment
    );

    if (success) {
      const progressUpdate = recordTrainingSubmission(new Date());
      playTrainingConfetti();
      mpTrack('training_progress_updated', {
        total_submissions: progressUpdate.progress.totalSubmissions,
        current_streak_days: progressUpdate.progress.currentStreakDays,
        longest_streak_days: progressUpdate.progress.longestStreakDays,
        unlocked_count: progressUpdate.unlockedBadges.length,
      });
      for (const unlock of progressUpdate.unlockedBadges) {
        mpTrack('training_badge_unlocked', {
          badge_id: unlock.id,
          level: unlock.toLevel,
          threshold: unlock.threshold,
        });
      }
      onTrainingSubmitted?.({
        messageId,
        sentiment,
        progress: progressUpdate.progress,
        unlockedBadges: progressUpdate.unlockedBadges,
      });
      void oasisWindow.subscriptionService?.forceRefresh?.();
      window.dispatchEvent(new CustomEvent('oasis-usage-update'));
      setSubmitted(true);
      setTimeout(() => {
        if (onClose) {
          onClose();
        }
        closeModal();
        setThanksInline(true);
        setTimeout(() => setThanksInline(false), 3200);
      }, 2000);
    }
    setIsSubmitting(false);
  };

  const userDisplay = userPrompt.trim() || 'Not available';
  const showTrainingHint =
    !trainingHintDismissed && trainingHintSeenCount < TRAINING_HINT_EXPOSURE_LIMIT;
  const submitDisabled =
    isSubmitting ||
    selectedBadges.length < 1 ||
    comment.trim().length < FEEDBACK_MIN_DETAIL_CHARS;

  const onSubmitClick = () => {
    if (isSubmitting) {
      return;
    }
    if (submitDisabled) {
      setShowSubmitHint(true);
      return;
    }
    void handleModalSubmit();
  };

  const overlay =
    modalOpen &&
    createPortal(
      <div
        className="feedback-overlay"
        role="presentation"
        onMouseDown={(e: JSX.TargetedMouseEvent<HTMLDivElement>) => {
          if (e.target === e.currentTarget) {
            closeModal();
          }
        }}
      >
        <div
          className="feedback-overlay-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-dialog-title"
          onMouseDown={(e: JSX.TargetedMouseEvent<HTMLDivElement>) => e.stopPropagation()}
        >
          {submitted ? (
            <div className="feedback-overlay-thanks">
              <p className="feedback-overlay-thanks-text">Thanks — your training was saved!</p>
              <p className="feedback-overlay-thanks-bonus">
                +{FEEDBACK_BONUS_TOKENS.toLocaleString()} bonus tokens have been added to your daily
                token allowance (UTC day).
              </p>
              <button type="button" className="feedback-pricing-link" onClick={openPricingPage}>
                View plans and limits
              </button>
            </div>
          ) : (
            <Fragment>
              <div className="feedback-dialog-header-block">
                <div className="feedback-header">
                  <span id="feedback-dialog-title">
                    {sentiment === 'up' ? 'Train on a good answer' : 'Train on a miss'}
                  </span>
                  <button
                    type="button"
                    className="feedback-close-btn"
                    aria-label="Close"
                    onClick={closeModal}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                <p className="feedback-intro">
                  {sentiment === 'up'
                    ? 'Your input helps Oasis respond faster and more accurately over time.'
                    : 'Showing us what missed the mark teaches the assistant to do better next time.'}
                </p>
                <div className="feedback-training-reward">
                  <span>
                    Each qualifying training submission earns +{FEEDBACK_BONUS_TOKENS.toLocaleString()}{' '}
                    bonus tokens for today (UTC). Unused bonus allowance does not roll over.
                  </span>
                  <button type="button" className="feedback-pricing-link" onClick={openPricingPage}>
                    View plans and limits
                  </button>
                </div>
              </div>

              <div className="feedback-dialog-scroll">
                <div className="feedback-context-card">
                  <div className="feedback-context-section">
                    <div className="feedback-context-label">Your message</div>
                    <pre className="feedback-context-block">{userDisplay}</pre>
                  </div>
                  <div className="feedback-context-section">
                    <div className="feedback-context-label">Assistant reply</div>
                    <pre className="feedback-context-block">{assistantReply}</pre>
                  </div>
                </div>

                {sentiment === 'down' ? (
                  <Fragment>
                    <p className="feedback-badges-lead" id="feedback-badges-label-down">
                      What went wrong? (choose one or more)
                    </p>
                    <div
                      className="feedback-badges"
                      role="group"
                      aria-labelledby="feedback-badges-label-down"
                    >
                      {BADGES_NEGATIVE.map(badge => (
                        <button
                          key={badge}
                          type="button"
                          className={`feedback-badge ${selectedBadges.includes(badge) ? 'selected' : ''}`}
                          onClick={() => toggleBadge(badge)}
                        >
                          {badge}
                          {selectedBadges.includes(badge) && (
                            <span className="badge-remove">
                              <svg
                                width="10"
                                height="10"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden
                              >
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </Fragment>
                ) : (
                  <Fragment>
                    <p className="feedback-badges-lead" id="feedback-badges-label-up">
                      What stood out?
                    </p>
                    <div className="feedback-badges" role="group" aria-labelledby="feedback-badges-label-up">
                      {BADGES_POSITIVE.map(badge => (
                        <button
                          key={badge}
                          type="button"
                          className={`feedback-badge ${selectedBadges.includes(badge) ? 'selected' : ''}`}
                          onClick={() => toggleBadge(badge)}
                        >
                          {badge}
                          {selectedBadges.includes(badge) && (
                            <span className="badge-remove">
                              <svg
                                width="10"
                                height="10"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden
                              >
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </Fragment>
                )}

                <div className="feedback-input-container">
                  <textarea
                    className="feedback-textarea"
                    placeholder={
                      sentiment === 'up'
                        ? 'What worked well, what could be even better? (required, min. ' +
                          FEEDBACK_MIN_DETAIL_CHARS +
                          ' characters)'
                        : 'What did you expect, or how could this answer be better? (required)'
                    }
                    value={comment}
                    onInput={(e: JSX.TargetedEvent<HTMLTextAreaElement>) => {
                      setComment(e.currentTarget.value);
                      setShowSubmitHint(false);
                    }}
                  />
                </div>

                <div
                  className="feedback-validation-slot"
                  aria-live="polite"
                  aria-relevant="additions text"
                >
                  {showSubmitHint ? (
                    <p className="feedback-validation-hint">
                      Choose at least one category and write at least {FEEDBACK_MIN_DETAIL_CHARS}{' '}
                      characters about what you expected or what could be better.
                    </p>
                  ) : null}
                </div>

                <div className="feedback-checkboxes">
                  <label className="feedback-checkbox-label">
                    <input
                      type="checkbox"
                      checked={includeContext}
                      onChange={() => setIncludeContext(!includeContext)}
                    />
                    <span>Include this exchange in training data</span>
                  </label>
                  <label className="feedback-checkbox-label">
                    <input
                      type="checkbox"
                      checked={contactMe}
                      onChange={() => setContactMe(!contactMe)}
                    />
                    <span>Contact me if this needs a quick follow-up</span>
                  </label>
                </div>
              </div>

              <div className="feedback-footer">
                <button
                  type="button"
                  className={`feedback-submit-btn ${submitDisabled ? 'feedback-submit-btn--muted' : ''}`}
                  onClick={onSubmitClick}
                  aria-busy={isSubmitting}
                >
                  {isSubmitting ? 'Saving…' : 'Submit training'}
                </button>
              </div>
            </Fragment>
          )}
        </div>
      </div>,
      document.body
    );

  if (thanksInline) {
    return (
      <div className="feedback-container">
        <div className="feedback-submitted">
          <span className="feedback-submitted-line">Thanks — your training was saved!</span>
          <span className="feedback-submitted-bonus">
            +{FEEDBACK_BONUS_TOKENS.toLocaleString()} bonus tokens added to your daily allowance (UTC).
          </span>
          <button type="button" className="feedback-pricing-link" onClick={openPricingPage}>
            View plans and limits
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="feedback-container">
      {overlay}
      <div className="feedback-options">
        <div className="feedback-train-badge" role="presentation">
          <span className="feedback-train-label">Train</span>
          <button
            type="button"
            className="feedback-btn thumbs-up"
            onClick={() => openModal('up')}
            disabled={isSubmitting}
            title="Train on a good answer"
            aria-label="Mark as helpful for training"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
            </svg>
          </button>
          <button
            type="button"
            className="feedback-btn thumbs-down"
            onClick={() => openModal('down')}
            disabled={isSubmitting}
            title="Train on a miss"
            aria-label="Mark as not helpful for training"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zM17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
            </svg>
          </button>
        </div>
        {showTrainingHint ? (
          <div className="training-hint-bubble" role="note" aria-live="polite">
            <span>Train Oasis with a quick thumbs vote.</span>
            <button
              type="button"
              className="training-hint-close"
              aria-label="Dismiss training hint"
              onClick={() => {
                setTrainingHintDismissed(true);
                persistTrainingHintSeenCount(TRAINING_HINT_EXPOSURE_LIMIT);
              }}
            >
              ×
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
