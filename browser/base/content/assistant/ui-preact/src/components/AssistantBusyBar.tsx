import { h } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

const TIER1_MS = 6500;
const TIER2_MS = 24000;

type AssistantBusyBarProps = {
  busy: boolean;
  activeToolLabel: string | null;
  responseStreaming: boolean;
  showBriefCancel?: boolean;
  onCancelBrief?: () => void;
};

export function AssistantBusyBar({
  busy,
  activeToolLabel,
  responseStreaming,
  showBriefCancel = false,
  onCancelBrief,
}: AssistantBusyBarProps) {
  const [elapsedTier, setElapsedTier] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  const { primaryLine, tier1Line, tier2Line } = useMemo(() => {
    const primary = responseStreaming
      ? 'Writing response.'
      : 'Oasis is working on your request.';
    const tier1 =
      elapsedTier >= 1
        ? 'Still working. This can take a moment for web or tab actions.'
        : '';
    const tier2 =
      elapsedTier >= 2
        ? 'Taking longer than usual. You can clear the chat using the refresh icon below if nothing changes.'
        : '';
    return { primaryLine: primary, tier1Line: tier1, tier2Line: tier2 };
  }, [elapsedTier, responseStreaming]);

  useEffect(() => {
    if (!busy) {
      setElapsedTier(0);
      startedAtRef.current = null;
      if (intervalRef.current != null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    startedAtRef.current = Date.now();
    setElapsedTier(0);
    const tick = () => {
      const t = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
      let tier = 0;
      if (t >= TIER2_MS) {
        tier = 2;
      } else if (t >= TIER1_MS) {
        tier = 1;
      }
      setElapsedTier(tier);
    };
    intervalRef.current = window.setInterval(tick, 400);
    tick();
    return () => {
      if (intervalRef.current != null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [busy]);

  if (!busy) {
    return null;
  }

  return (
    <div
      className="assistant-busy-bar"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="assistant-busy-bar-inner">
        <svg
          className="assistant-busy-bar-spinner"
          width="14"
          height="14"
          viewBox="0 0 50 50"
          aria-hidden
        >
          <circle
            cx="25"
            cy="25"
            r="20"
            stroke="var(--primary-green)"
            strokeWidth="4"
            fill="none"
            opacity="0.2"
          />
          <circle
            cx="25"
            cy="25"
            r="20"
            stroke="var(--primary-green)"
            strokeWidth="4"
            fill="none"
            strokeDasharray="31.4 94.2"
            strokeLinecap="round"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 25 25"
              to="360 25 25"
              dur="1s"
              repeatCount="indefinite"
            />
          </circle>
        </svg>
        <div className="assistant-busy-bar-text">
          <div className="assistant-busy-bar-primary">{primaryLine}</div>
          {activeToolLabel ? (
            <div className="assistant-busy-bar-tool">{activeToolLabel}</div>
          ) : null}
          {tier1Line ? (
            <div className="assistant-busy-bar-tier">{tier1Line}</div>
          ) : null}
          {tier2Line ? (
            <div className="assistant-busy-bar-tier">{tier2Line}</div>
          ) : null}
        </div>
        {showBriefCancel && onCancelBrief ? (
          <button
            type="button"
            className="assistant-busy-bar-cancel"
            onClick={onCancelBrief}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}
