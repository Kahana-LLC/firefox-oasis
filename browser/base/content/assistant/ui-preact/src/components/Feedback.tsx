import { h, Fragment } from 'preact';
import type { JSX } from 'preact';
import { createPortal } from 'preact/compat';
import { useState, useEffect, useCallback } from 'preact/hooks';
import type { OasisWindow } from '../types';

interface FeedbackProps {
  messageId: string;
  userPrompt: string;
  assistantReply: string;
  onClose?: () => void;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuidString(value: string): boolean {
  return UUID_RE.test(String(value || '').trim());
}

export function Feedback({ messageId, userPrompt, assistantReply, onClose }: FeedbackProps) {
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

  const badges = [
    "Didn't work",
    'Wrong result',
    'Too slow',
    'Safety concern',
    'Confusing',
    'Suggestion',
    'Other',
  ];

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setSentiment(null);
    setSelectedBadges([]);
    setComment('');
    setSubmitted(false);
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

  const toggleBadge = (badge: string) => {
    setSelectedBadges(prev =>
      prev.includes(badge) ? prev.filter(b => b !== badge) : [...prev, badge]
    );
  };

  const mpTrack = (event: string, props: Record<string, unknown> = {}) => {
    if (oasisWindow.mpTrack) {
      oasisWindow.mpTrack(event, props);
    }
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
      showFeedbackMessage('Feedback service unavailable.', true);
      return false;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        showFeedbackMessage('Please sign in to submit feedback.', true);
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
        showFeedbackMessage('Failed to submit feedback.', true);
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
    if (sentiment === 'down') {
      if (selectedBadges.length === 0 && !comment.trim()) {
        return;
      }
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
  const submitDisabled =
    isSubmitting ||
    (sentiment === 'down' && selectedBadges.length === 0 && !comment.trim());

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
              <p className="feedback-overlay-thanks-text">Thanks for your feedback!</p>
            </div>
          ) : (
            <Fragment>
              <div className="feedback-header">
                <span id="feedback-dialog-title">
                  {sentiment === 'up' ? 'Tell us what worked' : 'Help us improve Oasis'}
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

              <div className="feedback-context-section">
                <div className="feedback-context-label">Your message</div>
                <pre className="feedback-context-block">{userDisplay}</pre>
              </div>
              <div className="feedback-context-section">
                <div className="feedback-context-label">Assistant reply</div>
                <pre className="feedback-context-block">{assistantReply}</pre>
              </div>

              {sentiment === 'down' ? (
                <div className="feedback-badges">
                  {badges.map(badge => (
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
              ) : (
                <div className="feedback-badges feedback-badges--optional">
                  <span className="feedback-context-hint">Optional tags</span>
                  <div className="feedback-badges-inner">
                    {badges.map(badge => (
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
                </div>
              )}

              <div className="feedback-input-container">
                <textarea
                  className="feedback-textarea"
                  placeholder={
                    sentiment === 'up'
                      ? 'What did you expect, or any suggestions? (optional)'
                      : 'What did you expect, or how could this answer be better?'
                  }
                  value={comment}
                  onInput={(e: JSX.TargetedEvent<HTMLTextAreaElement>) =>
                    setComment(e.currentTarget.value)
                  }
                />
              </div>

              <div className="feedback-checkboxes">
                <label className="feedback-checkbox-label">
                  <input
                    type="checkbox"
                    checked={includeContext}
                    onChange={() => setIncludeContext(!includeContext)}
                  />
                  <span>Include this message pair in the report</span>
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

              <div className="feedback-footer">
                <button
                  type="button"
                  className="feedback-submit-btn"
                  onClick={() => void handleModalSubmit()}
                  disabled={submitDisabled}
                  style={{ opacity: submitDisabled ? 0.6 : 1 }}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
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
        <div className="feedback-submitted">Thanks for your feedback!</div>
      </div>
    );
  }

  return (
    <div className="feedback-container">
      {overlay}
      <div className="feedback-options">
        <span className="feedback-label">Did we get it right?</span>
        <button
          type="button"
          className="feedback-btn thumbs-up"
          onClick={() => openModal('up')}
          disabled={isSubmitting}
          title="Thumbs up"
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
          title="Thumbs down"
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
    </div>
  );
}
