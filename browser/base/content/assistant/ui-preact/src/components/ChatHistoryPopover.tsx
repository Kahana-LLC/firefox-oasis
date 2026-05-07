import { h } from "preact";
import type { JSX } from "preact";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ChatConversationRow } from "../chatStore/index";

export type ChatHistoryPopoverProps = {
  conversations: ChatConversationRow[];
  activeId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
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
}: ChatHistoryPopoverProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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
    requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, []);

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

  useEffect(() => {
    if (!open) {
      return;
    }
    function onDocMouseDown(ev: MouseEvent) {
      const el = wrapRef.current;
      if (el && !el.contains(ev.target as Node | null)) {
        setOpen(false);
        setQuery("");
      }
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        setOpen(false);
        setQuery("");
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const rowStyle = (isActive: boolean): JSX.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: "8px",
    width: "100%",
    padding: "8px 12px",
    border: "none",
    background: isActive
      ? "color-mix(in srgb, var(--primary-green) 14%, var(--surface-page))"
      : "transparent",
    color: "var(--text-headings)",
    font: "inherit",
    fontSize: "13px",
    textAlign: "left",
    cursor: "pointer",
    borderRadius: "var(--border-radius-large)",
    boxSizing: "border-box",
  });

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
                <button
                  type="button"
                  aria-current={isActive ? "true" : undefined}
                  style={rowStyle(isActive)}
                  title={title}
                  onMouseEnter={(
                    e: JSX.TargetedMouseEvent<HTMLButtonElement>
                  ) => {
                    if (!isActive) {
                      e.currentTarget.style.background =
                        "rgba(122, 146, 0, 0.08)";
                    }
                  }}
                  onMouseLeave={(
                    e: JSX.TargetedMouseEvent<HTMLButtonElement>
                  ) => {
                    e.currentTarget.style.background = isActive
                      ? "color-mix(in srgb, var(--primary-green) 14%, var(--surface-page))"
                      : "transparent";
                  }}
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
                    <span style={{ width: "14px", flexShrink: 0 }} aria-hidden />
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
        style={{
          border: "none",
          background: "transparent",
          cursor: "pointer",
          padding: "2px",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#7A9200",
          flexShrink: 0,
        }}
        onMouseEnter={(e: JSX.TargetedMouseEvent<HTMLButtonElement>) =>
          (e.currentTarget.style.backgroundColor = "rgba(122, 146, 0, 0.12)")
        }
        onMouseLeave={(e: JSX.TargetedMouseEvent<HTMLButtonElement>) =>
          (e.currentTarget.style.backgroundColor = "transparent")
        }
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
          id={PANEL_ID}
          role="dialog"
          aria-label="Chat history"
          className="oasis-chat-history-panel dropdown-menu"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: "6px",
            width: "min(280px, calc(100vw - 24px))",
            maxHeight: "min(320px, 55vh)",
            display: "flex",
            flexDirection: "column",
            background: "var(--surface-page)",
            border: "1px solid color-mix(in srgb, var(--text-body) 18%, transparent)",
            borderRadius: "var(--border-radius-lg)",
            boxShadow: "0 8px 28px rgba(0, 0, 0, 0.12)",
            zIndex: 1001,
            overflow: "hidden",
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
