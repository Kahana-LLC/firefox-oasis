import { h } from 'preact';
import type { Ref } from 'preact';
import { useState } from 'preact/hooks';
import { TokenUsageBar } from './TokenUsageBar';
import {
  EXAMPLE_COMMANDS_ROTATION,
  type ComposerInlineSuggestion,
} from '../utils/exampleCommands';
import { useReducedMotionPreference, useTypewriterCycle } from '../hooks/useTypewriterCycle';

const COMPOSER_PLACEHOLDER = 'Send follow-up';

const COMPOSER_INPUT_ARIA =
  'Message composer. Type a request, use the Up arrow to recall previous commands, or tap a suggestion chip.';

export function Composer({
  input,
  busy,
  isAuthenticated,
  chatIsEmpty,
  ttsEnabled,
  inputRef,
  showInlineChips,
  inlineSuggestions,
  highlightInlineChips,
  onInlineSuggestionSend,
  onInput,
  onKeyDown,
  onSend,
  onResetSession,
  onFeedback,
  onToggleTts,
  onOpenVoiceAgent,
  onRequestSignIn,
  onOpenTraining,
  showTrainLatestComposerHint,
  onDismissTrainLatestHint,
  onInsertCapabilities,
}: {
  input: string;
  busy: boolean;
  isAuthenticated: boolean;
  chatIsEmpty: boolean;
  ttsEnabled: boolean;
  inputRef?: Ref<HTMLTextAreaElement>;
  showInlineChips?: boolean;
  inlineSuggestions?: readonly ComposerInlineSuggestion[];
  highlightInlineChips?: boolean;
  onInlineSuggestionSend?: (text: string) => void;
  onInput: (value: string) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onSend: () => void;
  onResetSession: () => void;
  onFeedback: () => void;
  onToggleTts: () => void;
  onOpenVoiceAgent: () => void;
  onRequestSignIn?: () => void;
  onOpenTraining?: () => void;
  showTrainLatestComposerHint?: boolean;
  onDismissTrainLatestHint?: () => void;
  onInsertCapabilities?: () => void;
}) {
  const [inputFocused, setInputFocused] = useState(false);
  const reducedMotion = useReducedMotionPreference();
  const typewriterActive =
    chatIsEmpty &&
    isAuthenticated &&
    !busy &&
    input === '' &&
    !inputFocused;
  const typewriterText = useTypewriterCycle(
    EXAMPLE_COMMANDS_ROTATION,
    typewriterActive,
    reducedMotion
  );
  const placeholderText = typewriterActive ? '' : COMPOSER_PLACEHOLDER;
  const chipsVisible =
    isAuthenticated &&
    !!showInlineChips &&
    !busy &&
    inlineSuggestions &&
    inlineSuggestions.length > 0;

  const onInlineChipClick = (text: string) => {
    if (onInlineSuggestionSend) {
      onInlineSuggestionSend(text);
      return;
    }
    onInput(text);
    requestAnimationFrame(() => {
      if (inputRef && typeof inputRef === 'object' && 'current' in inputRef) {
        const ta = inputRef.current;
        if (ta) {
          ta.focus();
        }
      }
    });
  };

  const emptySignedChat = isAuthenticated && chatIsEmpty;

  return (
    <div
      id="oasis-assistant-composer"
      className={`input-bar composer-dock${busy ? ' input-bar--busy' : ''}${emptySignedChat ? ' input-bar--empty-signed-chat' : ''}`}
    >
      {showTrainLatestComposerHint ? (
        <div className="composer-train-latest-hint" role="status">
          <span>
            Ask Oasis something first, then use Train on the reply to earn bonus tokens.
          </span>
          <button
            type="button"
            className="composer-train-latest-hint-dismiss"
            onClick={() => onDismissTrainLatestHint?.()}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ) : null}
      {isAuthenticated && (
        <TokenUsageBar isAuthenticated embedded onOpenTraining={onOpenTraining} />
      )}
      {!isAuthenticated ? (
        <div className="composer-guest-signin">
          <button
            type="button"
            className="input-field input-field-signin-prompt"
            onClick={() => onRequestSignIn?.()}
            disabled={busy}
            aria-label="Sign in or create an account to use the assistant"
          >
            Please sign in...
          </button>
          <button
            type="button"
            className="composer-full-signin-link"
            onClick={() => onRequestSignIn?.()}
            disabled={busy}
          >
            Full sign-in screen
          </button>
        </div>
      ) : (
        <div
          className="composer-prompt-stack"
          onMouseDown={(event: MouseEvent) => {
            if (busy) {
              return;
            }
            const t = event.target as HTMLElement | null;
            if (!t || t.closest('button') || t.closest('textarea')) {
              return;
            }
            if (inputRef && typeof inputRef === 'object' && 'current' in inputRef) {
              inputRef.current?.focus();
            }
          }}
        >
          <div className="composer-input-wrap">
            {typewriterActive && (
              <div className="composer-typewriter-hint" aria-hidden="true">
                {typewriterText}
                {!reducedMotion && <span className="composer-typewriter-caret">|</span>}
              </div>
            )}
            <textarea
              ref={inputRef}
              className="input-field"
              value={input}
              onInput={(event: Event) => {
                const target = event.currentTarget as HTMLTextAreaElement;
                onInput(target.value);
              }}
              onKeyDown={onKeyDown}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={placeholderText}
              aria-label={COMPOSER_INPUT_ARIA}
              disabled={busy || !isAuthenticated}
              rows={1}
            style={{
              minHeight: emptySignedChat ? '120px' : '88px',
              fontSize: '14px',
            }}
            />
          </div>

          {chipsVisible && (
            <div
              className={`composer-inline-chips${highlightInlineChips ? ' composer-inline-chips--pulse' : ''}`}
            >
              {inlineSuggestions!.map(s => (
                <button
                  key={s.label}
                  type="button"
                  className="composer-inline-chip"
                  disabled={busy}
                  onClick={() => {
                    if ("action" in s && s.action === "commandReferenceMarkdown") {
                      onInsertCapabilities?.();
                      return;
                    }
                    if ("message" in s) {
                      onInlineChipClick(s.message);
                    }
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="composer-toolbar">
        <button
          type="button"
          className="composer-feedback-btn"
          onClick={onFeedback}
          title="Send feedback"
          aria-label="Send feedback"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>

        <div className="composer-toolbar-spacer" />

        <div className="composer-toolbar-actions">
          <button
            className="send-btn composer-tool-btn composer-tool-btn--muted"
            onClick={onResetSession}
            title="Clear Chat History"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>

          <button
            className={`send-btn composer-tool-btn composer-tool-btn--tts${ttsEnabled ? ' composer-tool-btn--tts-on' : ' composer-tool-btn--tts-off'}`}
            onClick={onToggleTts}
            title={ttsEnabled ? 'Disable auto read-aloud' : 'Enable auto read-aloud'}
          >
            {ttsEnabled ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            <svg className="composer-voice-agent-icon" width="22" height="22" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <rect width="36" height="36" rx="18" fill="var(--primary-light)" />
              <path d="M18 10a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3z" fill="var(--primary-green)" />
              <path d="M23 17v1a5 5 0 0 1-10 0v-1" stroke="var(--primary-green)" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="18" y1="23" x2="18" y2="26" stroke="var(--primary-green)" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="15" y1="26" x2="21" y2="26" stroke="var(--primary-green)" strokeWidth="1.5" strokeLinecap="round" />
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
              <svg className="composer-send-btn-busy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="9" y="9" width="6" height="6" fill="var(--primary-green)" />
              </svg>
            ) : (
              <svg width="26" height="26" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                <circle cx="18" cy="18" r="18" fill="var(--primary-green)" />
                <path d="M18 24V12M18 12L24 18M18 12L12 18" stroke="var(--auth-on-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
