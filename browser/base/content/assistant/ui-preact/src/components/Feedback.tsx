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
  OASIS_TRAINING_DOCS_URL,
} from '../utils/trainingRewards';
import type { TrainingMode } from '../utils/trainingMode';
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
  interactionId?: string;
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

const TRAINING_WIZARD_STEPS = 3;
const WIZARD_STEP_TITLES = [
  'Choose categories',
  'Add your own words',
  'Choose privacy mode',
] as const;

type WizardStep = 1 | 2 | 3;

export function Feedback({
  messageId,
  userPrompt,
  assistantReply,
  interactionId,
  onClose,
  onTrainingSubmitted,
  inlineAutofocusTick = 0,
}: FeedbackProps) {
  const oasisWindow = window as OasisWindow;
  const thumbUpRef = useRef<HTMLButtonElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [sentiment, setSentiment] = useState<'up' | 'down' | null>(null);
  const [selectedBadges, setSelectedBadges] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [thanksInline, setThanksInline] = useState(false);
  const [showSubmitHint, setShowSubmitHint] = useState(false);
  const [earnChipDismissed, setEarnChipDismissed] = useState(readEarnChipDismissed);
  const [trainingMode, setTrainingMode] = useState<TrainingMode>('personalized');
  const [thanksTrainingMode, setThanksTrainingMode] = useState<TrainingMode | null>(
    null
  );
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [wizardSlideDirection, setWizardSlideDirection] = useState<'forward' | 'back'>(
    'forward'
  );
  const [wizardStepHint, setWizardStepHint] = useState(false);
  const [detailsFieldFocused, setDetailsFieldFocused] = useState(false);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setSentiment(null);
    setSelectedBadges([]);
    setComment('');
    setSubmitted(false);
    setShowSubmitHint(false);
    setWizardStepHint(false);
    setDetailsFieldFocused(false);
    setTrainingMode('personalized');
    setWizardStep(1);
    setWizardSlideDirection('forward');
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
    setWizardStepHint(false);
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

  const openTrainingDocsPage = () => {
    const url = OASIS_TRAINING_DOCS_URL;
    if (oasisWindow.assistantBridge?.openTab) {
      const opened = oasisWindow.assistantBridge.openTab(url);
      if (opened) {
        mpTrack('training_docs_click', {});
        return;
      }
    }
    if (typeof oasisWindow.openWebLinkIn === 'function') {
      oasisWindow.openWebLinkIn(url, 'tab', {});
      mpTrack('training_docs_click', {});
      return;
    }
    if (window.top && typeof (window.top as OasisWindow).openWebLinkIn === 'function') {
      (window.top as OasisWindow).openWebLinkIn!(url, 'tab', {});
      mpTrack('training_docs_click', {});
      return;
    }
    window.open(url, '_blank');
    mpTrack('training_docs_click', {});
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
    sentimentValue: 'up' | 'down',
    mode: TrainingMode
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

      const isPersonalized = mode === 'personalized';
      const payload: Record<string, unknown> = {
        user_id: isPersonalized ? user.id : null,
        session_id: isPersonalized ? sessionId : null,
        training_mode: mode,
        reported_at: new Date().toISOString(),
        negative_rating: isNegative,
        category,
        interaction_id: interactionId ?? null,
        additional_info: {
          badges: selectedBadges,
          comment: commentTrimmed,
          include_context: true,
          contact_me: false,
          sentiment: sentimentValue,
          training_mode: mode,
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

      if (interactionId) {
        const feedbackBlock = {
          rating: sentimentValue === 'up' ? 'positive' : 'negative',
          thumbs_up: !isNegative,
          thumbs_down: isNegative,
          badges: selectedBadges,
          reason_free_text: commentTrimmed || null,
          feedback_source: 'user',
          feedback_timestamp: new Date().toISOString(),
        };
        supabase.rpc('attach_feedback_to_interaction', {
          p_interaction_id: interactionId,
          p_feedback: feedbackBlock,
        }).then(({ error: rpcErr }: { error: { message?: string } | null }) => {
          if (rpcErr) {
            console.error('attach_feedback_to_interaction failed:', rpcErr);
          }
        });
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
    setWizardStepHint(false);
    setTrainingMode('personalized');
    setWizardStep(1);
    setWizardSlideDirection('forward');
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
      sentiment,
      trainingMode
    );

    if (success) {
      setThanksTrainingMode(trainingMode);
      const progressUpdate = recordTrainingSubmission(new Date());
      playTrainingConfetti();
      mpTrack('training_progress_updated', {
        total_submissions: progressUpdate.progress.totalSubmissions,
        current_streak_days: progressUpdate.progress.currentStreakDays,
        longest_streak_days: progressUpdate.progress.longestStreakDays,
        unlocked_count: progressUpdate.unlockedBadges.length,
        training_mode: trainingMode,
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
      const dispatchUsageSnapshot = () => {
        window.dispatchEvent(
          new CustomEvent('oasis-usage-update', {
            bubbles: true,
            detail: { immediate: true },
          })
        );
      };
      void (async () => {
        try {
          await oasisWindow.subscriptionService?.forceRefresh?.();
        } catch {
          void 0;
        }
        dispatchUsageSnapshot();
      })();
      setSubmitted(true);
      setTimeout(() => {
        if (onClose) {
          onClose();
        }
        closeModal();
        setThanksInline(true);
        setTimeout(() => {
          setThanksInline(false);
          setThanksTrainingMode(null);
        }, 3200);
      }, 2000);
    }
    setIsSubmitting(false);
  };

  const userDisplay = userPrompt.trim() || 'Not available';
  const earnChipText = `Earn ${FEEDBACK_BONUS_TOKENS.toLocaleString()} tokens each time you train.`;
  const showInlineEarnChip = !earnChipDismissed && !modalOpen;
  const trimmedCommentLen = comment.trim().length;
  const charMeterPct = Math.min(
    100,
    (trimmedCommentLen / FEEDBACK_MIN_DETAIL_CHARS) * 100
  );
  const submitDisabled =
    isSubmitting ||
    selectedBadges.length < 1 ||
    comment.trim().length < FEEDBACK_MIN_DETAIL_CHARS;

  const isStepComplete = useCallback(
    (step: WizardStep): boolean => {
      if (step === 1) {
        return selectedBadges.length >= 1;
      }
      if (step === 2) {
        return comment.trim().length >= FEEDBACK_MIN_DETAIL_CHARS;
      }
      return true;
    },
    [selectedBadges.length, comment]
  );

  const currentStepComplete = isStepComplete(wizardStep);
  const showDetailsInvite =
    wizardStep === 2 &&
    trimmedCommentLen < FEEDBACK_MIN_DETAIL_CHARS &&
    !detailsFieldFocused;
  const progressPercent = Math.round(
    ((wizardStep - 1) + (currentStepComplete ? 1 : 0)) / TRAINING_WIZARD_STEPS * 100
  );

  const goBack = useCallback(() => {
    setWizardStepHint(false);
    setWizardSlideDirection('back');
    setWizardStep(s => {
      if (s <= 1) {
        return 1;
      }
      mpTrack('training_wizard_back', { from_step: s });
      return (s - 1) as WizardStep;
    });
  }, []);

  const goForward = useCallback(() => {
    setWizardStepHint(false);
    setWizardSlideDirection('forward');
    setWizardStep(s => {
      if (s >= TRAINING_WIZARD_STEPS || !isStepComplete(s)) {
        return s;
      }
      mpTrack('training_wizard_continue', { from_step: s });
      return (s + 1) as WizardStep;
    });
  }, [isStepComplete]);

  const wizardTrackOffsetPct = ((wizardStep - 1) / TRAINING_WIZARD_STEPS) * 100;

  useEffect(() => {
    if (!modalOpen || submitted) {
      return;
    }
    mpTrack('training_wizard_step_view', {
      step: wizardStep,
      sentiment: sentiment ?? undefined,
    });
    requestAnimationFrame(() => {
      stepHeadingRef.current?.focus();
    });
  }, [wizardStep, modalOpen, submitted, sentiment]);

  const onContinueClick = () => {
    if (!currentStepComplete) {
      setWizardStepHint(true);
      return;
    }
    goForward();
  };

  const wizardStepHintMessage =
    wizardStep === 1
      ? 'Choose at least one category to continue.'
      : wizardStep === 2
        ? `Write at least ${FEEDBACK_MIN_DETAIL_CHARS} characters to continue.`
        : null;

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
          aria-describedby="feedback-wizard-progress-label"
          onMouseDown={(e: JSX.TargetedMouseEvent<HTMLDivElement>) => e.stopPropagation()}
        >
          {submitted ? (
            <div className="feedback-overlay-thanks">
              <p className="feedback-overlay-thanks-text">Thanks — your training was saved!</p>
              <p className="feedback-overlay-thanks-bonus">
                +{FEEDBACK_BONUS_TOKENS.toLocaleString()} bonus tokens have been added to your
                daily token allowance (UTC day).
              </p>
              <button type="button" className="feedback-pricing-link" onClick={openPricingPage}>
                View plans and limits
              </button>
            </div>
          ) : (
            <Fragment>
              <div className="feedback-dialog-header-block">
                <div className="feedback-header">
                  <div className="feedback-header__title-block">
                    <span id="feedback-dialog-title">
                      {sentiment === 'up' ? 'Train on a good answer' : 'Train on a miss'}
                    </span>
                  </div>
                  <div className="feedback-header-trailing">
                    <span
                      className="feedback-token-chip-wrap"
                      role="status"
                      aria-label={`Earn ${FEEDBACK_BONUS_TOKENS.toLocaleString()} more tokens today when you submit qualifying training`}
                    >
                      <span className="feedback-token-chip">
                        +{FEEDBACK_BONUS_TOKENS.toLocaleString()} more tokens today
                      </span>
                    </span>
                    <div className="feedback-training-info-anchor">
                      <button
                        type="button"
                        className="feedback-training-info-btn"
                        aria-label="Learn more about training"
                        onClick={openTrainingDocsPage}
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
              </div>

              <div className="feedback-wizard-scroll feedback-dialog-scroll">
              <div
                className="feedback-wizard-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent}
                aria-labelledby="feedback-wizard-progress-label"
              >
                <div className="feedback-wizard-progress__header">
                  <div className="feedback-wizard-progress__ring" aria-hidden="true">
                    <svg className="feedback-wizard-progress__svg" viewBox="0 0 40 40">
                      <circle
                        className="feedback-wizard-progress__ring-bg"
                        cx="20"
                        cy="20"
                        r="16"
                        fill="none"
                      />
                      <circle
                        className="feedback-wizard-progress__ring-fill"
                        cx="20"
                        cy="20"
                        r="16"
                        fill="none"
                        pathLength="100"
                        strokeDasharray={`${progressPercent} 100`}
                        transform="rotate(-90 20 20)"
                      />
                    </svg>
                    <span className="feedback-wizard-progress__ring-center">
                      {wizardStep}
                      <span className="feedback-wizard-progress__ring-of">/{TRAINING_WIZARD_STEPS}</span>
                    </span>
                  </div>
                  <div className="feedback-wizard-progress__copy">
                    <p
                      id="feedback-wizard-progress-label"
                      className="feedback-wizard-progress__label"
                      aria-live="polite"
                    >
                      Step {wizardStep} of {TRAINING_WIZARD_STEPS}:{' '}
                      {WIZARD_STEP_TITLES[wizardStep - 1]}
                    </p>
                    <ol className="feedback-wizard-stepper" aria-label="Training steps">
                      {WIZARD_STEP_TITLES.map((title, index) => {
                        const stepNum = (index + 1) as WizardStep;
                        const state =
                          stepNum < wizardStep
                            ? 'complete'
                            : stepNum === wizardStep
                              ? 'current'
                              : 'upcoming';
                        return (
                          <li
                            key={title}
                            className={`feedback-wizard-stepper__item feedback-wizard-stepper__item--${state}`}
                          >
                            <span className="feedback-wizard-stepper__marker" aria-hidden="true" />
                            <span className="feedback-wizard-stepper__text">{title}</span>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                </div>
              </div>

              <div className="feedback-wizard-context" aria-label="This exchange">
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
              </div>

              <div className="feedback-wizard-step-area">
                <div
                  className="feedback-wizard-step-viewport"
                  key={wizardStep}
                  data-direction={wizardSlideDirection}
                >
                  <div
                    className="feedback-wizard-step-track"
                    style={{
                      transform: `translate3d(-${wizardTrackOffsetPct}%, 0, 0)`,
                    }}
                    data-direction={wizardSlideDirection}
                  >
                    <div
                      className="feedback-wizard-step-pane"
                      aria-hidden={wizardStep !== 1}
                      {...(wizardStep !== 1 ? { inert: true } : {})}
                    >
                      <div className="feedback-wizard-step-panel">
                        <div className="feedback-wizard-step__body">
                        <h3
                          ref={wizardStep === 1 ? stepHeadingRef : undefined}
                          id="feedback-wizard-step-heading-1"
                          className="feedback-wizard-step__title"
                          tabIndex={-1}
                        >
                          Choose one or more
                        </h3>
                        <p className="feedback-wizard-step__subtitle">
                          {sentiment === 'down'
                            ? 'What went wrong with this answer?'
                            : 'What stood out about this answer?'}
                        </p>
                        {sentiment === 'down' ? (
                          <div
                            className="feedback-badges"
                            role="group"
                            aria-labelledby="feedback-wizard-step-heading-1"
                          >
                            {BADGES_NEGATIVE.map(badge => (
                              <button
                                key={badge}
                                type="button"
                                className={`feedback-badge ${selectedBadges.includes(badge) ? 'selected' : ''}`}
                                tabIndex={wizardStep === 1 ? 0 : -1}
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
                        ) : (
                          <div
                            className="feedback-badges"
                            role="group"
                            aria-labelledby="feedback-wizard-step-heading-1"
                          >
                            {BADGES_POSITIVE.map(badge => (
                              <button
                                key={badge}
                                type="button"
                                className={`feedback-badge ${selectedBadges.includes(badge) ? 'selected' : ''}`}
                                tabIndex={wizardStep === 1 ? 0 : -1}
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
                        )}
                        </div>
                      </div>
                    </div>

                    <div
                      className="feedback-wizard-step-pane"
                      aria-hidden={wizardStep !== 2}
                      {...(wizardStep !== 2 ? { inert: true } : {})}
                    >
                      <div className="feedback-wizard-step-panel">
                        <div className="feedback-wizard-step__body">
                        <h3
                          ref={wizardStep === 2 ? stepHeadingRef : undefined}
                          id="feedback-wizard-step-heading-2"
                          className="feedback-wizard-step__title"
                          tabIndex={-1}
                        >
                          Add your own words
                        </h3>
                        <p className="feedback-wizard-step__subtitle">
                          Share at least {FEEDBACK_MIN_DETAIL_CHARS} characters so we understand what
                          you expected.
                        </p>
                        <div className="feedback-detail-field">
                          <div
                            className={`feedback-textarea-wrap${showDetailsInvite ? ' feedback-textarea-wrap--invite' : ''}`}
                          >
                            <textarea
                              id="feedback-training-detail"
                              className="feedback-textarea"
                              aria-labelledby="feedback-wizard-step-heading-2"
                              placeholder={
                                sentiment === 'up'
                                  ? 'What stood out, and what could be even better?'
                                  : 'What went wrong, and what would a better answer look like?'
                              }
                              value={comment}
                              tabIndex={wizardStep === 2 ? 0 : -1}
                              aria-describedby="feedback-training-char-status"
                              onFocus={() => setDetailsFieldFocused(true)}
                              onBlur={() => setDetailsFieldFocused(false)}
                              onInput={(e: JSX.TargetedEvent<HTMLTextAreaElement>) => {
                                setComment(e.currentTarget.value);
                                setShowSubmitHint(false);
                                setWizardStepHint(false);
                              }}
                            />
                          </div>
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
                        </div>
                      </div>
                    </div>

                    <div
                      className="feedback-wizard-step-pane"
                      aria-hidden={wizardStep !== 3}
                      {...(wizardStep !== 3 ? { inert: true } : {})}
                    >
                      <div className="feedback-wizard-step-panel">
                        <div className="feedback-wizard-step__body">
                        <h3
                          ref={wizardStep === 3 ? stepHeadingRef : undefined}
                          id="feedback-wizard-step-heading-3"
                          className="feedback-wizard-step__title"
                          tabIndex={-1}
                        >
                          How should we use this training?
                        </h3>
                        <p className="feedback-wizard-step__subtitle">
                          Your prompt and the assistant reply are saved either way. This only
                          controls whether the training record is linked to your account.
                        </p>
                        <div
                          className="feedback-training-mode__cards"
                          role="radiogroup"
                          aria-label="Training privacy"
                        >
                          <button
                            type="button"
                            role="radio"
                            aria-checked={trainingMode === 'personalized'}
                            tabIndex={
                              wizardStep === 3 && trainingMode === 'personalized' ? 0 : -1
                            }
                            className={`feedback-training-mode-card${trainingMode === 'personalized' ? ' feedback-training-mode-card--selected' : ''}`}
                            onClick={() => setTrainingMode('personalized')}
                          >
                            <span className="feedback-training-mode-card__title">Personalized</span>
                            <span className="feedback-training-mode-card__desc">
                              Links this submission to your account so Oasis can tailor responses and
                              product improvements for you over time. Best when you want the assistant
                              to learn from your feedback in a way that applies to your signed-in
                              experience.
                            </span>
                          </button>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={trainingMode === 'anonymous'}
                            tabIndex={wizardStep === 3 && trainingMode === 'anonymous' ? 0 : -1}
                            className={`feedback-training-mode-card${trainingMode === 'anonymous' ? ' feedback-training-mode-card--selected' : ''}`}
                            onClick={() => setTrainingMode('anonymous')}
                          >
                            <span className="feedback-training-mode-card__title">Anonymous</span>
                            <span className="feedback-training-mode-card__desc">
                              Does not attach your user ID to this training record. Your message and
                              reply are still stored so we can review what worked and what did not.
                              Helps improve Oasis for everyone without tying this feedback to you.
                            </span>
                          </button>
                        </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="feedback-validation-slot" aria-live="polite" aria-relevant="additions text">
                  {wizardStepHint && wizardStepHintMessage && !currentStepComplete ? (
                    <p className="feedback-validation-hint">{wizardStepHintMessage}</p>
                  ) : null}
                  {wizardStep === 3 && showSubmitHint ? (
                    <p className="feedback-validation-hint">
                      Choose at least one category and write at least {FEEDBACK_MIN_DETAIL_CHARS}{' '}
                      characters about what you expected or what could be better.
                    </p>
                  ) : null}
                </div>
              </div>
              </div>

              <div className="feedback-wizard-nav">
                <button
                  type="button"
                  className="feedback-wizard-nav__back"
                  onClick={goBack}
                  aria-disabled={wizardStep === 1}
                  disabled={wizardStep === 1}
                >
                  Back
                </button>
                {wizardStep < 3 ? (
                  <button
                    type="button"
                    className={`feedback-wizard-nav__next${currentStepComplete ? ' feedback-wizard-nav__next--ready' : ' feedback-wizard-nav__next--muted'}`}
                    onClick={onContinueClick}
                    aria-disabled={!currentStepComplete}
                    aria-label={
                      currentStepComplete
                        ? `Continue to step ${wizardStep + 1}`
                        : `Complete step ${wizardStep} to continue`
                    }
                  >
                    Continue
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`feedback-submit-btn feedback-wizard-nav__submit${submitDisabled ? ' feedback-submit-btn--muted' : ' feedback-wizard-nav__next--ready'}`}
                    onClick={onSubmitClick}
                    aria-busy={isSubmitting}
                    aria-disabled={submitDisabled}
                  >
                    {isSubmitting ? 'Saving…' : 'Submit training'}
                  </button>
                )}
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
            +{FEEDBACK_BONUS_TOKENS.toLocaleString()} bonus tokens added to your daily allowance
            (UTC).
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
