import { h } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { OasisWindow } from '../types';
import { FEEDBACK_BONUS_TOKENS } from '../utils/trainingRewards';

const oasisWindow: OasisWindow = window;

const COLLAPSED_KEY = 'oasis.assistant.tokenUsageBarCollapsed';

type UsagePayload = {
  used: number;
  limit: number;
  baseLimit: number;
  bonusTokens: number;
  remaining: number;
  percentUsed: number;
  percentOfBase: number;
};

function readCollapsed(): boolean {
  try {
    return sessionStorage.getItem(COLLAPSED_KEY) !== '0';
  } catch {
    return true;
  }
}

function persistCollapsed(collapsed: boolean) {
  try {
    sessionStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    void 0;
  }
}

function fillClassName(percentUsed: number): string {
  if (percentUsed >= 85) {
    return 'token-usage-bar__fill token-usage-bar__fill--high';
  }
  if (percentUsed >= 65) {
    return 'token-usage-bar__fill token-usage-bar__fill--warn';
  }
  return 'token-usage-bar__fill';
}

function tieredReassurance(percentUsed: number, remaining: number): string {
  if (remaining <= 0 || percentUsed >= 100) {
    return "You've used today's allowance. Qualifying training feedback can add bonus tokens—use Training below when you're ready.";
  }
  if (percentUsed >= 85) {
    return "You're running low on tokens today. Thoughtful training feedback can earn bonus allowance.";
  }
  if (percentUsed >= 55) {
    return "You've used a good portion of today's allowance. Bonus tokens from training can add more headroom.";
  }
  return "You're in good shape today. You can still earn bonus tokens from training feedback when you like.";
}

export function TokenUsageBar({
  isAuthenticated,
  embedded,
  onOpenTraining,
}: {
  isAuthenticated: boolean;
  embedded?: boolean;
  onOpenTraining?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [data, setData] = useState<UsagePayload | null>(null);
  const [loading, setLoading] = useState(isAuthenticated);

  const load = useCallback(async () => {
    const svc = oasisWindow.subscriptionService;
    if (!svc?.getUsageBarData) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await svc.getUsageBarData();
      setData(next);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void load();
  }, [isAuthenticated, load]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    const t = window.setInterval(() => {
      void load();
    }, 45000);
    return () => window.clearInterval(t);
  }, [isAuthenticated, load]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    const onUp = () => {
      void load();
    };
    window.addEventListener('oasis-usage-update', onUp);
    return () => window.removeEventListener('oasis-usage-update', onUp);
  }, [isAuthenticated, load]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    persistCollapsed(next);
  };

  if (!isAuthenticated) {
    return null;
  }

  const hasSvc = Boolean(oasisWindow.subscriptionService?.getUsageBarData);
  const pctUsedRounded =
    data != null && !loading ? Math.min(100, Math.round(data.percentUsed)) : null;
  const collapsedPctClass =
    loading || !data || !hasSvc
      ? 'token-usage-bar__collapsed-pct token-usage-bar__collapsed-pct--muted'
      : 'token-usage-bar__collapsed-pct';
  const collapsedMainText = !hasSvc
    ? '—'
    : loading
      ? '…'
      : data
        ? `${pctUsedRounded}%`
        : '—';

  const collapsedAriaLabel =
    !hasSvc || loading || !data
      ? 'Daily tokens, show usage details'
      : `Daily tokens, ${pctUsedRounded} percent of today's allowance used. Show details.`;

  const barFillPct =
    data != null && data.limit > 0
      ? Math.min(100, (data.used / data.limit) * 100)
      : 0;
  const ariaNow =
    data != null ? Math.min(100, Math.round(data.percentUsed)) : 0;
  const ariaValueText =
    data != null
      ? `${Math.round(data.percentUsed)} percent of today's token allowance used, ${data.remaining.toLocaleString()} tokens remaining`
      : '';

  const embeddedClass = embedded ? ' token-usage-bar--embedded' : '';

  const onTrainingClick = () => {
    if (data && oasisWindow.mpTrack) {
      oasisWindow.mpTrack('token_usage_training_click', {
        percentUsed: data.percentUsed,
        bonusTokens: data.bonusTokens,
      });
    }
    onOpenTraining?.();
  };

  if (collapsed) {
    return (
      <div className={`token-usage-bar token-usage-bar--collapsed${embeddedClass}`}>
        <button
          type="button"
          className="token-usage-bar__collapse-toggle"
          onClick={toggle}
          aria-expanded="false"
          aria-label={collapsedAriaLabel}
          title="Show daily token usage"
        >
          <span className="token-usage-bar__collapsed-label">Daily tokens</span>
          <span className="token-usage-bar__collapsed-metrics">
            <span className={collapsedPctClass}>{collapsedMainText}</span>
            {data != null && !loading && hasSvc ? (
              <span className="token-usage-bar__collapsed-used-word">used</span>
            ) : null}
            {data != null && !loading && data.bonusTokens > 0 ? (
              <span className="token-usage-bar__collapsed-bonus">+bonus</span>
            ) : null}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
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
    );
  }

  return (
    <div className={`token-usage-bar${embeddedClass}`}>
      <div className="token-usage-bar__header">
        <span className="token-usage-bar__title" id="token-usage-bar-label">
          Daily tokens
        </span>
        <button
          type="button"
          className="token-usage-bar__collapse-toggle token-usage-bar__collapse-toggle--inline"
          onClick={toggle}
          aria-expanded="true"
          aria-controls="token-usage-bar-panel"
          title="Hide usage bar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M6 15l6-6 6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <div
        id="token-usage-bar-panel"
        className="token-usage-bar__panel"
        role="group"
        aria-labelledby="token-usage-bar-label"
      >
        {!hasSvc ? (
          <p className="token-usage-bar__stats" role="status">
            Usage is unavailable in this build.
          </p>
        ) : loading ? (
          <p className="token-usage-bar__stats" role="status">
            Loading usage…
          </p>
        ) : !data ? (
          <p className="token-usage-bar__stats" role="status">
            Could not load usage. Try again later.
          </p>
        ) : (
          <>
            <div
              className="token-usage-bar__track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={ariaNow}
              aria-valuetext={ariaValueText}
            >
              <div
                className={fillClassName(data.percentUsed)}
                style={{ width: `${barFillPct}%` }}
              />
            </div>
            <p className="token-usage-bar__stats" aria-live="polite">
              {data.used.toLocaleString()} / {data.limit.toLocaleString()} used (
              {data.remaining.toLocaleString()} left)
            </p>
            <p className="token-usage-bar__reassurance">
              {tieredReassurance(data.percentUsed, data.remaining)}
            </p>
            <p className="token-usage-bar__earn-hint">
              Each qualifying training submission can add up to{' '}
              {FEEDBACK_BONUS_TOKENS.toLocaleString()} bonus tokens to today's limit (see
              Training for requirements).
            </p>
            <p className="token-usage-bar__plan-note">
              Daily limit follows your Oasis plan.
            </p>
            {data.bonusTokens > 0 ? (
              <p className="token-usage-bar__bonus-note">
                Includes {data.bonusTokens.toLocaleString()} bonus from training feedback today
                (base {data.baseLimit.toLocaleString()}).
              </p>
            ) : null}
            {onOpenTraining ? (
              <button
                type="button"
                className="token-usage-bar__training-cta"
                onClick={onTrainingClick}
              >
                Open training
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
