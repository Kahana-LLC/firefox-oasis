import { h, Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  copyMarkdownToClipboard,
  copyTextToClipboard,
  isOutreachEmailMarkdown,
  isResearchBriefMarkdown,
  isCompetitiveIntelMarkdown,
  isCompetitiveIntelWorkflowMarkdown,
  textForClipboard,
} from '../utils/copyToClipboard';
import { isLongFormAiArtifact } from '../utils/longFormArtifact';
import { parseResearchBriefToolMessage } from '../../../build/src/utils/researchBriefRequest.js';
import { parseOutreachEmailToolMessage } from '../../../build/src/utils/outreachEmailRequest.js';
import {
  hasCompetitiveIntelMarker,
} from '../../../build/src/utils/competitiveIntelRequest.js';
import { parseCompetitiveIntelWorkflowMessage } from '../../../build/src/utils/competitiveIntelWorkflowRequest.js';
import { friendlyLabelForWorkflowSentinel } from '../../../build/src/utils/competitiveIntelResume.js';
import type { MarkdownSection } from '../utils/markdownSectionSplit';
import { OutreachEmailView } from './OutreachEmailView';
import { ResearchBriefView } from './ResearchBriefView';
import { CompetitiveIntelWorkflowView } from './CompetitiveIntelWorkflowView';
import { CompetitiveIntelReportMessage } from './CompetitiveIntelReportMessage';
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

