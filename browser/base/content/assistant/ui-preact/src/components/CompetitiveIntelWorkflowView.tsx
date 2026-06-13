import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type {
  CompetitiveCompany,
  CompetitiveIntelWorkflowState,
  EnrichmentProfile,
} from '../../../build/src/services/competitiveIntelTypes.js';
import {
  tierTableToCsv,
  tierTableToMarkdown,
  tierTableToTsv,
} from '../../../build/src/utils/competitiveIntelArtifacts.js';
import {
  CI_WORKFLOW_CONTINUE_SENTINEL,
  CI_REPORT_COMPACT_SENTINEL,
} from '../../../build/src/utils/competitiveIntelResume.js';
import {
  classifyTokenBudget,
  estimateCiTokensFromPlan,
  type CiTokenBudgetTier,
} from '../../../build/src/utils/ciTokenBudget.js';
import { OASIS_EVENT_ASSISTANT_SUBMIT } from '../../../shared/contracts.js';
import { pickEnrichmentSlots } from '../../../build/src/utils/competitiveIntelCompanyUrls.js';
import { markdownToSafeHtml } from '../utils/copyToClipboard';
import { downloadTextFile } from '../utils/downloadTextFile';
import type { OasisWindow } from '../types';

const oasisWindow: OasisWindow = window;

const DEFAULT_STEPS = [
  { id: 'intro', label: 'Intro' },
  { id: 'pool', label: 'Pool' },
  { id: 'tiers', label: 'Tiers' },
  { id: 'enrich', label: 'Enrich' },
  { id: 'groups', label: 'Groups' },
  { id: 'report', label: 'Report' },
] as const;

const TIER_ORDER = ['high', 'medium', 'low', 'adjacent'] as const;

type CopyFormat = 'markdown' | 'tsv' | 'csv';

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

function visibleSteps(step: string) {
  if (step === 'expand' || step === 'discovery') {
    return [
      ...DEFAULT_STEPS.slice(0, 5),
      { id: 'expand', label: 'Expand' },
      DEFAULT_STEPS[5],
    ];
  }
  return [...DEFAULT_STEPS];
}

function stepIndex(step: string): number {
  const steps = visibleSteps(step);
  const idx = steps.findIndex(item => item.id === step);
  if (idx >= 0) {
    return idx;
  }
  if (step === 'done') {
    return steps.length - 1;
  }
  return 0;
}

function tierLabel(tier: string): string {
  const normalized = String(tier || '').trim().toLowerCase();
  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : 'Medium';
}

function groupCompaniesByTier(
  companies: CompetitiveCompany[]
): Array<{ tier: string; companies: CompetitiveCompany[] }> {
  return TIER_ORDER.map(tier => ({
    tier,
    companies: companies.filter(company => company.tier === tier),
  })).filter(group => group.companies.length > 0);
}

function stepCallout(step: string, status: string): string | null {
  if (
    (step === 'discovery' || step === 'expand') &&
    status === 'awaiting_user'
  ) {
    return 'Run the discovery query in each AI tool tab, then continue when all have answered.';
  }
  if (step === 'tiers' && status === 'awaiting_continue') {
    return 'Review the proposed tiers and planned enrichment (homepage + Wikipedia). Accept to open tabs, move companies between tiers, or fix URLs in chat.';
  }
  if (step === 'enrich' && status === 'awaiting_continue') {
    return 'Enrichment tabs are open. Review the competitor tiers below, then continue to organize tabs into groups.';
  }
  if (step === 'report' && status === 'awaiting_continue') {
    return 'Tab groups are ready. This report reads your CI — High / Medium / Low / Adjacent groups (same as research brief).';
  }
  return null;
}

function enrichmentPreview(
  company: CompetitiveCompany,
  profile: EnrichmentProfile
): string {
  const slots = pickEnrichmentSlots(company, undefined, profile);
  if (slots.length === 0) {
    return 'Wikipedia search';
  }
  return slots.map(slot => slot.label).join(', ');
}

function tierArtifactText(
  companies: CompetitiveCompany[],
  format: CopyFormat
): string {
  if (format === 'markdown') {
    return tierTableToMarkdown(companies);
  }
  if (format === 'tsv') {
    return tierTableToTsv(companies);
  }
  return tierTableToCsv(companies);
}

