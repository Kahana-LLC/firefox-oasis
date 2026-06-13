import { h } from 'preact';
import type { ConfirmationData } from '../types';
import { markdownToSafeHtml } from '../utils/copyToClipboard';

const OVERLAY_STYLE = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000,
} as const;

const MODAL_STYLE = {
  background: 'var(--surface-page)',
  borderRadius: '12px',
  padding: '24px',
  maxWidth: '400px',
  width: '90%',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
  textAlign: 'center',
} as const;

const CI_MODAL_STYLE = {
  ...MODAL_STYLE,
  maxWidth: '520px',
  textAlign: 'left',
} as const;

const SUBTITLE_STYLE = {
  margin: '0 0 12px 0',
  fontSize: '13px',
  color: 'var(--text-body)',
  lineHeight: 1.45,
} as const;

const SHIELD_WRAP_STYLE = {
  width: '48px',
  height: '48px',
  background: 'var(--primary-50)',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto 16px auto',
} as const;

const TITLE_STYLE = {
  margin: '0 0 8px 0',
  fontSize: '18px',
  fontWeight: 600,
  color: 'var(--text-headings)',
} as const;

const DESC_SCROLL_STYLE = {
  margin: '0 0 16px 0',
  fontSize: '14px',
  color: 'var(--text-body)',
  maxHeight: '240px',
  overflowY: 'auto',
  textAlign: 'left',
} as const;

const COMMAND_STYLE = {
  background: 'var(--primary-50)',
  borderRadius: '8px',
  padding: '8px 12px',
  marginBottom: '20px',
  fontSize: '13px',
  color: 'var(--header-badge-text)',
} as const;

const CANCEL_BTN_STYLE = {
  flex: 1,
  padding: '12px 16px',
  border: '1px solid var(--dropdown-border-color)',
  borderRadius: '8px',
  background: 'var(--surface-page)',
  color: 'var(--text-headings)',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
} as const;

const APPROVE_BTN_STYLE = {
  flex: 1,
  padding: '12px 16px',
  border: 'none',
  borderRadius: '8px',
  background: 'var(--primary-green)',
  color: 'var(--auth-on-primary)',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
} as const;

const CONFIRMATION_MARKDOWN_CHAR_LIMIT = 6000;

export function ConfirmationModal({
  data,
  onConfirm,
  onCancel,
}: {
  data: ConfirmationData;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isCompetitiveIntel = data.command === 'run_competitive_intel';
  const title = isCompetitiveIntel
    ? 'Review competitor tiers'
    : 'Confirm Action';
  const approveLabel = isCompetitiveIntel
    ? 'Open enrichment tabs'
    : 'Approve';
  const cancelLabel = isCompetitiveIntel ? 'Keep reviewing' : 'Cancel';
  const descHtml =
    data.description.length <= CONFIRMATION_MARKDOWN_CHAR_LIMIT
      ? markdownToSafeHtml(data.description)
      : '';

  return (
    <div className="confirmation-overlay" style={OVERLAY_STYLE}>
      <div
        className={`confirmation-modal${isCompetitiveIntel ? ' ci-confirmation-modal' : ''}`}
        style={isCompetitiveIntel ? CI_MODAL_STYLE : MODAL_STYLE}
      >
        <div style={isCompetitiveIntel ? { ...SHIELD_WRAP_STYLE, margin: '0 0 16px 0' } : SHIELD_WRAP_STYLE}>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--primary-green)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>

        <h3 style={{ ...TITLE_STYLE, textAlign: isCompetitiveIntel ? 'left' : 'center' }}>
          {title}
        </h3>

        {isCompetitiveIntel ? (
          <p style={SUBTITLE_STYLE}>
            Oasis grouped companies from your AI discovery tabs. Accept to open G2 and
            company-site search tabs, or cancel to keep reviewing in chat.
          </p>
        ) : null}

        {descHtml ? (
          <div
            className={`markdown-body${isCompetitiveIntel ? ' ci-confirmation-markdown' : ''}`}
            style={DESC_SCROLL_STYLE}
            dangerouslySetInnerHTML={{ __html: descHtml }}
          />
        ) : (
          <p style={DESC_SCROLL_STYLE}>{data.description}</p>
        )}

        {!isCompetitiveIntel ? (
          <div style={COMMAND_STYLE}>Command: {data.command}</div>
        ) : null}

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={onCancel} style={CANCEL_BTN_STYLE}>
            {cancelLabel}
          </button>
          <button onClick={onConfirm} style={APPROVE_BTN_STYLE}>
            {approveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