function chatScrollRoot(log: HTMLDivElement): HTMLElement {
  const scroll = log.closest('.assistant-scroll');
  return scroll instanceof HTMLElement ? scroll : log;
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
  onRegenerateBriefSection,
  pinnedBriefId,
  briefPinned,
  onToggleBriefPin,
  onSlimCiMessage,
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
  onRegenerateBriefSection?: (sectionId: string) => void;
  pinnedBriefId?: string | null;
  briefPinned?: boolean;
  onToggleBriefPin?: (content: string) => void;
  onSlimCiMessage?: (messageId: string, reportId: string) => void;
}) {
  const logRef = useRef<HTMLDivElement>(null);
  const lastAiRef = useRef<HTMLDivElement | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [copyFailedMsgId, setCopyFailedMsgId] = useState<string | null>(null);
  const [copiedSectionId, setCopiedSectionId] = useState<string | null>(null);
  const [sectionCopyFailedId, setSectionCopyFailedId] = useState<string | null>(
    null
  );
  const [outreachCopiedMsgId, setOutreachCopiedMsgId] = useState<string | null>(
    null
  );
  const [outreachCopyFailedMsgId, setOutreachCopyFailedMsgId] = useState<
    string | null
  >(null);
  const [ciCopiedMsgId, setCiCopiedMsgId] = useState<string | null>(null);
  const [ciCopyFailedMsgId, setCiCopyFailedMsgId] = useState<string | null>(
    null
  );

  const EMAIL_COMPOSE_URLS = {
    gmail: 'https://mail.google.com/mail/?view=cm&fs=1',
    outlook: 'https://outlook.live.com/mail/0/deeplink/compose',
    yahoo: 'https://compose.mail.yahoo.com/',
  } as const;

  const handleCopy = async (messageId: string, content: string) => {
    const ok = await copyMarkdownToClipboard(content);
    if (ok) {
      setCopyFailedMsgId(null);
      setCopiedMsgId(messageId);
      window.setTimeout(() => {
        setCopiedMsgId(current => (current === messageId ? null : current));
      }, 2000);
      return;
    }
    setCopiedMsgId(null);
    setCopyFailedMsgId(messageId);
    window.setTimeout(() => {
      setCopyFailedMsgId(current => (current === messageId ? null : current));
    }, 2000);
  };

  const handleSectionCopy = async (section: MarkdownSection) => {
    const ok = await copyMarkdownToClipboard(section.markdown);
    if (ok) {
      setSectionCopyFailedId(null);
      setCopiedSectionId(section.id);
      window.setTimeout(() => {
        setCopiedSectionId(current =>
          current === section.id ? null : current
        );
      }, 2000);
      return;
    }
    setCopiedSectionId(null);
    setSectionCopyFailedId(section.id);
    window.setTimeout(() => {
      setSectionCopyFailedId(current =>
        current === section.id ? null : current
      );
    }, 2000);
  };

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
    const snapArtifactToTop =
      shouldSnapToTopOfLastAi && isLongFormAiArtifact(last.content);

    if (shouldSnapToTopOfLastAi) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          lastAiRef.current?.scrollIntoView({
            block: snapArtifactToTop ? 'start' : 'nearest',
            behavior: 'auto',
            inline: 'nearest',
          });
        });
      });
      return;
    }
    const scrollRoot = chatScrollRoot(log);
    scrollRoot.scrollTop = scrollRoot.scrollHeight;
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
        if (!log) {
          return;
        }
        const scrollRoot = chatScrollRoot(log);
        scrollRoot.scrollTo({ top: scrollRoot.scrollHeight, behavior: 'smooth' });
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
          const displayText =
            friendlyLabelForWorkflowSentinel(message.content) || message.content;
          return (
            <div key={message.id} className="message-bubble message-user">
              <div className="message-content" style={{ whiteSpace: 'pre-wrap' }}>
                {displayText}
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

          const displayContent = textForClipboard(message.content);
          const isResearchBrief =
            isResearchBriefMarkdown(message.content) &&
            displayContent.length > 0;
          const isOutreachEmail =
            isOutreachEmailMarkdown(message.content) &&
            displayContent.length > 0;
          const isCiWorkflow = isCompetitiveIntelWorkflowMarkdown(message.content);
          const ciWorkflowPayload = isCiWorkflow
            ? parseCompetitiveIntelWorkflowMessage(message.content)
            : null;
          const isCiReport = hasCompetitiveIntelMarker(message.content);
          const outreachPayload = isOutreachEmail
            ? parseOutreachEmailToolMessage(message.content)
            : null;
          const isLongFormArtifact = isLongFormAiArtifact(message.content);

          let useMarkdownHtml = Boolean(
            oasisWindow.marked &&
              oasisWindow.DOMPurify &&
              !(isCapabilitiesOverview && isLegacyCapabilitiesBubbles)
          );
          let htmlContent = '';
          if (useMarkdownHtml && !isResearchBrief && !isOutreachEmail && !isCiWorkflow && !isCiReport) {
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
                className={`ai-message-wrapper${isLongFormArtifact ? ' long-form-artifact' : ''}`}
                data-oasis-assistant-msg={message.id}
              >
                <div className="ai-response-container" onClick={onLinkClick}>
                  {isOutreachEmail && outreachPayload ? (
                    <OutreachEmailView
                      draft={outreachPayload.draft}
                      plainEmail={outreachPayload.plainEmail}
                      copiedAll={outreachCopiedMsgId === message.id}
                      copyAllFailed={outreachCopyFailedMsgId === message.id}
                      onCopyAll={() => {
                        void copyTextToClipboard(outreachPayload.plainEmail).then(
                          ok => {
                            if (ok) {
                              setOutreachCopyFailedMsgId(null);
                              setOutreachCopiedMsgId(message.id);
                              window.setTimeout(() => {
                                setOutreachCopiedMsgId(current =>
                                  current === message.id ? null : current
                                );
                              }, 2000);
                              return;
                            }
                            setOutreachCopiedMsgId(null);
                            setOutreachCopyFailedMsgId(message.id);
                            window.setTimeout(() => {
                              setOutreachCopyFailedMsgId(current =>
                                current === message.id ? null : current
                              );
                            }, 2000);
                          }
                        );
                      }}
                      onOpenEmailClient={provider => {
                        const url = EMAIL_COMPOSE_URLS[provider];
                        window.open(url, '_blank', 'noopener,noreferrer');
                      }}
                    />
                  ) : isCiWorkflow && ciWorkflowPayload ? (
                    <CompetitiveIntelWorkflowView
                      markdown={ciWorkflowPayload.markdown}
                      workflow={ciWorkflowPayload.workflow}
                      discoveryQuery={ciWorkflowPayload.discoveryQuery}
                      discoveryTools={ciWorkflowPayload.discoveryTools}
                      status={ciWorkflowPayload.status}
                    />
                  ) : isCiReport ? (
                    <CompetitiveIntelReportMessage
                      content={message.content}
                      messageId={message.id}
                      copiedAll={ciCopiedMsgId === message.id}
                      copyAllFailed={ciCopyFailedMsgId === message.id}
                      onParsed={reportId => {
                        onSlimCiMessage?.(message.id, reportId);
                      }}
                      onCopiedAll={id => {
                        setCiCopyFailedMsgId(null);
                        setCiCopiedMsgId(id);
                        window.setTimeout(() => {
                          setCiCopiedMsgId(current =>
                            current === id ? null : current
                          );
                        }, 2000);
                      }}
                      onCopyAllFailed={id => {
                        setCiCopiedMsgId(null);
                        setCiCopyFailedMsgId(id);
                        window.setTimeout(() => {
                          setCiCopyFailedMsgId(current =>
                            current === id ? null : current
                          );
                        }, 2000);
                      }}
                    />
                  ) : isResearchBrief && useMarkdownHtml ? (
                    <ResearchBriefView
                      markdown={displayContent}
                      onSectionCopy={section => {
                        void handleSectionCopy(section);
                      }}
                      copiedSectionId={copiedSectionId}
                      sectionCopyFailedId={sectionCopyFailedId}
                      onRegenerateSection={onRegenerateBriefSection}
                      pinned={
                        parseResearchBriefToolMessage(message.content)
                          ?.briefId === pinnedBriefId && Boolean(briefPinned)
                      }
                      onTogglePin={
                        onToggleBriefPin
                          ? () => onToggleBriefPin(message.content)
                          : undefined
                      }
                    />
                  ) : useMarkdownHtml && htmlContent ? (
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
                <div className="message-action-row">
                  {!busy && message.content && (
                    <button
                      className="copy-btn"
                      type="button"
                      onClick={() => void handleCopy(message.id, message.content)}
                      title={
                        copiedMsgId === message.id
                          ? 'Copied!'
                          : copyFailedMsgId === message.id
                            ? 'Copy failed'
                            : 'Copy'
                      }
                      aria-label="Copy response"
                    >
                      {copiedMsgId === message.id ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      )}
                    </button>
                  )}
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
                      assistantReply={
                        isCiReport ? displayContent : message.content
                      }
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

      {busy && activeToolLabel && (
        <ActiveToolIndicator label={activeToolLabel} />
      )}
    </div>
  );
}
