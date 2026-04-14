import { h } from 'preact';
import type { Ref } from 'preact';

export function Composer({
  input,
  busy,
  isAuthenticated,
  ttsEnabled,
  inputRef,
  onInput,
  onKeyDown,
  onSend,
  onResetSession,
  onFeedback,
  onToggleTts,
  onOpenVoiceAgent,
  onRequestSignIn,
}: {
  input: string;
  busy: boolean;
  isAuthenticated: boolean;
  ttsEnabled: boolean;
  inputRef?: Ref<HTMLTextAreaElement>;
  onInput: (value: string) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onSend: () => void;
  onResetSession: () => void;
  onFeedback: () => void;
  onToggleTts: () => void;
  onOpenVoiceAgent: () => void;
  onRequestSignIn?: () => void;
}) {
  return (
    <div className={`input-bar${busy ? ' input-bar--busy' : ''}`}>
      {!isAuthenticated ? (
        <button
          type="button"
          className="input-field input-field-signin-prompt"
          onClick={() => onRequestSignIn?.()}
          disabled={busy}
          aria-label="Sign in or create an account to use the assistant"
        >
          Please sign in...
        </button>
      ) : (
        <textarea
          ref={inputRef}
          className="input-field"
          value={input}
          onInput={(event: Event) => {
            const target = event.currentTarget as HTMLTextAreaElement;
            onInput(target.value);
          }}
          onKeyDown={onKeyDown}
          placeholder={isAuthenticated ? 'Ask Oasis…' : 'Please sign in...'}
          disabled={busy || !isAuthenticated}
          rows={1}
          style={{
            minHeight: '24px',
            fontSize: '14px',
            color: '#333',
          }}
        />
      )}

      <div className="composer-toolbar">
        <button
          type="button"
          className="composer-feedback-btn"
          onClick={onFeedback}
          title="Send feedback"
          aria-label="Send feedback"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>

        <div className="composer-toolbar-spacer" />

        <div className="composer-toolbar-actions">
          <button
            className="send-btn composer-tool-btn"
            onClick={onResetSession}
            title="Clear Chat History"
            style={{ color: '#666' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>

          <button
            className="send-btn composer-tool-btn"
            onClick={onToggleTts}
            title={ttsEnabled ? 'Disable auto read-aloud' : 'Enable auto read-aloud'}
            style={{
              background: 'none',
              color: ttsEnabled ? '#7A9200' : '#999',
            }}
          >
            {ttsEnabled ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            )}
          </button>

          <button
            className="send-btn composer-tool-btn"
            onClick={onOpenVoiceAgent}
            disabled={busy || !isAuthenticated}
            title="Voice conversation (hands-free)"
          >
            <svg className="composer-voice-agent-icon" width="32" height="32" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <rect width="36" height="36" rx="18" fill="#F8FAF2" />
              <path d="M18 10a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3z" fill="#94A833" />
              <path d="M23 17v1a5 5 0 0 1-10 0v-1" stroke="#94A833" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="18" y1="23" x2="18" y2="26" stroke="#94A833" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="15" y1="26" x2="21" y2="26" stroke="#94A833" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>

          <button
            type="button"
            className={`send-btn composer-send-btn${busy ? ' composer-send-btn--busy' : ''}`}
            onClick={onSend}
            disabled={busy || !isAuthenticated}
            title="Send"
          >
            {busy ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7A9200" strokeWidth="2">
                <rect x="9" y="9" width="6" height="6" />
              </svg>
            ) : (
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                <circle cx="18" cy="18" r="18" fill="#7A9200" />
                <path d="M18 24V12M18 12L24 18M18 12L12 18" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
