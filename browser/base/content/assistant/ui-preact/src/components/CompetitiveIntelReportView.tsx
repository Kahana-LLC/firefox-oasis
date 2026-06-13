import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { CompetitiveIntelReport } from '../../../build/src/services/competitiveIntelTypes.js';
import {
  comparisonMatrixToMarkdown,
  comparisonMatrixToTsv,
} from '../../../build/src/utils/competitiveIntelArtifacts.js';
import { OASIS_EVENT_ASSISTANT_SUBMIT } from '../../../shared/contracts.js';
import { markdownToSafeHtml } from '../utils/copyToClipboard';
import {
  downloadTextFile,
  openPrintFriendlyWindow,
} from '../utils/downloadTextFile';

function confidenceClass(level: string): string {
  const normalized = String(level || '').toLowerCase();
  if (normalized === 'high') return 'ci-confidence-high';
  if (normalized === 'low') return 'ci-confidence-low';
  return 'ci-confidence-medium';
}

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

function submitWorkflowPrompt(prompt: string, displayLabel: string): void {
  window.dispatchEvent(
    new CustomEvent(OASIS_EVENT_ASSISTANT_SUBMIT, {
      detail: { prompt, hideUserMessage: true, displayLabel },
    })
  );
}

export function CompetitiveIntelReportView({
  markdown,
  report,
  industry,
  reportMode,
  budgetNote,
  onCopyAll,
  copiedAll,
  copyAllFailed,
}: {
  markdown: string;
  report: CompetitiveIntelReport;
  industry?: string;
  reportMode?: 'full' | 'compact';
  budgetNote?: string;
  onCopyAll: () => void;
  copiedAll: boolean;
  copyAllFailed: boolean;
}) {
  const [expandedCell, setExpandedCell] = useState<string | null>(null);
  const [copiedMatrix, setCopiedMatrix] = useState<'markdown' | 'tsv' | null>(
    null
  );
  const [matrixCopyFailed, setMatrixCopyFailed] = useState(false);
  const [html, setHtml] = useState('');
  const matrix = report.comparisonMatrix;
  const matrixMarkdown = comparisonMatrixToMarkdown(report);
  const matrixTsv = comparisonMatrixToTsv(report);

  useEffect(() => {
    let cancelled = false;
    const render = () => {
      if (cancelled) {
        return;
      }
      setHtml(markdownToSafeHtml(markdown));
    };
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(render, { timeout: 300 });
      return () => {
        cancelled = true;
        cancelIdleCallback(id);
      };
    }
    const timeoutId = window.setTimeout(render, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [markdown]);

  const handleCopyMatrix = async (format: 'markdown' | 'tsv') => {
    const text = format === 'markdown' ? matrixMarkdown : matrixTsv;
    if (!text) {
      return;
    }
    const ok = await copyPlainText(text);
    setCopiedMatrix(ok ? format : null);
    setMatrixCopyFailed(!ok);
    window.setTimeout(() => {
      setCopiedMatrix(null);
      setMatrixCopyFailed(false);
    }, 2000);
  };

  const handleDownloadReport = () => {
    const slug = String(industry || report.industry || 'report')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    downloadTextFile(
      `competitive-intel-${slug || 'report'}.md`,
      markdown,
      'text/markdown;charset=utf-8'
    );
  };

  const handlePrintReport = () => {
    const title = `Competitive intelligence: ${industry || report.industry || 'report'}`;
    openPrintFriendlyWindow(title, html || `<pre>${markdown}</pre>`);
  };

  return (
    <div className="ci-report-view">
      {reportMode === 'compact' && budgetNote ? (
        <div className="ci-report-compact-banner" role="note">
          {budgetNote}
        </div>
      ) : null}
      <div className="ci-report-toolbar">
        <span
          className={`ci-confidence-badge ${confidenceClass(report.overallConfidence)}`}
        >
          Overall confidence: {report.overallConfidence}
        </span>
        <button type="button" className="ci-copy-all-btn" onClick={onCopyAll}>
          {copiedAll ? 'Copied!' : copyAllFailed ? 'Copy failed' : 'Copy markdown'}
        </button>
        {matrixMarkdown ? (
          <button
            type="button"
            onClick={() => void handleCopyMatrix('markdown')}
          >
            {copiedMatrix === 'markdown'
              ? 'Copied!'
              : matrixCopyFailed
                ? 'Copy failed'
                : 'Copy matrix (MD)'}
          </button>
        ) : null}
        {matrixTsv ? (
          <button type="button" onClick={() => void handleCopyMatrix('tsv')}>
            {copiedMatrix === 'tsv' ? 'Copied!' : 'Copy matrix (TSV)'}
          </button>
        ) : null}
        <button type="button" onClick={handleDownloadReport}>
          Download .md
        </button>
        <button type="button" onClick={handlePrintReport}>
          Save as PDF
        </button>
      </div>

      <div className="ci-report-expand-actions">
        <span className="ci-workflow-panel-label">Optional next steps</span>
        <div className="ci-artifact-toolbar">
          <button
            type="button"
            onClick={() =>
              submitWorkflowPrompt(
                'expand with external AI',
                'Expand with external AI'
              )
            }
          >
            Expand with external AI
          </button>
          <button
            type="button"
            onClick={() =>
              submitWorkflowPrompt(
                'add review enrichment',
                'Add review enrichment'
              )
            }
          >
            Add review enrichment
          </button>
          <button
            type="button"
            onClick={() =>
              submitWorkflowPrompt('regenerate report', 'Regenerate report')
            }
          >
            Regenerate report
          </button>
        </div>
      </div>

      <p className="ci-confidence-rationale">{report.confidenceRationale}</p>

      {html ? (
        <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div className="ci-report-loading" role="status" aria-live="polite">
          <span className="ci-report-loading-spinner" aria-hidden />
          Rendering report…
        </div>
      )}

      {matrix?.dimensions?.length && matrix.cells?.length ? (
        <div className="ci-comparison-matrix">
          <h3>Comparison matrix</h3>
          <table>
            <thead>
              <tr>
                <th>Competitor</th>
                {matrix.dimensions.map(dimension => (
                  <th key={dimension}>{dimension}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...new Set(matrix.cells.map(cell => cell.competitor))].map(
                competitor => (
                  <tr key={competitor}>
                    <td>{competitor}</td>
                    {matrix.dimensions.map(dimension => {
                      const cell = matrix.cells.find(
                        item =>
                          item.competitor === competitor &&
                          item.dimension === dimension
                      );
                      const cellKey = `${competitor}::${dimension}`;
                      return (
                        <td key={cellKey}>
                          {cell ? (
                            <button
                              type="button"
                              className="ci-matrix-cell-btn"
                              onClick={() =>
                                setExpandedCell(
                                  expandedCell === cellKey ? null : cellKey
                                )
                              }
                            >
                              {cell.assessment}
                              <span
                                className={`ci-confidence-badge ${confidenceClass(cell.confidence)}`}
                              >
                                {cell.confidence}
                              </span>
                            </button>
                          ) : (
                            '—'
                          )}
                          {expandedCell === cellKey && cell ? (
                            <div className="ci-matrix-cell-evidence">
                              {cell.sourceUrls.map(url => (
                                <a
                                  key={url}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {url}
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {report.sources?.length ? (
        <div className="ci-report-sources">
          <h3>Sources</h3>
          <ul>
            {report.sources.map(source => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.title}
                </a>
                <span className={`ci-source-status ci-source-${source.status}`}>
                  {source.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
