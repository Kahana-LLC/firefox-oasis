import { h, Fragment } from 'preact';
import type { JSX } from 'preact';
import { createPortal } from 'preact/compat';
import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
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
  OASIS_AMPLIFIER_TRAINING_URL,
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
  inlineAutofocusTick?: number;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EARN_CHIP_DISMISSED_KEY = 'oasis_training_earn_chip_dismissed_v1';

function readEarnChipDismissed(): boolean {
  try {
    return window.localStorage.getItem(EARN_CHIP_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

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

const TRAINING_INFO_PANEL_ID = 'feedback-training-info-panel';

export function Feedback({
  messageId,
  userPrompt,
  assistantReply,
  onClose,
  onTrainingSubmitted,
  inlineAutofocusTick = 0,
}: FeedbackProps) {
  const oasisWindow = window as OasisWindow;
  const thumbUpRef = useRef<HTMLButtonElement>(null);
  const trainingInfoWrapRef = useRef<HTMLDivElement>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [sentiment, setSentiment] = useState<'up' | 'down' | null>(null);
  const [selectedBadges, setSelectedBadges] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [thanksInline, setThanksInline] = useState(false);
  const [showSubmitHint, setShowSubmitHint] = useState(false);
  const [detailFieldEngaged, setDetailFieldEngaged] = useState(false);
  const [trainingInfoOpen, setTrainingInfoOpen] = useState(false);
  const [earnChipDismissed, setEarnChipDismissed] = useState(readEarnChipDismissed);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setSentiment(null);
    setSelectedBadges([]);
    setComment('');
    setSubmitted(false);
    setShowSubmitHint(false);
    setDetailFieldEngaged(false);
    setTrainingInfoOpen(false);
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
        if (trainingInfoOpen) {
          setTrainingInfoOpen(false);
          return;
        }
        closeModal();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [modalOpen, trainingInfoOpen, closeModal]);

  useEffect(() => {
    if (!modalOpen || !trainingInfoOpen) {
      return;
    }
    function onDocMouseDown(ev: MouseEvent) {
      const el = trainingInfoWrapRef.current;
      if (el && !el.contains(ev.target as Node | null)) {
        setTrainingInfoOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [modalOpen, trainingInfoOpen]);

  useEffect(() => {
    if (!inlineAutofocusTick || modalOpen) {
      return;
    }
    requestAnimationFrame(() => {
      thumbUpRef.current?.focus();
    });
  }, [inlineAutofocusTick, modalOpen]);

  const dismissEarnChip = useCallback(() => {
    setEarnChipDismissed(true);
    try {
      window.localStorage.setItem(EARN_CHIP_DISMISSED_KEY, '1');
    } catch {
      void 0;
    }
  }, []);

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

  const openAmplifierTrainingDoc = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = OASIS_AMPLIFIER_TRAINING_URL;
    if (oasisWindow.assistantBridge?.openTab) {
      const opened = oasisWindow.assistantBridge.openTab(url);
      if (opened) {
        mpTrack('training_amplifier_doc_click', {});
        return;
      }
    }
    if (typeof oasisWindow.openWebLinkIn === 'function') {
      oasisWindow.openWebLinkIn(url, 'tab', {});
      mpTrack('training_amplifier_doc_click', {});
      return;
    }
    if (window.top && typeof (window.top as OasisWindow).openWebLinkIn === 'function') {
      (window.top as OasisWindow).openWebLinkIn!(url, 'tab', {});
      mpTrack('training_amplifier_doc_click', {});
      return;
    }
    window.open(url, '_blank');
    mpTrack('training_amplifier_doc_click', {});
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
          // Same defaults as removed checkboxes: include context, do not contact.
          badges: selectedBadges,
          comment: commentTrimmed,
          include_context: true,
          contact_me: false,
          sentiment: sentimentValue,
          user_prompt: userPrompt.trim() || null,
          assistant_reply: assistantReply,
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
    setDetailFieldEngaged(false);
    setTrainingInfoOpen(false);
    setModalOpen(true);
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
      oasisWindow.subscriptionService?.appendOptimisticTrainingBonus?.(
        FEEDBACK_BONUS_TOKENS
      );
      window.dispatchEvent(
        new CustomEvent('oasis-usage-update', {
          bubbles: true,
          detail: { immediate: true },
        })
      );
      void (async () => {
        try {
          await oasisWindow.subscriptionService?.forceRefresh?.();
        } catch {
          void 0;
        }
        window.dispatchEvent(new CustomEvent('oasis-usage-update'));
      })();
      window.setTimeout(() => {
        void (async () => {
          try {
            await oasisWindow.subscriptionService?.forceRefresh?.();
          } catch {
            void 0;
          }
          window.dispatchEvent(new CustomEvent('oasis-usage-update'));
        })();
      }, 400);
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
  const earnChipText = `Earn ${FEEDBACK_BONUS_TOKENS.toLocaleString()} tokens each time you train.`;
  const showInlineEarnChip = !earnChipDismissed && !modalOpen;
  const trimmedCommentLen = comment.trim().length;
  const stepCategoriesDone = selectedBadges.length >= 1;
  const stepDetailsEngaged = detailFieldEngaged;
  const stepReadyDone = trimmedCommentLen >= FEEDBACK_MIN_DETAIL_CHARS;
  const completedTrainingSteps =
    (stepCategoriesDone ? 1 : 0) +
    (stepDetailsEngaged ? 1 : 0) +
    (stepReadyDone ? 1 : 0);
  const charMeterPct = Math.min(
    100,
    (trimmedCommentLen / FEEDBACK_MIN_DETAIL_CHARS) * 100
  );
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
              <div className="feedback-dialog-header-block" ref={trainingInfoWrapRef}>
                <div className="feedback-header">
                  <span id="feedback-dialog-title">
                    {sentiment === 'up' ? 'Train on a good answer' : 'Train on a miss'}
                  </span>
                  <div className="feedback-header-trailing">
                    <div className="feedback-training-info-anchor">
                      <button
                        type="button"
                        className="feedback-training-info-btn"
                        aria-expanded={trainingInfoOpen}
                        aria-controls={TRAINING_INFO_PANEL_ID}
                        aria-label="Why training and bonus tokens"
                        onClick={() => setTrainingInfoOpen(o => !o)}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 16v-4M12 8h.01" />
                        </svg>
                      </button>
                    </div>
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
                </div>
                {trainingInfoOpen ? (
                  <div
                    id={TRAINING_INFO_PANEL_ID}
                    className="feedback-training-info-popover"
                    role="region"
                    aria-label="Training overview"
                    onMouseDown={(e: JSX.TargetedMouseEvent<HTMLDivElement>) =>
                      e.stopPropagation()
                    }
                  >
                    <p className="feedback-training-info-popover__p">
                      {sentiment === 'up'
                        ? 'Your input helps Oasis respond faster and more accurately over time.'
                        : 'Showing us what missed the mark teaches the assistant to do better next time.'}
                    </p>
                    <p className="feedback-training-info-popover__p">
                      Each qualifying training submission earns +
                      {FEEDBACK_BONUS_TOKENS.toLocaleString()} bonus tokens for today (UTC). Unused
                      bonus allowance does not roll over.
                    </p>
                    <button
                      type="button"
                      className="feedback-pricing-link"
                      onClick={openPricingPage}
                    >
                      View plans and limits
                    </button>
                  </div>
                ) : null}
                <div
                  className="feedback-training-timeline"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={3}
                  aria-valuenow={completedTrainingSteps}
                  aria-label="Training form completion: categories, details field, and minimum length."
                >
                  <ol className="feedback-training-timeline__list">
                    <li
                      className={`feedback-training-timeline__item${stepCategoriesDone ? ' feedback-training-timeline__item--done' : ''}`}
                    >
                      <span className="feedback-training-timeline__dot" aria-hidden />
                      <span className="feedback-training-timeline__label">Categories</span>
                    </li>
                    <li
                      className={`feedback-training-timeline__item${stepDetailsEngaged ? ' feedback-training-timeline__item--done' : ''}`}
                    >
                      <span className="feedback-training-timeline__dot" aria-hidden />
                      <span className="feedback-training-timeline__label">Details</span>
                    </li>
                    <li
                      className={`feedback-training-timeline__item${stepReadyDone ? ' feedback-training-timeline__item--done' : ''}`}
                    >
                      <span className="feedback-training-timeline__dot" aria-hidden />
                      <span className="feedback-training-timeline__label">Ready</span>
                    </li>
                  </ol>
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
                                width="8"
                                height="8"
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
                                width="8"
                                height="8"
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

                <div className="feedback-detail-field">
                  <label
                    className="feedback-detail-field__label"
                    htmlFor="feedback-training-detail"
                  >
                    Details (required)
                  </label>
                  <textarea
                    id="feedback-training-detail"
                    className="feedback-textarea"
                    placeholder={
                      sentiment === 'up'
                        ? 'What stood out, and what could be even better?'
                        : 'What went wrong, and what would a better answer look like?'
                    }
                    value={comment}
                    aria-describedby="feedback-training-char-status"
                    onFocus={() => setDetailFieldEngaged(true)}
                    onInput={(e: JSX.TargetedEvent<HTMLTextAreaElement>) => {
                      setComment(e.currentTarget.value);
                      setShowSubmitHint(false);
                    }}
                  />
                  <div id="feedback-training-char-status" aria-live="polite">
                    <div className="feedback-char-meter__track">
                      <div
                        className="feedback-char-meter__fill"
                        style={{ width: `${charMeterPct}%` }}
                      />
                    </div>
                    <p className="feedback-char-meter__text">
                      {trimmedCommentLen} / {FEEDBACK_MIN_DETAIL_CHARS} characters
                    </p>
                  </div>
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
        <div className="feedback-train-hover-zone">
          <div className="feedback-train-row" role="presentation">
            <div className="feedback-train-label-pill">
              <span className="feedback-train-label">Train</span>
            </div>
            <div className="feedback-train-hover-group feedback-train-badge">
              <div className="feedback-train-actions">
                <button
                  type="button"
                  className="feedback-training-learn-btn"
                  onClick={openAmplifierTrainingDoc}
                  aria-label="Learn more about training (opens in a new tab)"
                  title="Learn more about training"
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
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <path d="M12 17h.01" />
                  </svg>
                </button>
                <button
                  type="button"
                  ref={thumbUpRef}
                  className="feedback-btn thumbs-up"
                  onClick={() => openModal('up')}
                  disabled={isSubmitting}
                  title={`Train on a good answer — earn up to ${FEEDBACK_BONUS_TOKENS.toLocaleString()} bonus tokens`}
                  aria-label="Mark as helpful for training"
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
                    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="feedback-btn thumbs-down"
                  onClick={() => openModal('down')}
                  disabled={isSubmitting}
                  title={`Train on a miss — earn up to ${FEEDBACK_BONUS_TOKENS.toLocaleString()} bonus tokens`}
                  aria-label="Mark as not helpful for training"
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
                    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zM17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          {showInlineEarnChip ? (
            <div
              className="training-hint-bubble training-hint-bubble--promo"
              role="note"
              aria-live="polite"
            >
              <span>
                Earn{' '}
                <strong className="training-hint-bubble__amount">
                  {FEEDBACK_BONUS_TOKENS.toLocaleString()}
                </strong>{' '}
                tokens each time you train.
              </span>
              <button
                type="button"
                className="training-hint-close"
                aria-label="Dismiss"
                onClick={dismissEarnChip}
              >
                ×
              </button>
            </div>
          ) : null}
          {earnChipDismissed ? (
            <span className="feedback-train-earn-hover-hint" aria-hidden="true">
              {earnChipText}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
