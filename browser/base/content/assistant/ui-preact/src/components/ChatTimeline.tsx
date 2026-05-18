import { h, Fragment } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Feedback } from './Feedback';
import type { TrainingSubmittedPayload } from './Feedback';
import { ActiveToolIndicator } from './ActiveToolIndicator';
import { QuotaLimitCallout } from './QuotaLimitCallout';
import type { AssistantMessage, OasisWindow } from '../types';
import { detectQuotaLimitMessage } from '../utils/quotaLimitUi';
import {
  CAPABILITIES_BLOCK_DELIMITER,
  CAPABILITIES_OVERVIEW_FIRST_LINE,
  OASIS_CAPABILITIES_FEATURES_URL,
  OASIS_CAPABILITIES_LINK_LABEL,
  OASIS_CAPABILITIES_FEEDBACK_URL,
  OASIS_CAPABILITIES_FEEDBACK_LINK_LABEL,
} from '../../../shared/capabilitiesOverviewConstants.js';

const oasisWindow: OasisWindow = window;

function stripTrailingCapabilityUrls(text: string): {
  body: string;
  showKahana: boolean;
  showTally: boolean;
} {
  let t = text.trimEnd();
  let showTally = false;
  let showKahana = false;
  if (t.endsWith(OASIS_CAPABILITIES_FEEDBACK_URL)) {
    t = t.slice(0, -OASIS_CAPABILITIES_FEEDBACK_URL.length).trimEnd();
    showTally = true;
  }
  if (t.endsWith(OASIS_CAPABILITIES_FEATURES_URL)) {
    t = t.slice(0, -OASIS_CAPABILITIES_FEATURES_URL.length).trimEnd();
    showKahana = true;
  }
  return { body: t.trimEnd(), showKahana, showTally };
}

