import { h } from 'preact';
import type { JSX } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
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

const shell: JSX.CSSProperties = {
  width: '100%',
  margin: 0,
  padding: '12px',
  borderRadius: '12px',
  background: '#f6f8ef',
  border: '1px solid #e2e8d0',
  boxSizing: 'border-box',
};

function StepIcon({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        flexShrink: 0,
        width: '20px',
        height: '20px',
        borderRadius: '50%',
        border: done ? 'none' : '2px solid #c5d49a',
        background: done ? '#7A9200' : 'transparent',
        color: '#fff',
        fontSize: '11px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
      }}
    >
      {done ? '\u2713' : ''}
    </span>
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
        stroke="#495800"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"
        stroke="#495800"
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
};

export function OnboardingChecklist({
  auth,
  view,
  onNavigate,
}: {
  auth: AuthState;
  view: 'auth' | 'chat';
  onNavigate: OnboardingNavigate;
}) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [collapsed, setCollapsed] = useState(readCollapsedDefault);

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

  const onSkipImport = () => {
    oasisWindow.assistantBridge?.markImportOptOut?.();
    refresh();
  };

  const expand = () => {
    setCollapsed(false);
    persistCollapsed(false);
  };

  const collapse = () => {
    setCollapsed(true);
    persistCollapsed(true);
  };

  const rowBtn: JSX.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    width: '100%',
    padding: '10px 8px',
    margin: 0,
    border: 'none',
    borderRadius: '8px',
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    font: 'inherit',
    color: '#333',
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
      className="assistant-onboarding-dock"
      style={shell}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px',
          gap: '8px',
        }}
      >
        <span
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#495800',
          }}
        >
          Getting started
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>
            {doneCount}/{total}
          </span>
          <button
            type="button"
            onClick={collapse}
            aria-expanded="true"
            title="Collapse checklist"
            style={{
              border: 'none',
              background: 'rgba(122, 146, 0, 0.12)',
              borderRadius: '8px',
              width: '32px',
              height: '28px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#495800',
              flexShrink: 0,
            }}
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
      <div
        style={{
          height: '4px',
          borderRadius: '4px',
          background: '#e2e8d0',
          marginBottom: '12px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progressPct}%`,
            background: '#7A9200',
            borderRadius: '4px',
            transition: 'width 0.25s ease',
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div
          style={{
            borderRadius: '8px',
            border: '1px solid #e2e8d0',
            background: '#fff',
            overflow: 'hidden',
          }}
        >
          <button
            type="button"
            style={{
              ...rowBtn,
              background: '#fafcf5',
            }}
            onClick={() => {
              if (!importDone) {
                onImport();
              }
            }}
          >
            <StepIcon done={importDone} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: '13px', fontWeight: 600, display: 'block' }}>
                Import or skip browser data
              </span>
              <span
                style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  display: 'block',
                  marginTop: '2px',
                }}
              >
                Optional: bring bookmarks and settings from another browser, or skip.
              </span>
            </span>
          </button>
          {!importDone && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                padding: '0 10px 10px 42px',
              }}
            >
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onImport();
                }}
                style={{
                  fontSize: '12px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid #c5d49a',
                  background: '#fff',
                  color: '#495800',
                  cursor: 'pointer',
                }}
              >
                Import browser data
              </button>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onSkipImport();
                }}
                style={{
                  fontSize: '12px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'transparent',
                  color: '#888',
                  cursor: 'pointer',
                }}
              >
                Skip for now
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          style={rowBtn}
          onClick={() => {
            onNavigate.goAuth();
          }}
        >
          <StepIcon done={accountDone} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '13px', fontWeight: 600, display: 'block' }}>
              Sign in to Oasis AI
            </span>
            <span
              style={{
                fontSize: '12px',
                color: '#6b7280',
                display: 'block',
                marginTop: '2px',
              }}
            >
              {view === 'auth'
                ? 'Use Google, Apple, Microsoft, or email below.'
                : 'Open sign-in to create an account or log in.'}
            </span>
          </span>
          <span style={{ color: '#9ca3af', fontSize: '18px', lineHeight: 1 }} aria-hidden>
            &#8250;
          </span>
        </button>

        <button
          type="button"
          style={rowBtn}
          onClick={() => {
            onNavigate.goChat();
            onNavigate.focusComposer();
          }}
        >
          <StepIcon done={firstAiDone} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '13px', fontWeight: 600, display: 'block' }}>
              Run your first AI command
            </span>
            <span
              style={{
                fontSize: '12px',
                color: '#6b7280',
                display: 'block',
                marginTop: '2px',
              }}
            >
              Ask a question or use voice after you are signed in.
            </span>
          </span>
          <span style={{ color: '#9ca3af', fontSize: '18px', lineHeight: 1 }} aria-hidden>
            &#8250;
          </span>
        </button>
      </div>
    </div>
  );
}
