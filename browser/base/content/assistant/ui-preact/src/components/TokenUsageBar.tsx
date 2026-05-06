import { h } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { OasisWindow } from '../types';

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

export function TokenUsageBar({
  isAuthenticated,
  embedded,
}: {
  isAuthenticated: boolean;
  embedded?: boolean;
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
  const collapsedPct =
    data != null && !loading ? Math.round(data.percentOfBase) : null;
  const collapsedPctClass =
    loading || !data || !hasSvc
      ? 'token-usage-bar__collapsed-pct token-usage-bar__collapsed-pct--muted'
      : 'token-usage-bar__collapsed-pct';
  const collapsedPctText = !hasSvc
    ? '—'
    : loading
      ? '…'
      : data
        ? String(collapsedPct)
        : '—';

  const barFillPct =
    data != null && data.limit > 0
      ? Math.min(100, (data.used / data.limit) * 100)
      : 0;
  const ariaPct =
    data != null && data.baseLimit > 0
      ? Math.min(1000, Math.round(data.percentOfBase))
      : 0;

  const embeddedClass = embedded ? ' token-usage-bar--embedded' : '';

  if (collapsed) {
    return (
      <div className={`token-usage-bar token-usage-bar--collapsed${embeddedClass}`}>
        <button
          type="button"
          className="token-usage-bar__collapse-toggle"
          onClick={toggle}
          aria-expanded="false"
          title="Show daily token usage"
        >
          <span className="token-usage-bar__collapsed-label">Daily tokens</span>
          <span className={collapsedPctClass}>
            {collapsedPctText}
            {data != null && !loading ? '%' : ''}
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
              aria-valuenow={ariaPct}
              aria-valuetext={`${ariaPct} percent of base daily token limit used`}
            >
              <div
                className="token-usage-bar__fill"
                style={{ width: `${barFillPct}%` }}
              />
            </div>
            <p className="token-usage-bar__stats" aria-live="polite">
              {data.used.toLocaleString()} / {data.limit.toLocaleString()} used (
              {data.remaining.toLocaleString()} left)
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
          </>
        )}
      </div>
    </div>
  );
}