function parseCapabilitiesOverviewContent(content: string): {
  blocks: string[];
  showKahana: boolean;
  showTally: boolean;
} {
  const parts = content.split(CAPABILITIES_BLOCK_DELIMITER);
  if (parts.length === 0) {
    return { blocks: [], showKahana: false, showTally: false };
  }
  const lastIdx = parts.length - 1;
  const { body, showKahana, showTally } = stripTrailingCapabilityUrls(parts[lastIdx] ?? '');
  const blocks = [...parts.slice(0, lastIdx), body].filter(b => b.trim().length > 0);
  return { blocks, showKahana, showTally };
}

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
  isAuthenticated,
  busy,
  activeToolLabel,
  responseStreaming,
  onLinkClick,
  speakingMsgId,
  onTtsClick,
  onTrainingSubmitted,
  trainingFocusTick,
  trainingFocusMessageId,
}: {
  messages: AssistantMessage[];
  isAuthenticated: boolean;
  busy: boolean;
  activeToolLabel: string | null;
  responseStreaming: boolean;
  onLinkClick: (event: MouseEvent) => void;
  speakingMsgId?: string | null;
  onTtsClick?: (messageId: string, content: string) => void;
  onTrainingSubmitted?: (payload: TrainingSubmittedPayload) => void;
  trainingFocusTick?: number;
  trainingFocusMessageId?: string;
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

  useEffect(() => {
    const tick = trainingFocusTick ?? 0;
    const mid = trainingFocusMessageId ?? '';
    if (tick === 0 || !mid) {
      return;
    }
    const raf = requestAnimationFrame(() => {
      const safe =
        typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
          ? CSS.escape(mid)
          : mid.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const el = document.querySelector(`[data-oasis-assistant-msg="${safe}"]`);
      if (!el || !(el instanceof HTMLElement)) {
        return;
      }
      const log = logRef.current;
      el.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
      requestAnimationFrame(() => {
        log?.scrollTo({ top: log.scrollHeight, behavior: 'smooth' });
      });
    });
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [trainingFocusTick, trainingFocusMessageId]);

  const emptySignedIn = messages.length === 0 && isAuthenticated;

  return (
    <div
      className={`chat-log${emptySignedIn ? ' chat-log--empty-signed-in' : ''}`}
      ref={logRef}
    >
      {messages.length === 0 && !isAuthenticated && (
        <div className="chat-empty-state">
          <p className="chat-empty-state__welcome">
            Try a suggestion in the box below, or type your own request.
          </p>
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
                  data-oasis-assistant-msg={message.id}
                >
                  <div className="ai-response-container" onClick={onLinkClick}>
                    <QuotaLimitCallout variant={quotaVariant} />
                  </div>
                </div>
              </Fragment>
            );
          }

          const isCapabilitiesOverview =
            message.content.startsWith(CAPABILITIES_OVERVIEW_FIRST_LINE) ||
            message.content.startsWith('## What Oasis can do');
          const isLegacyCapabilitiesBubbles =
            isCapabilitiesOverview && message.content.includes(CAPABILITIES_BLOCK_DELIMITER);

          let useMarkdownHtml = Boolean(
            oasisWindow.marked &&
              oasisWindow.DOMPurify &&
              !(isCapabilitiesOverview && isLegacyCapabilitiesBubbles)
          );
          let htmlContent = '';
          if (useMarkdownHtml) {
            try {
              const raw = oasisWindow.marked!.parse(message.content);
              htmlContent = oasisWindow.DOMPurify!.sanitize(raw);
            } catch {
              useMarkdownHtml = false;
            }
          }

          const capabilitiesParsed = isLegacyCapabilitiesBubbles
            ? parseCapabilitiesOverviewContent(message.content)
            : null;

          const markdownBodyClass =
            isCapabilitiesOverview && !isLegacyCapabilitiesBubbles
              ? 'markdown-body capabilities-markdown'
              : 'markdown-body';

          return (
            <Fragment key={message.id}>
              <div
                ref={isLast ? lastAiRef : undefined}
                className="ai-message-wrapper"
                data-oasis-assistant-msg={message.id}
              >
                <div className="ai-response-container" onClick={onLinkClick}>
                  {useMarkdownHtml && htmlContent ? (
                    <div
                      className={markdownBodyClass}
                      dangerouslySetInnerHTML={{ __html: htmlContent }}
                    />
                  ) : isLegacyCapabilitiesBubbles && capabilitiesParsed ? (
                    <div className="capabilities-overview-stack">
                      {capabilitiesParsed.blocks.map((block, bi) => {
                        const isLastBlock = bi === capabilitiesParsed.blocks.length - 1;
                        const showLinks =
                          isLastBlock &&
                          (capabilitiesParsed.showKahana || capabilitiesParsed.showTally);
                        return (
                          <div
                            key={bi}
                            className="message-content capabilities-block"
                            style={{
                              whiteSpace: 'pre-wrap',
                              background: 'transparent',
                              border: 'none',
                              padding: 0,
                            }}
                          >
                            {block}
                            {showLinks ? (
                              <>
                                {'\n\n'}
                                {capabilitiesParsed.showKahana ? (
                                  <a
                                    href={OASIS_CAPABILITIES_FEATURES_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    {OASIS_CAPABILITIES_LINK_LABEL}
                                  </a>
                                ) : null}
                                {capabilitiesParsed.showKahana &&
                                capabilitiesParsed.showTally ? (
                                  <>
                                    {'\n'}
                                  </>
                                ) : null}
                                {capabilitiesParsed.showTally ? (
                                  <a
                                    href={OASIS_CAPABILITIES_FEEDBACK_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    {OASIS_CAPABILITIES_FEEDBACK_LINK_LABEL}
                                  </a>
                                ) : null}
                              </>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div
                      className="message-content"
                      style={{
                        whiteSpace: 'pre-wrap',
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                      }}
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
                      interactionId={message.interactionId}
                      onTrainingSubmitted={onTrainingSubmitted}
                      inlineAutofocusTick={
                        trainingFocusMessageId === message.id
                          ? trainingFocusTick ?? 0
                          : 0
                      }
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
