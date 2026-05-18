import { h } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { AuthState, OasisWindow, OnboardingStatus } from '../types';

const oasisWindow: OasisWindow = window;

const COLLAPSED_STORAGE_KEY = 'oasis.assistant.onboardingChecklistCollapsed';

function readCollapsedDefault(): boolean {
  try {
    const v = sessionStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (v === null) {
      return false;
    }
    return v === '1';
  } catch {
    return false;
  }
}

function persistCollapsed(collapsed: boolean) {
  try {
    sessionStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    void 0;
  }
}

function StepIcon({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className={
        done
          ? 'onboarding-checklist-step-icon onboarding-checklist-step-icon--done'
          : 'onboarding-checklist-step-icon'
      }
    >
      {done ? '\u2713' : ''}
    </span>
  );
}

const MIGRATION_BRAND_CHROME = 'chrome://browser/content/migration/brands/chrome.png';
const MIGRATION_BRAND_EDGE = 'chrome://browser/content/migration/brands/edge.png';
const MIGRATION_BRAND_SAFARI = 'chrome://browser/content/migration/brands/safari.png';
const MIGRATION_BRAND_BRAVE = 'chrome://browser/content/migration/brands/brave.png';

function ImportMigrationBrandHeaderLogos() {
  return (
    <span className="onboarding-import-brand-imgs onboarding-import-brand-imgs--header" aria-hidden="true">
      <img src={MIGRATION_BRAND_CHROME} width={16} height={16} alt="" decoding="async" />
      <img src={MIGRATION_BRAND_EDGE} width={16} height={16} alt="" decoding="async" />
      <img src={MIGRATION_BRAND_SAFARI} width={16} height={16} alt="" decoding="async" />
      <img src={MIGRATION_BRAND_BRAVE} width={16} height={16} alt="" decoding="async" />
    </span>
  );
}

