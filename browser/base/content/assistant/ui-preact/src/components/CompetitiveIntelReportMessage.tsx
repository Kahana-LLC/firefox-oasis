import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  hasCompetitiveIntelMarker,
  parseCompetitiveIntelToolMessage,
  type CompetitiveIntelToolPayload,
} from '../../../build/src/utils/competitiveIntelRequest.js';
import { copyMarkdownToClipboard, textForClipboard } from '../utils/copyToClipboard';
import { CompetitiveIntelReportView } from './CompetitiveIntelReportView';

type ParsedCiReport = {
  payload: CompetitiveIntelToolPayload;
  displayContent: string;
};

type CompetitiveIntelReportMessageProps = {
  content: string;
  messageId: string;
  copiedAll: boolean;
  copyAllFailed: boolean;
  onCopiedAll: (messageId: string) => void;
  onCopyAllFailed: (messageId: string) => void;
  onParsed?: (reportId: string) => void;
};

export function CompetitiveIntelReportMessage({
  content,
  messageId,
  copiedAll,
  copyAllFailed,
  onCopiedAll,
  onCopyAllFailed,
  onParsed,
}: CompetitiveIntelReportMessageProps) {
  const [parsed, setParsed] = useState<ParsedCiReport | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );

  useEffect(() => {
    let cancelled = false;
    const parse = () => {
      if (cancelled) {
        return;
      }
      const payload = parseCompetitiveIntelToolMessage(content);
      if (payload) {
        setParsed({
          payload,
          displayContent: textForClipboard(content),
        });
        setLoadState('ready');
        if (payload.reportId) {
          onParsed?.(payload.reportId);
        }
        return;
      }
      if (hasCompetitiveIntelMarker(content)) {
        setLoadState('error');
      }
    };
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(parse, { timeout: 300 });
      return () => {
        cancelled = true;
        cancelIdleCallback(id);
      };
    }
    const timeoutId = window.setTimeout(parse, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [content, onParsed]);

  if (loadState === 'error' && !parsed) {
    return (
      <div className="ci-report-load-error" role="alert">
        <p>The report was generated but could not be loaded in the sidebar.</p>
        <p>
          Say <strong>regenerate report</strong> to try again, or refresh the
          Oasis panel.
        </p>
      </div>
    );
  }

  if (!parsed) {
    return (
      <div className="ci-report-loading" role="status" aria-live="polite">
        <span className="ci-report-loading-spinner" aria-hidden />
        Loading report…
      </div>
    );
  }

  return (
    <CompetitiveIntelReportView
      markdown={parsed.displayContent}
      report={parsed.payload.report}
      industry={parsed.payload.report.industry}
      reportMode={parsed.payload.reportMode}
      budgetNote={parsed.payload.budgetNote}
      copiedAll={copiedAll}
      copyAllFailed={copyAllFailed}
      onCopyAll={() => {
        void copyMarkdownToClipboard(parsed.displayContent).then(ok => {
          if (ok) {
            onCopiedAll(messageId);
            return;
          }
          onCopyAllFailed(messageId);
        });
      }}
    />
  );
}
