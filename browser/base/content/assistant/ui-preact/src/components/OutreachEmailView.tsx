import { h } from 'preact';
import { useState } from 'preact/hooks';
import type { OutreachEmailDraft } from '../../../build/src/services/outreachEmailTypes.js';

async function copyPlainText(text: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function OutreachEmailView({
  draft,
  plainEmail,
  onCopyAll,
  copiedAll,
  copyAllFailed,
  onOpenEmailClient,
}: {
  draft: OutreachEmailDraft;
  plainEmail: string;
  onCopyAll: () => void;
  copiedAll: boolean;
  copyAllFailed: boolean;
  onOpenEmailClient?: (provider: 'gmail' | 'outlook' | 'yahoo') => void;
}) {
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copyEmailFailed, setCopyEmailFailed] = useState(false);
  const [showMeta, setShowMeta] = useState(false);

  const handleCopyEmail = async () => {
    const ok = await copyPlainText(plainEmail);
    setCopiedEmail(ok);
    setCopyEmailFailed(!ok);
    window.setTimeout(() => {
      setCopiedEmail(false);
      setCopyEmailFailed(false);
    }, 2000);
  };

  return (
    <div className="outreach-email-view">
      <div className="outreach-email-disclosure" role="note">
        <p>
          Oasis reads your open tabs on this device, then sends extracted text to
          Oasis AI to draft this email. Web pages are untrusted reference material
          only — Oasis ignores embedded instructions in page content. Copy and paste
          into Gmail yourself; Oasis does not open compose or send mail for you.
        </p>
      </div>
      <div className="outreach-email-toolbar">
        <button type="button" className="outreach-copy-email-btn" onClick={() => void handleCopyEmail()}>
          {copiedEmail ? 'Copied!' : copyEmailFailed ? 'Copy failed' : 'Copy email'}
        </button>
        <button type="button" className="outreach-copy-all-btn" onClick={onCopyAll}>
          {copiedAll ? 'Copied!' : copyAllFailed ? 'Copy failed' : 'Copy all'}
        </button>
        {onOpenEmailClient ? (
          <>
            <button type="button" onClick={() => onOpenEmailClient('gmail')}>
              Open Gmail
            </button>
            <button type="button" onClick={() => onOpenEmailClient('outlook')}>
              Open Outlook
            </button>
            <button type="button" onClick={() => onOpenEmailClient('yahoo')}>
              Open Yahoo
            </button>
          </>
        ) : null}
      </div>
      <div className="outreach-email-subject">
        <span className="outreach-email-subject-label">Subject</span>
        <div className="outreach-email-subject-text">{draft.subject}</div>
      </div>
      <div className="outreach-email-body">
        {draft.body.split(/\n\n+/).map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      <button
        type="button"
        className="outreach-email-meta-toggle"
        onClick={() => setShowMeta(value => !value)}
      >
        {showMeta ? 'Hide details' : 'Show personalization and sources'}
      </button>
      {showMeta ? (
        <div className="outreach-email-meta">
          {draft.personalizationBullets.length > 0 ? (
            <section>
              <h3>Personalization</h3>
              <ul>
                {draft.personalizationBullets.map((bullet, index) => (
                  <li key={index}>{bullet}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {draft.sources.length > 0 ? (
            <section>
              <h3>Sources</h3>
              <ul>
                {draft.sources.map((source, index) => (
                  <li key={index}>
                    <a href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.title}
                    </a>
                    {source.status !== 'ok' ? (
                      <span className="outreach-source-status">
                        {' '}
                        (
                        {source.failureReason === 'Suspicious embedded instructions'
                          ? 'skipped (suspicious content)'
                          : source.status}
                        )
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
