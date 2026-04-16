import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ProgressRing } from './ProgressRing';
import type { AssistantUsageStats, OasisWindow } from '../types';

const oasisWindow: OasisWindow = window;

function toUsagePercent(stats: AssistantUsageStats | null): number {
  if (!stats || !Number.isFinite(stats.limit) || stats.limit <= 0) {
    return 0;
  }
  const used = Number.isFinite(stats.totalUnits) ? stats.totalUnits : 0;
  return Math.max(0, Math.min((used / stats.limit) * 100, 100));
}

export function Composer({
  input,
  isRecording,
  busy,
  isAuthenticated,
  onInput,
  onKeyDown,
  onSend,
  onToggleRecording,
  onResetSession,
  onFeedback,
}: {
  input: string;
  isRecording: boolean;
  busy: boolean;
  isAuthenticated: boolean;
  onInput: (value: string) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onSend: () => void;
  onToggleRecording: () => void;
  onResetSession: () => void;
  onFeedback: () => void;
}) {
  const wasBusyRef = useRef(busy);
  const [usageStats, setUsageStats] = useState<AssistantUsageStats | null>(null);
  const usagePercent = toUsagePercent(usageStats);

  const updateUsageStats = (stats: AssistantUsageStats) => {
    setUsageStats(stats);
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setUsageStats(null);
      return;
    }

    if (typeof oasisWindow.getAssistantUsageStats !== 'function') {
      return;
    }

    oasisWindow
      .getAssistantUsageStats()
      .then(updateUsageStats)
      .catch((error) => {
        console.error('Composer usage stats failed', error);
      });
  }, [isAuthenticated]);

  useEffect(() => {
    const wasBusy = wasBusyRef.current;
    wasBusyRef.current = busy;

    if (!isAuthenticated || wasBusy === false || busy === true) {
      return;
    }

    const refreshUsageStats =
      typeof oasisWindow.refreshAssistantUsageStats === 'function'
        ? oasisWindow.refreshAssistantUsageStats
        : oasisWindow.getAssistantUsageStats;

    if (typeof refreshUsageStats !== 'function') {
      return;
    }

    refreshUsageStats()
      .then(updateUsageStats)
      .catch((error) => {
        console.error('Composer usage stats refresh failed', error);
      });
  }, [busy, isAuthenticated]);

  return (
    <div className="input-bar">
      <textarea
        className="input-field"
        value={isRecording ? 'Listening...' : input}
        onInput={(event: Event) => {
          const target = event.currentTarget as HTMLTextAreaElement;
          onInput(target.value);
        }}
        onKeyDown={onKeyDown}
        placeholder={isAuthenticated ? 'Ask me anything...' : 'Please sign in...'}
        disabled={busy || !isAuthenticated || isRecording}
        rows={1}
        style={{
          minHeight: '24px',
          fontSize: '15px',
          color: '#333',
        }}
      />

      <div className="input-row" style={{ alignItems: 'center', justifyContent: 'space-between', paddingLeft: '8px' }}>
        <button
          onClick={onFeedback}
          title="Feedback?"
          style={{
            background: 'none',
            border: 'none',
            color: '#7A9200',
            fontSize: '13px',
            cursor: 'pointer',
            fontWeight: 500,
            padding: '4px 8px',
            borderRadius: '4px',
          }}
          onMouseEnter={(event) => (event.currentTarget.style.backgroundColor = '#F2F4E5')}
          onMouseLeave={(event) => (event.currentTarget.style.backgroundColor = 'transparent')}
        >
          Feedback?
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isRecording && (
            <div className="voice-wave" style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '20px' }}>
              {[...Array(8)].map((_, index) => (
                <div
                  key={index}
                  className="wave-bar"
                  style={{
                    width: '2px',
                    height: '8px',
                    background: '#7A9200',
                    borderRadius: '1px',
                    animationDelay: `${index * 0.1}s`,
                  }}
                />
              ))}
            </div>
          )}

          <div
            aria-hidden="true"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
              width: '32px',
              height: '32px',
            }}
          >
            <ProgressRing radius={13} stroke={11} progress={usagePercent} />
          </div>

          <button
            className="send-btn"
            onClick={onResetSession}
            title="Clear Chat History"
            style={{ color: '#666', width: '32px', height: '32px', flex: 'none' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>

          <button
            className="send-btn"
            onClick={onToggleRecording}
            disabled={busy || !isAuthenticated}
            title={isRecording ? 'Stop Recording' : 'Voice Input'}
            style={{
              background: 'transparent',
              width: '36px',
              height: '36px',
              border: 'none',
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
          >
            {isRecording ? (
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="36" height="36" rx="18" fill="#F8FAF2" />
                <path d="M17.945 11.75C16.578 11.75 15.475 11.75 14.608 11.867C13.708 11.987 12.95 12.247 12.348 12.848C11.746 13.45 11.488 14.208 11.367 15.108C11.25 15.975 11.25 17.078 11.25 18.445V18.555C11.25 19.922 11.25 21.025 11.367 21.892C11.487 22.792 11.747 23.55 12.348 24.152C12.95 24.754 13.708 25.012 14.608 25.134C15.475 25.25 16.578 25.25 17.945 25.25H18.055C19.422 25.25 20.525 25.25 21.392 25.134C22.292 25.012 23.05 24.754 23.652 24.152C24.254 23.55 24.512 22.792 24.634 21.892C24.75 21.025 24.75 19.922 24.75 18.555V18.445C24.75 17.078 24.75 15.975 24.634 15.108C24.512 14.208 24.254 13.45 23.652 12.848C23.05 12.246 22.292 11.988 21.392 11.867C20.525 11.75 19.422 11.75 18.055 11.75H17.945Z" fill="#7A9200" />
              </svg>
            ) : (
              <svg width="36" height="36" viewBox="313 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="313" y="0" width="36" height="36" rx="18" fill="#F8FAF2" />
                <path fillRule="evenodd" clipRule="evenodd" d="M327.958 12.8511C327.958 12.0442 328.278 11.2703 328.849 10.6997C329.419 10.1291 330.193 9.80859 331 9.80859C331.807 9.80859 332.581 10.1291 333.152 10.6997C333.722 11.2703 334.043 12.0442 334.043 12.8511V18.4681C334.043 19.2751 333.722 20.0489 333.152 20.6195C332.581 21.1901 331.807 21.5107 331 21.5107C330.193 21.5107 329.419 21.1901 328.849 20.6195C328.278 20.0489 327.958 19.2751 327.958 18.4681V12.8511ZM331 11.2128C330.566 11.2128 330.149 11.3854 329.842 11.6927C329.534 11.9999 329.362 12.4166 329.362 12.8511V18.4681C329.362 18.9026 329.534 19.3193 329.842 19.6266C330.149 19.9338 330.566 20.1064 331 20.1064C331.435 20.1064 331.851 19.9338 332.159 19.6266C332.466 19.3193 332.638 18.9026 332.638 18.4681V12.8511C332.638 12.4166 332.466 11.9999 332.159 11.6927C331.851 11.3854 331.435 11.2128 331 11.2128ZM326.319 17.766C326.506 17.766 326.684 17.84 326.816 17.9716C326.947 18.1033 327.021 18.2819 327.021 18.4681C327.021 19.5233 327.441 20.5353 328.187 21.2815C328.933 22.0276 329.945 22.4468 331 22.4468C332.055 22.4468 333.067 22.0276 333.814 21.2815C334.56 20.5353 334.979 19.5233 334.979 18.4681C334.979 18.2819 335.053 18.1033 335.184 17.9716C335.316 17.84 335.495 17.766 335.681 17.766C335.867 17.766 336.046 17.84 336.177 17.9716C336.309 18.1033 336.383 18.2819 336.383 18.4681C336.383 19.7742 335.908 21.0357 335.047 22.0176C334.186 22.9995 332.997 23.6348 331.702 23.8052V24.7872H333.809C333.995 24.7872 334.173 24.8612 334.305 24.9929C334.437 25.1246 334.511 25.3031 334.511 25.4894C334.511 25.6756 334.437 25.8542 334.305 25.9858C334.173 26.1175 333.995 26.1915 333.809 26.1915H328.192C328.005 26.1915 327.827 26.1175 327.695 25.9858C327.563 25.8542 327.49 25.6756 327.49 25.4894C327.49 25.3031 327.563 25.1246 327.695 24.9929C327.827 24.8612 328.005 24.7872 328.192 24.7872H330.298V23.8052C329.003 23.6348 327.814 22.9995 326.953 22.0176C326.092 21.0357 325.617 19.7742 325.617 18.4681C325.617 18.2819 325.691 18.1033 325.823 17.9716C325.955 17.84 326.133 17.766 326.319 17.766Z" fill="#94A833" />
              </svg>
            )}
          </button>

          <button className="send-btn" onClick={onSend} disabled={busy || !isAuthenticated} title="Send" style={{ width: '36px', height: '36px' }}>
            {busy ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7A9200" strokeWidth="2">
                <rect x="9" y="9" width="6" height="6" />
              </svg>
            ) : (
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="18" cy="18" r="18" fill="#7A9200" />
                <path d="M18 24V12M18 12L24 18M18 12L12 18" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