function tokenEstimateTierLabel(tier: CiTokenBudgetTier): string {
  if (tier === 'comfortable') {
    return 'Within allowance';
  }
  if (tier === 'tight') {
    return 'Tight budget';
  }
  return 'Over full-report budget';
}

function buildTokenEstimateCopy(
  workflow: CompetitiveIntelWorkflowState,
  remaining: number
): { tier: CiTokenBudgetTier; lines: string[] } | null {
  if (workflow.step !== 'report' || remaining <= 0) {
    return null;
  }
  const { min, max, tabCount } = estimateCiTokensFromPlan(workflow.enrichmentPlan);
  const tier = classifyTokenBudget(max, remaining);
  const range =
    min === max
      ? `~${min.toLocaleString()}`
      : `~${min.toLocaleString()}–${max.toLocaleString()}`;
  const lines = [
    `Estimated cost: ${range} tokens (${tabCount} enrichment tab${tabCount === 1 ? '' : 's'})`,
    `Your remaining: ${remaining.toLocaleString()} tokens`,
  ];
  if (tier === 'comfortable') {
    lines.push('A full report should fit comfortably.');
  } else if (tier === 'tight') {
    lines.push('A full report may use most of your allowance.');
  } else {
    lines.push('A compact report should fit; a full report may exceed your allowance.');
  }
  return { tier, lines };
}

function submitWorkflowPrompt(
  prompt: string,
  displayLabel: string
): void {
  window.dispatchEvent(
    new CustomEvent(OASIS_EVENT_ASSISTANT_SUBMIT, {
      detail: { prompt, hideUserMessage: true, displayLabel },
    })
  );
}

