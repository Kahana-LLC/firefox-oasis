import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { markdownToSafeHtml } from '../utils/copyToClipboard';
import {
  splitMarkdownAtH2,
  type MarkdownSection,
} from '../utils/markdownSectionSplit';

function MarkdownHtml({
  markdown,
  className = 'markdown-body',
}: {
  markdown: string;
  className?: string;
}) {
  const html = markdownToSafeHtml(markdown);
  if (!html) {
    return (
      <div className={className} style={{ whiteSpace: 'pre-wrap' }}>
        {markdown}
      </div>
    );
  }
  return (
    <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

function CopyButton({
  copied,
  failed,
  label,
  onClick,
}: {
  copied: boolean;
  failed: boolean;
  label: string;
  onClick: () => void;
}) {
  const title = copied ? 'Copied!' : failed ? 'Copy failed' : 'Copy';
  return (
    <button
      className="copy-btn"
      type="button"
      onClick={onClick}
      title={title}
      aria-label={label}
    >
      {copied ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

const LS_DISCLOSURE = 'oasis.researchBrief.disclosureSeen';

const SECTION_REGENERATE_ID: Record<string, string> = {
  'executive summary': 'executiveSummary',
  'suggested outline': 'outline',
  themes: 'themes',
  sources: 'sources',
  'gaps and contradictions': 'gapsAndContradictions',
};

export function ResearchBriefView({
  markdown,
  onSectionCopy,
  copiedSectionId,
  sectionCopyFailedId,
  onRegenerateSection,
  pinned,
  onTogglePin,
}: {
  markdown: string;
  onSectionCopy: (section: MarkdownSection) => void;
  copiedSectionId: string | null;
  sectionCopyFailedId: string | null;
  onRegenerateSection?: (sectionId: string) => void;
  pinned?: boolean;
  onTogglePin?: () => void;
}) {
  const { preamble, sections } = splitMarkdownAtH2(markdown);
  const [showDisclosure, setShowDisclosure] = useState(false);

  useEffect(() => {
    try {
      setShowDisclosure(localStorage.getItem(LS_DISCLOSURE) !== '1');
    } catch {
      setShowDisclosure(true);
    }
  }, []);

  const dismissDisclosure = () => {
    try {
      localStorage.setItem(LS_DISCLOSURE, '1');
    } catch {
      void 0;
    }
    setShowDisclosure(false);
  };

  return (
    <div className="research-brief-view">
      {showDisclosure ? (
        <div className="research-brief-disclosure" role="note">
          <p>
            Oasis reads your open tabs on this device, then sends extracted text
            to Oasis AI to build the brief. Nothing is used to train public models
            without your consent.
          </p>
          <button type="button" onClick={dismissDisclosure}>
            Got it
          </button>
        </div>
      ) : null}
      {onTogglePin ? (
        <div className="research-brief-toolbar">
          <button type="button" className="brief-pin-btn" onClick={onTogglePin}>
            {pinned ? 'Pinned' : 'Pin brief'}
          </button>
        </div>
      ) : null}
      {preamble ? <MarkdownHtml markdown={preamble} /> : null}
      {sections.map(section => {
        const copied = copiedSectionId === section.id;
        const failed = sectionCopyFailedId === section.id;
        return (
          <section key={section.id} className="brief-section">
            <div className="brief-section-header">
              <span className="brief-section-title">{section.title}</span>
              <div className="brief-section-actions">
                {onRegenerateSection &&
                SECTION_REGENERATE_ID[section.title.toLowerCase()] ? (
                  <button
                    type="button"
                    className="brief-regenerate-btn"
                    onClick={() =>
                      onRegenerateSection(
                        SECTION_REGENERATE_ID[section.title.toLowerCase()]
                      )
                    }
                  >
                    Regenerate
                  </button>
                ) : null}
                <CopyButton
                  copied={copied}
                  failed={failed}
                  label={`Copy section: ${section.title}`}
                  onClick={() => onSectionCopy(section)}
                />
              </div>
            </div>
            <MarkdownHtml markdown={section.markdown} />
          </section>
        );
      })}
    </div>
  );
}
