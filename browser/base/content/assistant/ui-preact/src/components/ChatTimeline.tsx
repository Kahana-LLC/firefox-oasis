import { h, Fragment } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Feedback } from './Feedback';
import { ActiveToolIndicator } from './ActiveToolIndicator';
import type { AssistantMessage, OasisWindow } from '../types';

const oasisWindow: OasisWindow = window;

export function ChatTimeline({
  messages,
  busy,
  activeToolLabel,
  onLinkClick,
}: {
  messages: AssistantMessage[];
  busy: boolean;
  activeToolLabel: string | null;
  onLinkClick: (event: MouseEvent) => void;
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
            gap: '0px',
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
                {isLastAI && !busy && <Feedback messageId={message.id} />}
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