export function CompetitiveIntelWorkflowView({
  markdown,
  workflow,
  discoveryQuery,
  discoveryTools,
  status,
}: {
  markdown: string;
  workflow: CompetitiveIntelWorkflowState;
  discoveryQuery: string;
  discoveryTools: string[];
  status: 'awaiting_continue' | 'in_progress' | 'awaiting_user' | 'complete';
}) {
  const [copiedQuery, setCopiedQuery] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState<CopyFormat | null>(null);
  const [copyFormatFailed, setCopyFormatFailed] = useState(false);
  const [tokenRemaining, setTokenRemaining] = useState<number | null>(null);
  const html = markdownToSafeHtml(markdown);
  const steps = visibleSteps(workflow.step);
  const currentIdx = stepIndex(workflow.step);
  const callout = stepCallout(workflow.step, status);
  const tierGroups = groupCompaniesByTier(workflow.companies);
  const enrichmentProfile = workflow.enrichmentProfile || 'oasis_first';
  const showTierGroups =
    workflow.companies.length > 0 &&
    (workflow.step === 'tiers' ||
      workflow.step === 'enrich' ||
      workflow.step === 'groups' ||
      workflow.step === 'report');
  const showDiscoveryPanel =
    workflow.step === 'expand' || workflow.step === 'discovery';
  const tokenEstimate =
    tokenRemaining != null
      ? buildTokenEstimateCopy(workflow, tokenRemaining)
      : null;

  useEffect(() => {
    if (workflow.step !== 'report') {
      return;
    }
    let cancelled = false;
    const loadRemaining = async () => {
      const sync = oasisWindow.subscriptionService?.getDailyTokenUsageForDisplay?.();
      if (sync && !cancelled) {
        setTokenRemaining(sync.remaining);
      }
      const asyncData = await oasisWindow.subscriptionService?.getUsageBarData?.();
      if (!cancelled && asyncData) {
        setTokenRemaining(asyncData.remaining);
      }
    };
    void loadRemaining();
    return () => {
      cancelled = true;
    };
  }, [workflow.step, workflow.enrichmentPlan.length]);

  const handleCopyQuery = async () => {
    const ok = await copyPlainText(discoveryQuery);
    setCopiedQuery(ok);
    setCopyFailed(!ok);
    window.setTimeout(() => {
      setCopiedQuery(false);
      setCopyFailed(false);
    }, 2000);
  };

  const handleCopyTiers = async (format: CopyFormat) => {
    const ok = await copyPlainText(
      tierArtifactText(workflow.companies, format)
    );
    setCopiedFormat(ok ? format : null);
    setCopyFormatFailed(!ok);
    window.setTimeout(() => {
      setCopiedFormat(null);
      setCopyFormatFailed(false);
    }, 2000);
  };

  const handleDownloadTiers = (format: 'md' | 'csv') => {
    const content =
      format === 'md'
        ? tierTableToMarkdown(workflow.companies)
        : tierTableToCsv(workflow.companies);
    const slug = workflow.industry
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    downloadTextFile(
      `competitive-intel-tiers-${slug || 'export'}.${format}`,
      content,
      format === 'csv' ? 'text/csv;charset=utf-8' : 'text/markdown;charset=utf-8'
    );
  };

  const handleContinue = () => {
    const prompt =
      workflow.step === 'tiers' ? 'yes' : CI_WORKFLOW_CONTINUE_SENTINEL;
    const displayLabel =
      workflow.step === 'discovery' || workflow.step === 'expand'
        ? "I've run the queries"
        : workflow.step === 'tiers'
          ? 'Accept tiers & open enrichment tabs'
          : workflow.step === 'enrich'
            ? 'Create tab groups'
            : workflow.step === 'report'
              ? 'Generate full report'
              : 'Continue';
    submitWorkflowPrompt(prompt, displayLabel);
  };

  const handleCompactReport = () => {
    submitWorkflowPrompt(CI_REPORT_COMPACT_SENTINEL, 'Generate compact report');
  };

  const continueLabel =
    workflow.step === 'discovery' || workflow.step === 'expand'
      ? "I've run the queries"
      : workflow.step === 'tiers'
        ? 'Accept tiers & open enrichment tabs'
        : workflow.step === 'enrich'
          ? 'Create tab groups'
          : workflow.step === 'report'
            ? 'Generate full report'
            : 'Continue';
  const compactPrimary =
    tokenEstimate?.tier === 'tight' || tokenEstimate?.tier === 'over_budget';

  return (
    <div className="ci-workflow-view">
      <div className="ci-workflow-header">
        <div className="ci-workflow-title">Competitive intelligence workflow</div>
        <div className="ci-workflow-industry">{workflow.industry}</div>
      </div>

      <div className="ci-workflow-stepper" role="list" aria-label="Workflow steps">
        {steps.map((step, index) => (
          <div
            key={step.id}
            role="listitem"
            className={`ci-workflow-step${
              index === currentIdx ? ' ci-workflow-step-active' : ''
            }${index < currentIdx ? ' ci-workflow-step-done' : ''}`}
          >
            <span className="ci-workflow-step-label">{step.label}</span>
          </div>
        ))}
      </div>

      {callout ? <div className="ci-workflow-callout">{callout}</div> : null}

      {tokenEstimate ? (
        <div
          className={`ci-token-estimate ci-token-estimate-${tokenEstimate.tier}`}
          role="note"
        >
          <div className="ci-token-estimate-label">
            {tokenEstimateTierLabel(tokenEstimate.tier)}
          </div>
          {tokenEstimate.lines.map(line => (
            <div key={line} className="ci-token-estimate-line">
              {line}
            </div>
          ))}
        </div>
      ) : null}

      {!showTierGroups && html ? (
        <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
      ) : !showTierGroups ? (
        <div className="markdown-body" style={{ whiteSpace: 'pre-wrap' }}>
          {markdown}
        </div>
      ) : null}

      {showDiscoveryPanel ? (
        <div className="ci-workflow-discovery-panel">
          <div className="ci-workflow-discovery-tools">
            <span className="ci-workflow-panel-label">AI tools</span>
            <ul>
              {discoveryTools.map(tool => (
                <li key={tool}>{tool}</li>
              ))}
            </ul>
          </div>
          {discoveryQuery ? (
            <div className="ci-workflow-query">
              <span className="ci-workflow-panel-label">Discovery query</span>
              <pre className="ci-workflow-query-text">{discoveryQuery}</pre>
              <button type="button" onClick={() => void handleCopyQuery()}>
                {copiedQuery ? 'Copied!' : copyFailed ? 'Copy failed' : 'Copy query'}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {showTierGroups ? (
        <div className="ci-workflow-tier-groups">
          <div className="ci-workflow-tier-toolbar">
            <span className="ci-workflow-panel-label">Proposed tiers</span>
            <div className="ci-artifact-toolbar">
              <button
                type="button"
                onClick={() => void handleCopyTiers('markdown')}
              >
                {copiedFormat === 'markdown'
                  ? 'Copied!'
                  : copyFormatFailed
                    ? 'Copy failed'
                    : 'Copy markdown'}
              </button>
              <button type="button" onClick={() => void handleCopyTiers('tsv')}>
                {copiedFormat === 'tsv' ? 'Copied!' : 'Copy TSV'}
              </button>
              <button
                type="button"
                onClick={() => handleDownloadTiers('md')}
              >
                Download .md
              </button>
              <button
                type="button"
                onClick={() => handleDownloadTiers('csv')}
              >
                Download .csv
              </button>
            </div>
          </div>
          {tierGroups.map(group => (
            <div key={group.tier} className="ci-workflow-tier-section">
              <div className="ci-workflow-tier-heading">
                <span className={`ci-tier-badge ci-tier-${group.tier}`}>
                  {tierLabel(group.tier)}
                </span>
                <span className="ci-workflow-tier-count">
                  {group.companies.length} compan
                  {group.companies.length === 1 ? 'y' : 'ies'}
                </span>
              </div>
              <table className="ci-workflow-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Mentions</th>
                    {workflow.step === 'tiers' || workflow.step === 'enrich' ? (
                      <th>Enrichment</th>
                    ) : null}
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {group.companies.map(company => (
                    <tr key={company.normalizedName || company.name}>
                      <td>{company.name}</td>
                      <td>{company.mentionCount}</td>
                      {workflow.step === 'tiers' || workflow.step === 'enrich' ? (
                        <td className="ci-workflow-enrichment-preview">
                          {enrichmentPreview(company, enrichmentProfile)}
                        </td>
                      ) : null}
                      <td>{company.description || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : workflow.companies.length > 0 ? (
        <div className="ci-workflow-pool">
          <span className="ci-workflow-panel-label">Competitor pool</span>
          <table className="ci-workflow-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Tier</th>
                <th>Mentions</th>
              </tr>
            </thead>
            <tbody>
              {workflow.companies.map(company => (
                <tr key={company.normalizedName || company.name}>
                  <td>{company.name}</td>
                  <td>
                    <span className={`ci-tier-badge ci-tier-${company.tier}`}>
                      {tierLabel(company.tier)}
                    </span>
                  </td>
                  <td>{company.mentionCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {status === 'awaiting_user' || status === 'awaiting_continue' ? (
        <div className="ci-workflow-actions">
          {workflow.step === 'report' ? (
            <>
              <button
                type="button"
                className={`ci-workflow-continue-btn${
                  compactPrimary ? ' ci-workflow-secondary-btn' : ''
                }`}
                onClick={handleContinue}
              >
                Generate full report
              </button>
              <button
                type="button"
                className={`ci-workflow-continue-btn${
                  compactPrimary ? '' : ' ci-workflow-secondary-btn'
                }`}
                onClick={handleCompactReport}
              >
                Generate compact report
              </button>
            </>
          ) : (
            <button
              type="button"
              className="ci-workflow-continue-btn"
              onClick={handleContinue}
            >
              {continueLabel}
            </button>
          )}
          {workflow.step === 'tiers' ? (
            <p className="ci-workflow-action-hint">
              You can also use the <strong>Open enrichment tabs</strong> button in the
              confirmation dialog.
            </p>
          ) : workflow.step === 'enrich' || workflow.step === 'report' ? (
            <p className="ci-workflow-action-hint">
              {workflow.step === 'enrich'
                ? 'This organizes your enrichment tabs into tier groups before generating the report.'
                : 'Full reports use more tokens. Compact reports read your CI tier tab groups with shorter synthesis.'}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
