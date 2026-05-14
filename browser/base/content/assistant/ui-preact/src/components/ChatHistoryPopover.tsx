import { h } from "preact";
import type { JSX } from "preact";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import type { ChatConversationRow } from "../chatStore/index";
import {
  layoutFixedPanelBelowTrigger,
  layoutKeyForPanel,
  type AssistantFixedPanelLayout,
} from "../utils/assistantPanelLayout";

export type ChatHistoryPopoverProps = {
  conversations: ChatConversationRow[];
  activeId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void | Promise<void>;
};

function startOfLocalDayMs(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function groupConversationsByRecency(
  conversations: ChatConversationRow[]
): {
  today: ChatConversationRow[];
  last7: ChatConversationRow[];
  older: ChatConversationRow[];
} {
  const startToday = startOfLocalDayMs(new Date());
  const startOlderCutoff = startToday - 7 * 86400000;
  const today: ChatConversationRow[] = [];
  const last7: ChatConversationRow[] = [];
  const older: ChatConversationRow[] = [];
  for (const c of conversations) {
    const t = c.updatedAt;
    if (t >= startToday) {
      today.push(c);
    } else if (t >= startOlderCutoff) {
      last7.push(c);
    } else {
      older.push(c);
    }
  }
  return { today, last7, older };
}

const PANEL_ID = "oasis-chat-history-panel";

export function ChatHistoryPopover({
  conversations,
  activeId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
}: ChatHistoryPopoverProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [panelLayout, setPanelLayout] = useState<AssistantFixedPanelLayout | null>(
    null
  );
  const lastAppliedKeyRef = useRef("");
  const rafRef = useRef(0);

  const filtered = useMemo(() => {
    const q = query.replace(/\s+/g, " ").trim().toLowerCase();
    if (!q) {
      return conversations;
    }
    return conversations.filter(c =>
      (c.title || "New chat").toLowerCase().includes(q)
    );
  }, [conversations, query]);

  const { today, last7, older } = useMemo(
    () => groupConversationsByRecency(filtered),
    [filtered]
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setPendingDelete(null);
    requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, []);

  const runPendingDelete = useCallback(async () => {
    if (!pendingDelete) {
      return;
    }
    const { id } = pendingDelete;
    try {
      await Promise.resolve(onDeleteConversation(id));
      close();
    } catch (e) {
      console.error("oasis delete chat", e);
    }
  }, [pendingDelete, onDeleteConversation, close]);

  const toggle = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setOpen(o => !o);
    },
    []
  );

  useEffect(() => {
    if (!open) {
      setSearchFocused(false);
      return;
    }
    const t = window.setTimeout(() => {
      searchRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  const applyPanelLayout = useCallback(() => {
    const next = layoutFixedPanelBelowTrigger(
      wrapRef.current,
      triggerRef.current,
      {
        minWidth: 160,
        maxWidth: 280,
        gapBelowTrigger: 6,
        maxHeight: "min(320px, 55vh)",
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

  const rowShellStyle = (isActive: boolean): JSX.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: "2px",
    width: "100%",
    borderRadius: "var(--border-radius-large)",
    boxSizing: "border-box",
    background: isActive
      ? "color-mix(in srgb, var(--primary-green) 14%, var(--surface-page))"
      : "transparent",
  });

  const rowMainStyle: JSX.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flex: 1,
    minWidth: 0,
    padding: "8px 4px 8px 12px",
    border: "none",
    background: "transparent",
    color: "var(--text-headings)",
    font: "inherit",
    fontSize: "13px",
    textAlign: "left",
    cursor: "pointer",
    borderRadius: "var(--border-radius-large)",
    boxSizing: "border-box",
  };

  const deleteBtnStyle: JSX.CSSProperties = {
    flexShrink: 0,
    width: "32px",
    height: "36px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "transparent",
    color: "var(--text-secondary)",
    cursor: "pointer",
    borderRadius: "var(--border-radius-large)",
    padding: 0,
  };

  const renderSection = (label: string, items: ChatConversationRow[]) => {
    if (items.length === 0) {
      return null;
    }
    return (
      <div key={label} role="group" aria-label={label}>
        <div
          style={{
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--text-secondary)",
            padding: "10px 12px 4px",
          }}
        >
          {label}
        </div>
        <ul
          role="list"
          style={{ listStyle: "none", margin: 0, padding: "0 4px 8px" }}
        >
          {items.map(c => {
            const isActive = c.id === activeId;
            const title = c.title?.trim() || "New chat";
            return (
              <li key={c.id} style={{ margin: 0, padding: 0 }}>
                <div
                  style={rowShellStyle(isActive)}
                  onMouseEnter={(
                    e: JSX.TargetedMouseEvent<HTMLDivElement>
                  ) => {
                    if (!isActive) {
                      e.currentTarget.style.background =
                        "rgba(122, 146, 0, 0.08)";
                    }
                  }}
                  onMouseLeave={(
                    e: JSX.TargetedMouseEvent<HTMLDivElement>
                  ) => {
                    e.currentTarget.style.background = isActive
                      ? "color-mix(in srgb, var(--primary-green) 14%, var(--surface-page))"
                      : "transparent";
                  }}
                >
                  <button
                    type="button"
                    aria-current={isActive ? "true" : undefined}
                    style={rowMainStyle}
                    title={title}
                    onClick={(e: MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelectConversation(c.id);
                      close();
                    }}
                  >
                    {isActive ? (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--primary-green)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    ) : (
                      <span
                        style={{ width: "14px", flexShrink: 0 }}
                        aria-hidden
                      />
                    )}
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {title}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete chat: ${title}`}
                    title="Delete chat"
                    style={deleteBtnStyle}
                    onMouseDown={(e: JSX.TargetedMouseEvent<HTMLButtonElement>) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e: MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setPendingDelete({ id: c.id, title });
                    }}
                    onMouseEnter={(
                      e: JSX.TargetedMouseEvent<HTMLButtonElement>
                    ) => {
                      e.currentTarget.style.color = "var(--primary-green)";
                      e.currentTarget.style.background =
                        "rgba(122, 146, 0, 0.1)";
                    }}
                    onMouseLeave={(
                      e: JSX.TargetedMouseEvent<HTMLButtonElement>
                    ) => {
                      e.currentTarget.style.color = "var(--text-secondary)";
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
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
                      <path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
                    </svg>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const hasAny =
    today.length > 0 || last7.length > 0 || older.length > 0;

  return (
    <div
      ref={wrapRef}
      className="oasis-chat-history-wrap"
      style={{ position: "relative", flexShrink: 0 }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="oasis-chat-history-trigger"
        title="Chat history"
        aria-label="Open chat history"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        aria-haspopup="dialog"
        onClick={toggle}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={PANEL_ID}
          role="dialog"
          aria-label="Chat history"
          className="oasis-chat-history-panel dropdown-menu"
          style={{
            position: "fixed",
            top: panelLayout ? `${panelLayout.top}px` : 0,
            right: panelLayout ? `${panelLayout.right}px` : 0,
            width: panelLayout ? `${panelLayout.width}px` : 260,
            maxHeight: panelLayout?.maxHeight ?? "min(320px, 55vh)",
            display: "flex",
            flexDirection: "column",
            background: "var(--surface-page)",
            border: "1px solid color-mix(in srgb, var(--text-body) 18%, transparent)",
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 10px 8px",
              borderBottom:
                "1px solid color-mix(in srgb, var(--text-body) 12%, transparent)",
              flexShrink: 0,
            }}
          >
            <input
              ref={searchRef}
              type="search"
              placeholder="Search chats…"
              value={query}
              onInput={(e: JSX.TargetedEvent<HTMLInputElement>) =>
                setQuery((e.target as HTMLInputElement).value)
              }
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              aria-label="Search chats"
              style={{
                flex: 1,
                minWidth: 0,
                font: "inherit",
                fontSize: "13px",
                padding: "6px 10px",
                borderRadius: "var(--border-radius-large)",
                border: searchFocused
                  ? "1px solid var(--primary-green)"
                  : "1px solid color-mix(in srgb, var(--text-body) 20%, transparent)",
                background: "var(--surface-default)",
                color: "var(--text-headings)",
                boxSizing: "border-box",
                outline: "none",
                boxShadow: searchFocused
                  ? "0 0 0 2px color-mix(in srgb, var(--primary-green) 28%, transparent)"
                  : "none",
                WebkitAppearance: "none",
                appearance: "none",
              }}
            />
            <button
              type="button"
              title="New chat"
              aria-label="Start new chat"
              onClick={(e: MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                onNewChat();
                close();
              }}
              style={{
                flexShrink: 0,
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--border-radius-large)",
                border: "1px solid var(--primary-green)",
                background:
                  "color-mix(in srgb, var(--primary-green) 10%, var(--surface-page))",
                color: "#7A9200",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>

          {pendingDelete ? (
            <div
              style={{
                flexShrink: 0,
                padding: "10px 12px",
                borderBottom:
                  "1px solid color-mix(in srgb, var(--text-body) 12%, transparent)",
                background:
                  "color-mix(in srgb, var(--primary-green) 8%, var(--surface-page))",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-headings)",
                  marginBottom: "10px",
                  lineHeight: 1.35,
                }}
              >
                {`Delete "${pendingDelete.title}"? This cannot be undone.`}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  type="button"
                  onClick={() => setPendingDelete(null)}
                  style={{
                    font: "inherit",
                    fontSize: "13px",
                    padding: "6px 12px",
                    borderRadius: "var(--border-radius-large)",
                    border:
                      "1px solid color-mix(in srgb, var(--text-body) 22%, transparent)",
                    background: "var(--surface-page)",
                    color: "var(--text-headings)",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void runPendingDelete();
                  }}
                  style={{
                    font: "inherit",
                    fontSize: "13px",
                    padding: "6px 12px",
                    borderRadius: "var(--border-radius-large)",
                    border: "1px solid color-mix(in srgb, #c62828 35%, transparent)",
                    background: "color-mix(in srgb, #ffebee 55%, var(--surface-page))",
                    color: "#c62828",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ) : null}

          <div
            aria-label="Conversations"
            style={{
              overflowY: "auto",
              flex: 1,
              minHeight: 0,
              padding: "4px 0 8px",
            }}
          >
            {!hasAny ? (
              <div
                style={{
                  padding: "16px 14px",
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                  textAlign: "center",
                }}
              >
                {query.trim()
                  ? "No chats match your search."
                  : "No saved chats yet."}
              </div>
            ) : (
              <>
                {renderSection("Today", today)}
                {renderSection("Previous 7 days", last7)}
                {renderSection("Older", older)}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
