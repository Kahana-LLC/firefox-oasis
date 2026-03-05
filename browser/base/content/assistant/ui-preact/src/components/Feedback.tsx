import { h } from 'preact';
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { OasisWindow } from '../types';

interface FeedbackProps {
  messageId: string;
  onClose?: () => void;
}

export function Feedback({ messageId, onClose }: FeedbackProps) {
  const oasisWindow = window as OasisWindow;
  const [showForm, setShowForm] = useState(false);
  const [selectedBadges, setSelectedBadges] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [includeContext, setIncludeContext] = useState(true);
  const [contactMe, setContactMe] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const badges = [
    "Didn't work",
    "Wrong result",
    "Too slow",
    "Safety concern",
    "Confusing",
    "Suggestion",
    "Other"
  ];

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

  const submitToSupabase = async (isNegative: boolean, category: string, additionalInfo: string) => {
    const supabase = oasisWindow.supabaseAuth?.supabase;
    // session_id is usually provided by the bridge or auth service
    const sessionId = oasisWindow.supabaseAuth?.currentSession?.session_id || null;

    if (!supabase) {
      showFeedbackMessage("Feedback service unavailable.", true);
      return false;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showFeedbackMessage("Please sign in to submit feedback.", true);
        return false;
      }

      const payload = {
        user_id: user.id,
        session_id: sessionId,
        message_id: messageId,
        reported_at: new Date().toISOString(),
        negative_rating: isNegative,
        category,
        additional_info: JSON.stringify({
          badges: selectedBadges,
          comment: additionalInfo,
          include_context: includeContext,
          contact_me: contactMe
        })
      };

      const { error } = await supabase.from("feedback_events").insert(payload);
      if (error) {
        console.error("Feedback insert failed:", error);
        mpTrack("feedback_submit_error", { message: error.message || String(error) });
        showFeedbackMessage("Failed to submit feedback.", true);
        return false;
      }

      mpTrack("feedback_submit_success", { negative_rating: isNegative, category });
      return true;
    } catch (err) {
      console.error("Feedback submission exception:", err);
      return false;
    }
  };

  const handleThumbUp = async () => {
    mpTrack("feedback_thumb_up", { messageId });
    setIsSubmitting(true);
    const success = await submitToSupabase(false, "Helpful", "");
    if (success) {
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    }
    setIsSubmitting(false);
  };

  const handleSubmit = async () => {
    if (selectedBadges.length === 0 && !comment.trim()) {
      return;
    }

    setIsSubmitting(true);
    const category = selectedBadges.length > 0 ? selectedBadges[0] : "Other";
    const success = await submitToSupabase(true, category, comment.trim());
    
    if (success) {
      setSubmitted(true);
      setTimeout(() => {
          if (onClose) onClose();
          setShowForm(false);
          setSubmitted(false);
          setSelectedBadges([]);
          setComment('');
      }, 2000);
    }
    setIsSubmitting(false);
  };

  if (submitted) {
    return (
        <div className="feedback-submitted">
            Thanks for your feedback!
        </div>
    );
  }

  return (
    <div className="feedback-container">
      {!showForm ? (
        <div className="feedback-options">
          <span className="feedback-label">Did we get it right?</span>
          <button 
            className="feedback-btn thumbs-up" 
            onClick={handleThumbUp} 
            disabled={isSubmitting}
            title="Thumbs Up"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
            </svg>
          </button>
          <button 
            className="feedback-btn thumbs-down" 
            onClick={() => {
              setShowForm(true);
              mpTrack("feedback_thumb_down", { messageId });
            }} 
            disabled={isSubmitting}
            title="Thumbs Down"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zM17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="feedback-modal">
          <div className="feedback-header">
            <span>Help us improve Oasis</span>
            <button className="feedback-close-btn" onClick={() => setShowForm(false)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="feedback-badges">
            {badges.map(badge => (
              <button 
                key={badge}
                className={`feedback-badge ${selectedBadges.includes(badge) ? 'selected' : ''}`}
                onClick={() => toggleBadge(badge)}
              >
                {badge}
                {selectedBadges.includes(badge) && (
                  <span className="badge-remove">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="feedback-input-container">
            <textarea 
              className="feedback-textarea"
              placeholder="Ask me anything..."
              value={comment}
              onInput={(e: JSX.TargetedEvent<HTMLTextAreaElement>) => setComment(e.currentTarget.value)}
            />
          </div>

          <div className="feedback-checkboxes">
            <label className="feedback-checkbox-label">
              <input 
                type="checkbox" 
                checked={includeContext} 
                onChange={() => setIncludeContext(!includeContext)} 
              />
              <span>Include chat context (helps us fix issues faster)</span>
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
              className="feedback-submit-btn" 
              onClick={handleSubmit}
              disabled={isSubmitting || (selectedBadges.length === 0 && !comment.trim())}
              style={{ opacity: (isSubmitting || (selectedBadges.length === 0 && !comment.trim())) ? 0.6 : 1 }}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
