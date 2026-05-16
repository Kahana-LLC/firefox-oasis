import { h } from "preact";
import type { JSX } from "preact";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "preact/hooks";
import {
  layoutFixedPanelBelowTrigger,
  layoutKeyForPanel,
  type AssistantFixedPanelLayout,
} from "../utils/assistantPanelLayout";
import { openExternalUrl } from "../utils/openExternalUrl";
import {
  OASIS_BILLING_URL,
  OASIS_PRICING_URL,
} from "../utils/quotaLimitUi";

const PANEL_ID = "oasis-settings-menu-panel";

export type SettingsMenuPopoverProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function GearIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

function PlansIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </svg>
  );
}

function BillingIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}

type SettingsMenuRowProps = {
  label: string;
  onClick: () => void;
  icon: JSX.Element;
};

function SettingsMenuRow({ label, onClick, icon }: SettingsMenuRowProps) {
  return (
    <button
      type="button"
      onClick={(e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        width: "100%",
        padding: "8px 12px",
        border: "none",
        background: "transparent",
        color: "var(--text-headings)",
        font: "inherit",
        fontSize: "13px",
        textAlign: "left",
        cursor: "pointer",
        borderRadius: "var(--border-radius-large)",
        boxSizing: "border-box",
      }}
      onMouseEnter={(e: JSX.TargetedMouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.background = "rgba(122, 146, 0, 0.08)";
      }}
      onMouseLeave={(e: JSX.TargetedMouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span
        style={{
          display: "flex",
          flexShrink: 0,
          color: "var(--text-secondary)",
        }}
      >
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

export function SettingsMenuPopover({
  open,
  onOpenChange,
}: SettingsMenuPopoverProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [panelLayout, setPanelLayout] = useState<AssistantFixedPanelLayout | null>(
    null
  );
  const lastAppliedKeyRef = useRef("");
  const rafRef = useRef(0);

  const close = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const toggle = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onOpenChange(!open);
    },
    [open, onOpenChange]
  );

  const applyPanelLayout = useCallback(() => {
    const next = layoutFixedPanelBelowTrigger(
      wrapRef.current,
      triggerRef.current,
      {
        minWidth: 180,
        maxWidth: 220,
        gapBelowTrigger: 6,
        maxHeight: "min(96px, 40vh)",
      }
    );
    if (!next) {
      lastAppliedKeyRef.current = "";
      setPanelLayout(null);
      return;
    }
    const key = layoutKeyForPanel(next);
    if (key === lastAppliedKeyRef.current) {
      return;
    }
    lastAppliedKeyRef.current = key;
    setPanelLayout(next);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      lastAppliedKeyRef.current = "";
      setPanelLayout(null);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      return;
    }
    const schedule = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        applyPanelLayout();
      });
    };
    applyPanelLayout();
    const wrap = wrapRef.current;
    const container = wrap?.closest(".assistant-container");
    const ro = new ResizeObserver(() => {
      schedule();
    });
    if (container) {
      ro.observe(container);
    }
    window.addEventListener("resize", schedule);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [open, applyPanelLayout]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onDocMouseDown(ev: MouseEvent) {
      const el = wrapRef.current;
      if (el && !el.contains(ev.target as Node | null)) {
        close();
      }
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        close();
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <div
      ref={wrapRef}
      className="oasis-settings-menu-wrap"
    >
      <button
        ref={triggerRef}
        type="button"
        className="oasis-settings-trigger"
        title="Settings"
        aria-label="Settings menu"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        aria-haspopup="menu"
        onClick={toggle}
      >
        <GearIcon />
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={PANEL_ID}
          role="menu"
          aria-label="Settings"
          className="oasis-settings-menu-panel dropdown-menu"
          style={{
            position: "fixed",
            top: panelLayout ? `${panelLayout.top}px` : 0,
            right: panelLayout ? `${panelLayout.right}px` : 0,
            width: panelLayout ? `${panelLayout.width}px` : 200,
            maxHeight: panelLayout?.maxHeight ?? "min(96px, 40vh)",
            display: "flex",
            flexDirection: "column",
            padding: "4px",
            background: "var(--surface-page)",
            border:
              "1px solid color-mix(in srgb, var(--text-body) 18%, transparent)",
            borderRadius: "var(--border-radius-lg)",
            boxShadow: "0 8px 28px rgba(0, 0, 0, 0.12)",
            zIndex: 1001,
            overflow: "hidden",
            transform: panelLayout?.transform,
            opacity: panelLayout ? 1 : 0,
            pointerEvents: panelLayout ? "auto" : "none",
          }}
          onMouseDown={(e: JSX.TargetedMouseEvent<HTMLDivElement>) =>
            e.stopPropagation()
          }
        >
          <SettingsMenuRow
            label="Plans"
            icon={<PlansIcon />}
            onClick={() => {
              openExternalUrl(OASIS_PRICING_URL);
              close();
            }}
          />
          <SettingsMenuRow
            label="Billing"
            icon={<BillingIcon />}
            onClick={() => {
              openExternalUrl(OASIS_BILLING_URL);
              close();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
