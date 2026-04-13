import { h, Fragment } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Feedback } from './Feedback';
import { ActiveToolIndicator } from './ActiveToolIndicator';
import type { AssistantMessage, OasisWindow } from '../types';

const oasisWindow: OasisWindow = window;

const STARTER_PROMPTS = [
  'Summarize this page',
  'List my open tabs',
  "Search the web for today's weather",
] as const;

export function ChatTimeline({
  messages,
  busy,
  activeToolLabel,
  onLinkClick,
  speakingMsgId,
  onTtsClick,
  isAuthenticated,
  onStarterPrompt,
}: {
  messages: AssistantMessage[];
  busy: boolean;
  activeToolLabel: string | null;
  onLinkClick: (event: MouseEvent) => void;
  speakingMsgId?: string | null;
  onTtsClick?: (messageId: string, content: string) => void;
  isAuthenticated?: boolean;
  onStarterPrompt?: (text: string) => void;
}) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages, busy, activeToolLabel]);

  return (
    <div className="chat-log" ref={logRef}>
      {messages.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            marginTop: '8px',
            marginBottom: '8px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
            width: '100%',
            padding: '8px',
            boxSizing: 'border-box',
            flexShrink: 0,
          }}
        >
          <div style={{ width: '75%', maxWidth: '260px', minWidth: '100px', flexShrink: 0 }}>
            <img
              src="chrome://browser/content/assistant/images/empty-state-bg.png"
              alt=""
              style={{
                width: '100%',
                height: 'auto',
                maxHeight: '200px',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          </div>
          <div style={{ color: '#999', fontSize: '13px', lineHeight: '1.4' }}>
            Welcome to Oasis AI
            <br />
            Browse, summarize, or manage your tabs.
          </div>
          {isAuthenticated && onStarterPrompt && !busy && (
            <div
              className="starter-prompt-cluster"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: '5px',
                maxWidth: '280px',
                padding: '0 4px',
                boxSizing: 'border-box',
              }}
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
        </div>
      )}

      {messages.map((message, index) => {
        const isLast = index === messages.length - 1;
        const isLastAI = isLast && message.role === 'ai';

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
              <div className="ai-message-wrapper">
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
                  {isLastAI && !busy && <Feedback messageId={message.id} />}
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
