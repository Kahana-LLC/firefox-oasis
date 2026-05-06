import { h, Fragment } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Feedback } from './Feedback';
import type { TrainingSubmittedPayload } from './Feedback';
import { ActiveToolIndicator } from './ActiveToolIndicator';
import { QuotaLimitCallout } from './QuotaLimitCallout';
import type { AssistantMessage, OasisWindow } from '../types';
import { detectQuotaLimitMessage } from '../utils/quotaLimitUi';
import { STARTER_PROMPTS } from '../utils/exampleCommands';

const oasisWindow: OasisWindow = window;

function userPromptBefore(messages: AssistantMessage[], aiIndex: number): string {
  for (let i = aiIndex - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return messages[i].content;
    }
  }
  return '';
}

export function ChatTimeline({
  messages,
  busy,
  activeToolLabel,
  responseStreaming,
  onLinkClick,
  speakingMsgId,
  onTtsClick,
  isAuthenticated,
  onStarterPrompt,
  highlightStarterChips,
  onTrainingSubmitted,
}: {
  messages: AssistantMessage[];
  busy: boolean;
  activeToolLabel: string | null;
  responseStreaming: boolean;
  onLinkClick: (event: MouseEvent) => void;
  speakingMsgId?: string | null;
  onTtsClick?: (messageId: string, content: string) => void;
  isAuthenticated?: boolean;
  onStarterPrompt?: (text: string) => void;
  highlightStarterChips?: boolean;
  onTrainingSubmitted?: (payload: TrainingSubmittedPayload) => void;
}) {
  const logRef = useRef<HTMLDivElement>(null);
  const lastAiRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const log = logRef.current;
    if (!log) {
      return;
    }
    const last = messages[messages.length - 1];
    const shouldSnapToTopOfLastAi =
      !busy &&
      !responseStreaming &&
      !activeToolLabel &&
      last?.role === 'ai' &&
      last.content.length > 0;

    if (shouldSnapToTopOfLastAi) {
      requestAnimationFrame(() => {
        lastAiRef.current?.scrollIntoView({ block: 'start', behavior: 'auto', inline: 'nearest' });
      });
      return;
    }
    log.scrollTop = log.scrollHeight;
  }, [messages, busy, activeToolLabel, responseStreaming]);

  return (
    <div className="chat-log" ref={logRef}>
      {messages.length === 0 && (
        <div className="chat-empty-state">
          <p className="chat-empty-state__welcome">
            Get started with these example commands
            <br />
            or type in your own below.
          </p>
          {isAuthenticated && onStarterPrompt && !busy && (
            <div
              className={`starter-prompt-cluster chat-empty-state__chips${highlightStarterChips ? ' starter-prompt-cluster--pulse' : ''}`}
            >
              {STARTER_PROMPTS.map(text => (
                <button
                  key={text}
                  type="button"
                  className="starter-prompt-chip"
                  onClick={() => onStarterPrompt(text)}
                >
                  {text}
                </button>
              ))}
            </div>
          )}
          <div className="chat-empty-state__art">
            <img
              src="chrome://browser/content/assistant/images/empty-state-bg.png"
              alt=""
              decoding="async"
            />
          </div>
        </div>
      )}

      {messages.map((message, index) => {
        const isLast = index === messages.length - 1;

        if (message.role === 'user') {
          return (
            <div key={message.id} className="message-bubble message-user">
              <div className="message-content" style={{ whiteSpace: 'pre-wrap' }}>
                {message.content}
              </div>
            </div>
          );
        }

        if (message.role === 'ai') {
          const quotaVariant = detectQuotaLimitMessage(message.content);
          if (quotaVariant) {
            return (
              <Fragment key={message.id}>
                <div
                  ref={isLast ? lastAiRef : undefined}
                  className="ai-message-wrapper"
                >
                  <div className="ai-response-container" onClick={onLinkClick}>
                    <QuotaLimitCallout variant={quotaVariant} />
                  </div>
                </div>
              </Fragment>
            );
          }

          let htmlContent = message.content;
          try {
            if (oasisWindow.marked && oasisWindow.DOMPurify) {
              const raw = oasisWindow.marked.parse(message.content);
              htmlContent = oasisWindow.DOMPurify.sanitize(raw);
            }
          } catch {
            htmlContent = message.content;
          }

          return (
            <Fragment key={message.id}>
              <div
                ref={isLast ? lastAiRef : undefined}
                className="ai-message-wrapper"
              >
                <div className="ai-response-container" onClick={onLinkClick}>
                  {oasisWindow.marked ? (
                    <div
                      className="markdown-body"
                      dangerouslySetInnerHTML={{ __html: htmlContent }}
                    />
                  ) : (
                    <div
                      className="message-content"
                      style={{ whiteSpace: 'pre-wrap', background: 'transparent', border: 'none', padding: 0 }}
                    >
                      {message.content}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {!busy && message.content && onTtsClick && (
                    <button
                      className="tts-btn"
                      type="button"
                      onClick={() => {
                        if (speakingMsgId === message.id) {
                          onTtsClick(message.id, '');
                        } else {
                          onTtsClick(message.id, message.content);
                        }
                      }}
                      title={speakingMsgId === message.id ? 'Stop speaking' : 'Read aloud'}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                        color: speakingMsgId === message.id ? '#7A9200' : '#999',
                      }}
                    >
                      {speakingMsgId === message.id ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="6" y="4" width="4" height="16" />
                          <rect x="14" y="4" width="4" height="16" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                        </svg>
                      )}
                    </button>
                  )}
                  {message.content && (!isLast || !busy) ? (
                    <Feedback
                      messageId={message.id}
                      userPrompt={userPromptBefore(messages, index)}
                      assistantReply={message.content}
                      onTrainingSubmitted={onTrainingSubmitted}
                    />
                  ) : null}
                </div>
              </div>
            </Fragment>
          );
        }

        return null;
      })}

      {(busy || activeToolLabel) && (
        <ActiveToolIndicator label={activeToolLabel || 'Thinking...'} />
      )}
    </div>
  );
}