function ImportPrivacyShield() {
  return (
    <svg
      className="onboarding-import-shield-svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ImportBrowserGlyph() {
  return (
    <svg
      className="onboarding-import-primary-btn-icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12 15V3m0 12l-4-4m4 4 4-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 21h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChecklistGlyph() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M9 11l3 3L22 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export type OnboardingNavigate = {
  goAuth: () => void;
  goChat: () => void;
  focusComposer: () => void;
  scrollToAuthPanel: () => void;
  snapToComposer: () => void;
};

export function OnboardingChecklist({
  auth,
  view,
  onNavigate,
  onCollapseRequest,
}: {
  auth: AuthState;
  view: 'auth' | 'chat';
  onNavigate: OnboardingNavigate;
  onCollapseRequest?: number;
}) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [collapsed, setCollapsed] = useState(readCollapsedDefault);
  const collapseRequestSeen = useRef(0);

  const refresh = useCallback(() => {
    const s = oasisWindow.assistantBridge?.getOnboardingStatus?.() ?? null;
    setStatus(s);
  }, []);

  useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, 2000);
    const onAuth = () => refresh();
    const onOb = () => refresh();
    window.addEventListener('oasis-auth-update', onAuth);
    window.addEventListener('oasis-onboarding-update', onOb);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('oasis-auth-update', onAuth);
      window.removeEventListener('oasis-onboarding-update', onOb);
    };
  }, [refresh]);

  useEffect(() => {
    if (onCollapseRequest == null || onCollapseRequest < 1) {
      return;
    }
    if (onCollapseRequest === collapseRequestSeen.current) {
      return;
    }
    collapseRequestSeen.current = onCollapseRequest;
    setCollapsed(true);
    persistCollapsed(true);
  }, [onCollapseRequest]);

  const importDone =
    status?.migrationCompleted || status?.importOptOut || false;
  const accountDone = !!auth.isAuthenticated;
  const firstAiDone = status?.firstAiTurnComplete || false;
  const allStepsComplete = importDone && accountDone && firstAiDone;

  useEffect(() => {
    if (!status?.guidedFlowEnabled || !allStepsComplete) {
      return;
    }
    oasisWindow.assistantBridge?.dismissOnboardingChecklist?.();
  }, [status?.guidedFlowEnabled, allStepsComplete]);

  if (!status?.guidedFlowEnabled) {
    return null;
  }

  if (status?.checklistDismissed) {
    return null;
  }

  if (allStepsComplete) {
    return null;
  }

  const total = 3;
  const doneCount =
    (importDone ? 1 : 0) + (accountDone ? 1 : 0) + (firstAiDone ? 1 : 0);
  const progressPct = (100 * doneCount) / total;

  const onImport = () => {
    oasisWindow.assistantBridge?.openImportBrowserData?.();
  };

  const expand = () => {
    setCollapsed(false);
    persistCollapsed(false);
  };

  const collapse = () => {
    setCollapsed(true);
    persistCollapsed(true);
  };

  if (collapsed) {
    return (
      <div className="assistant-onboarding-dock assistant-onboarding-dock--collapsed">
        <button
          type="button"
          className="onboarding-checklist-compact"
          onClick={expand}
          aria-expanded="false"
          aria-controls="oasis-onboarding-checklist-panel"
          title="Open onboarding checklist"
        >
          <div className="onboarding-checklist-compact-top">
            <span className="onboarding-checklist-compact-icon">
              <ChecklistGlyph />
            </span>
            <span className="onboarding-checklist-compact-title">Getting started</span>
            <span className="onboarding-checklist-compact-count">
              {doneCount}/{total}
            </span>
          </div>
          <div className="onboarding-checklist-compact-bar">
            <div
              className="onboarding-checklist-compact-bar-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </button>
      </div>
    );
  }

  return (
    <div
      id="oasis-onboarding-checklist-panel"
      className="assistant-onboarding-dock onboarding-checklist-shell"
    >
      <div className="onboarding-checklist-panel-head">
        <span className="onboarding-checklist-panel-title">Getting started</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="onboarding-checklist-panel-count">
            {doneCount}/{total}
          </span>
          <button
            type="button"
            className="onboarding-checklist-collapse-btn"
            onClick={collapse}
            aria-expanded="true"
            title="Collapse checklist"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
      <div className="onboarding-checklist-progress">
        <div
          className="onboarding-checklist-progress-fill"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div className="onboarding-checklist-nested-card">
          {importDone ? (
            <div className="onboarding-import-step-header onboarding-import-step-header--done">
              <StepIcon done />
              <span className="onboarding-import-done-label">Browser data imported</span>
            </div>
          ) : (
            <>
              <div className="onboarding-import-step-header">
                <StepIcon done={false} />
                <div className="onboarding-import-card-head">
                  <span className="onboarding-import-card-from">Import your data from</span>
                  <ImportMigrationBrandHeaderLogos />
                </div>
              </div>
              <div className="onboarding-import-expand">
                <span className="assistant-sr-only">
                  Optional import from Chrome, Edge, Safari, or Brave. Runs on this device only; Oasis does not receive your data.
                </span>
                <div className="onboarding-import-callout">
                  <span className="onboarding-import-callout-shield">
                    <ImportPrivacyShield />
                  </span>
                  <div className="onboarding-import-callout-main">
                    <p className="onboarding-import-callout-text">
                      Import runs in your browser on this device only. Oasis does not receive a copy of your data.
                    </p>
                    <a
                      href="about:preferences#general"
                      className="onboarding-import-learn-more"
                      onClick={e => {
                        e.preventDefault();
                        oasisWindow.assistantBridge?.openTab?.('about:preferences#general');
                      }}
                    >
                      Learn more about importing
                    </a>
                  </div>
                </div>
                <div className="onboarding-import-actions">
                  <button
                    type="button"
                    className="onboarding-import-primary-btn onboarding-import-primary-btn--outline"
                    title="Open browser import"
                    onClick={e => {
                      e.stopPropagation();
                      onImport();
                    }}
                  >
                    <ImportBrowserGlyph />
                    Import browser data
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {accountDone ? (
          <div
            role="status"
            aria-label="Completed: Sign in to Oasis AI"
            className="onboarding-checklist-row onboarding-checklist-row--done"
          >
            <StepIcon done />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="onboarding-checklist-row-title">Sign in to Oasis AI</span>
              <span className="onboarding-checklist-row-sub">
                {view === 'auth'
                  ? 'Use Google, Apple, Microsoft, or email.'
                  : 'Open sign-in to create an account or log in.'}
              </span>
            </span>
          </div>
        ) : (
          <button
            type="button"
            className="onboarding-checklist-row"
            onClick={() => {
              onNavigate.scrollToAuthPanel();
            }}
          >
            <StepIcon done={false} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="onboarding-checklist-row-title">Sign in to Oasis AI</span>
              <span className="onboarding-checklist-row-sub">
                {view === 'auth'
                  ? 'Use Google, Apple, Microsoft, or email.'
                  : 'Open sign-in to create an account or log in.'}
              </span>
            </span>
            <span className="onboarding-checklist-chevron" aria-hidden>
              &#8250;
            </span>
          </button>
        )}

        {firstAiDone ? (
          <div
            role="status"
            aria-label="Completed: Run your first AI command"
            className="onboarding-checklist-row onboarding-checklist-row--done"
          >
            <StepIcon done />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="onboarding-checklist-row-title">Run your first AI command</span>
              <span className="onboarding-checklist-row-sub">
                {auth.isAuthenticated
                  ? 'Ask a question or use voice after you are signed in.'
                  : 'Use the composer and start chatting to run a command.'}
              </span>
            </span>
          </div>
        ) : (
          <button
            type="button"
            className="onboarding-checklist-row"
            onClick={() => {
              if (!auth.isAuthenticated) {
                onNavigate.scrollToAuthPanel();
                return;
              }
              onNavigate.snapToComposer();
            }}
          >
            <StepIcon done={false} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="onboarding-checklist-row-title">Run your first AI command</span>
              <span className="onboarding-checklist-row-sub">
                {auth.isAuthenticated
                  ? 'Ask a question or use voice after you are signed in.'
                  : 'Use the composer and start chatting to run a command.'}
              </span>
            </span>
            <span className="onboarding-checklist-chevron" aria-hidden>
              &#8250;
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
