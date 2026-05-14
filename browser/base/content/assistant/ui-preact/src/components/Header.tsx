import { h } from 'preact';
import type { ComponentChildren, JSX, Ref } from 'preact';
import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'preact/hooks';
import type { AuthState, OasisWindow } from '../types';
import type { ChatConversationRow } from '../chatStore/index';
import { ChatHistoryPopover } from './ChatHistoryPopover';
import {
  postOasisOverlayChromeMessage,
  runOasisAssistantLayoutToggle,
} from '../utils/postOasisOverlayChrome';
import {
  assistantThemesForScheme,
  getAssistantThemeScheme,
} from '../utils/themes';
import { applyAssistantThemeToDocument } from '../utils/applyAssistantTheme';
import {
  layoutFixedPanelBelowTrigger,
  layoutKeyForPanel,
  type AssistantFixedPanelLayout,
} from '../utils/assistantPanelLayout';

export type HeaderChatHistoryProps = {
  conversations: ChatConversationRow[];
  activeId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void | Promise<void>;
};

interface HeaderProps {
  auth: AuthState;
  onShowAuth: () => void;
  onOpenTrainingGallery: () => void;
  chatHistory?: HeaderChatHistoryProps | null;
}

const oasisWindow: OasisWindow = window;

const LIGHT_THEME_OPTIONS = assistantThemesForScheme('light');
const DARK_THEME_OPTIONS = assistantThemesForScheme('dark');

const DOCS_URL = 'https://kahana.co/docs';
const HEADER_COMPACT_WIDTH_PX = 380;

function openDocsHelp(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  if (typeof oasisWindow.openWebLinkIn === 'function') {
    oasisWindow.openWebLinkIn(DOCS_URL, 'tab', {});
    return;
  }
  if (window.top && typeof (window.top as OasisWindow).openWebLinkIn === 'function') {
    (window.top as OasisWindow).openWebLinkIn!(DOCS_URL, 'tab', {});
    return;
  }
  window.open(DOCS_URL, '_blank', 'noopener,noreferrer');
}

export function Header({
  auth,
  onShowAuth,
  onOpenTrainingGallery,
  chatHistory = null,
}: HeaderProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showThemePanel, setShowThemePanel] = useState(false);
  const [themePickerScheme, setThemePickerScheme] = useState<
    'light' | 'dark'
  >('light');
  const [activeThemeId, setActiveThemeId] = useState(() => {
    try {
      const id = oasisWindow.assistantBridge?.getAssistantTheme?.();
      return typeof id === 'string' ? id : 'default';
    } catch {
      return 'default';
    }
  });
  const [compactHeader, setCompactHeader] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const themePanelRef = useRef<HTMLDivElement>(null);
  const themeTriggerRef = useRef<HTMLButtonElement>(null);
  const [themePanelLayout, setThemePanelLayout] =
    useState<AssistantFixedPanelLayout | null>(null);
  const themeLayoutKeyRef = useRef('');
  const themeLayoutRafRef = useRef(0);
  const userEmail =
    auth.user && typeof auth.user !== "string" ? auth.user.email : undefined;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const t = event.target as Node | null;
      if (menuRef.current && !menuRef.current.contains(t)) {
        setShowMenu(false);
      }
      if (themePanelRef.current && !themePanelRef.current.contains(t)) {
        setShowThemePanel(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (showThemePanel) {
      setThemePickerScheme(
        getAssistantThemeScheme(activeThemeId) ?? 'light'
      );
    }
  }, [showThemePanel, activeThemeId]);

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver(() => {
      setCompactHeader(el.getBoundingClientRect().width < HEADER_COMPACT_WIDTH_PX);
    });
    ro.observe(el);
    setCompactHeader(el.getBoundingClientRect().width < HEADER_COMPACT_WIDTH_PX);
    return () => ro.disconnect();
  }, []);

  const applyThemePanelLayout = useCallback(() => {
    const next = layoutFixedPanelBelowTrigger(
      themePanelRef.current,
      themeTriggerRef.current,
      {
        minWidth: 200,
        maxWidth: 300,
        gapBelowTrigger: 6,
        maxHeight: 'min(420px, 58vh)',
        maxHeightPxCap: 420,
        minHeightPxFloor: 120,
      }
    );
    if (!next) {
      themeLayoutKeyRef.current = '';
      setThemePanelLayout(null);
      return;
    }
    const key = layoutKeyForPanel(next);
    if (key === themeLayoutKeyRef.current) {
      return;
    }
    themeLayoutKeyRef.current = key;
    setThemePanelLayout(next);
  }, []);

  useLayoutEffect(() => {
    if (!showThemePanel) {
      themeLayoutKeyRef.current = '';
      setThemePanelLayout(null);
      if (themeLayoutRafRef.current) {
        cancelAnimationFrame(themeLayoutRafRef.current);
        themeLayoutRafRef.current = 0;
      }
      return;
    }
    const schedule = () => {
      if (themeLayoutRafRef.current) {
        cancelAnimationFrame(themeLayoutRafRef.current);
      }
      themeLayoutRafRef.current = requestAnimationFrame(() => {
        themeLayoutRafRef.current = 0;
        applyThemePanelLayout();
      });
    };
    applyThemePanelLayout();
    const wrap = themePanelRef.current;
    const container = wrap?.closest('.assistant-container');
    const ro = new ResizeObserver(() => {
      schedule();
    });
    if (container) {
      ro.observe(container);
    }
    window.addEventListener('resize', schedule);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', schedule);
      if (themeLayoutRafRef.current) {
        cancelAnimationFrame(themeLayoutRafRef.current);
        themeLayoutRafRef.current = 0;
      }
    };
  }, [showThemePanel, applyThemePanelLayout]);

  const handleDragStart = (e: PointerEvent) => {
    const t = e.target as HTMLElement;
    if (
      t.closest('button') ||
      t.closest('.dropdown-menu') ||
      t.closest('.oasis-chat-history-wrap') ||
      t.closest('.assistant-theme-picker')
    ) {
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    postOasisOverlayChromeMessage({
      type: 'oasisOverlayDragStart',
      screenX: e.screenX,
      screenY: e.screenY,
    });
  };

  const handleSignOut = async () => {
    if (oasisWindow.supabaseAuth) {
      await oasisWindow.supabaseAuth.signOut();
      setShowMenu(false);
    }
  };

  const selectAssistantTheme = (id: string) => {
    applyAssistantThemeToDocument(id);
    setActiveThemeId(id);
    oasisWindow.assistantBridge?.setAssistantTheme?.(id);
    const nextScheme = getAssistantThemeScheme(id);
    if (nextScheme) {
      setThemePickerScheme(nextScheme);
    }
    setShowThemePanel(false);
  };

  const headerGap = compactHeader ? 6 : 8;
  const leftGap = compactHeader ? 6 : 8;

  return (
    <div
      ref={headerRef}
      onPointerDown={handleDragStart}
      style={{
        height: '44px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: `${headerGap}px`,
        padding: '0 8px', // Figma has less padding on edges of the internal row
        background: 'transparent',
        cursor: 'grab',
        zIndex: 1000,
        boxSizing: 'border-box',
        userSelect: 'none',
        flexShrink: 0,
        minWidth: 0,
      }}
    >
      {/* Left Container: Sloth + Title + Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: `${leftGap}px`,
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        {/* Sloth Icon */}
        <button
          type="button"
          title={
            compactHeader
              ? 'Training progress — Oasis Beta'
              : 'Training progress'
          }
          aria-label="Open training badges and streak progress"
          onClick={(e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenTrainingGallery();
          }}
          style={{
            width: 32,
            height: 32,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            borderRadius: '50%',
            padding: 0,
          }}
          onMouseEnter={(e: JSX.TargetedMouseEvent<HTMLButtonElement>) =>
            (e.currentTarget.style.backgroundColor = 'var(--icon-accent-hover-bg)')
          }
          onMouseLeave={(e: JSX.TargetedMouseEvent<HTMLButtonElement>) =>
            (e.currentTarget.style.backgroundColor = 'transparent')
          }
        >
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="16.5" cy="16" rx="12.5" ry="10.5" fill="var(--text-secondary)" />
            <ellipse cx="16.5" cy="18" rx="10.5" ry="8.5" fill="var(--surface-default)" />
            <ellipse cx="10.3268" cy="18.7453" rx="2.45004" ry="5.0274" transform="rotate(46.2818 10.3268 18.7453)" fill="var(--text-secondary)" />
            <circle cx="1" cy="1" r="1" transform="matrix(1 0 0 -1 12 17.5)" fill="var(--surface-default)" />
            <ellipse cx="2.45004" cy="5.0274" rx="2.45004" ry="5.0274" transform="matrix(-0.691112 0.722747 0.722747 0.691112 20.7329 13.5)" fill="var(--text-secondary)" />
            <circle cx="1" cy="1" r="1" transform="matrix(1 0 0 -1 19 17.5)" fill="var(--surface-default)" />
          </svg>
        </button>
        
        {/* Title */}
        <span
          style={{
            fontSize: '20px',
            fontWeight: 600,
            color: 'var(--header-title-color)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
        >
            {compactHeader ? 'Oasis' : 'Oasis AI'}
        </span>

        {/* Beta Badge */}
        {!compactHeader ? (
          <div
            style={{
              background: 'var(--header-badge-bg)',
              padding: '1px 8px',
              borderRadius: '32px',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 1,
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                fontSize: '12px',
                color: 'var(--header-badge-text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              Beta
            </span>
          </div>
        ) : null}
      </div>

      {/* Right Container: Help + Menu + Toggle + Close */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
        <button
          type="button"
          onClick={openDocsHelp}
          title="Help — Oasis documentation"
          aria-label="Oasis AI help, opens documentation in a new tab"
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: '2px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--icon-accent-color)',
            flexShrink: 0,
          }}
          onMouseEnter={(e: JSX.TargetedMouseEvent<HTMLButtonElement>) =>
            (e.currentTarget.style.backgroundColor = 'var(--icon-accent-hover-bg)')
          }
          onMouseLeave={(e: JSX.TargetedMouseEvent<HTMLButtonElement>) =>
            (e.currentTarget.style.backgroundColor = 'transparent')
          }
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <circle cx="12" cy="17" r="1.35" fill="currentColor" stroke="none" />
          </svg>
        </button>

        <div style={{ position: 'relative' }} ref={themePanelRef}>
          <HeaderBtn
            btnRef={themeTriggerRef}
            onClick={(e: MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              setShowThemePanel(v => !v);
              setShowMenu(false);
            }}
            title="Color theme"
            ariaLabel="Choose assistant color theme"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0L12 2.69z" stroke="currentColor" fill="none" />
              <circle cx="8.5" cy="9.5" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="12" cy="7" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="15.5" cy="9.5" r="1.2" fill="currentColor" stroke="none" />
            </svg>
          </HeaderBtn>
          {showThemePanel ? (
            <div
              className="assistant-theme-picker dropdown-menu"
              style={{
                position: 'fixed',
                top: themePanelLayout ? `${themePanelLayout.top}px` : 0,
                right: themePanelLayout ? `${themePanelLayout.right}px` : 0,
                width: themePanelLayout ? `${themePanelLayout.width}px` : 280,
                maxHeight: themePanelLayout?.maxHeight ?? 'min(420px, 58vh)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: 'var(--dropdown-surface)',
                border: '1px solid var(--dropdown-border-color)',
                borderRadius: '12px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                zIndex: 1001,
                padding: '8px 0 0',
                transform: themePanelLayout?.transform,
                opacity: themePanelLayout ? 1 : 0,
                pointerEvents: themePanelLayout ? 'auto' : 'none',
              }}
            >
              <div
                style={{
                  padding: '6px 14px 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: 'var(--dropdown-muted-text)',
                  flexShrink: 0,
                }}
              >
                Color theme
              </div>
              <div
                role="group"
                aria-label="Light or dark themes"
                style={{
                  display: 'flex',
                  margin: '0 12px 8px',
                  borderRadius: '8px',
                  border: '1px solid var(--dropdown-border-color)',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={themePickerScheme === 'light'}
                  aria-pressed={themePickerScheme === 'light'}
                  onClick={() => setThemePickerScheme('light')}
                  style={{
                    flex: 1,
                    border: 'none',
                    margin: 0,
                    padding: '8px 10px',
                    font: 'inherit',
                    fontSize: '12px',
                    fontWeight: 600,
                    lineHeight: 1.25,
                    cursor: 'pointer',
                    background:
                      themePickerScheme === 'light'
                        ? 'var(--dropdown-item-hover)'
                        : 'var(--dropdown-header-bg)',
                    color: 'var(--dropdown-item-text)',
                    boxSizing: 'border-box',
                  }}
                >
                  Light
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={themePickerScheme === 'dark'}
                  aria-pressed={themePickerScheme === 'dark'}
                  onClick={() => setThemePickerScheme('dark')}
                  style={{
                    flex: 1,
                    border: 'none',
                    borderLeft: '1px solid var(--dropdown-border-color)',
                    margin: 0,
                    padding: '8px 10px',
                    font: 'inherit',
                    fontSize: '12px',
                    fontWeight: 600,
                    lineHeight: 1.25,
                    cursor: 'pointer',
                    background:
                      themePickerScheme === 'dark'
                        ? 'var(--dropdown-item-hover)'
                        : 'var(--dropdown-header-bg)',
                    color: 'var(--dropdown-item-text)',
                    boxSizing: 'border-box',
                  }}
                >
                  Dark
                </button>
              </div>
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  paddingBottom: '8px',
                }}
              >
                {(themePickerScheme === 'light'
                  ? LIGHT_THEME_OPTIONS
                  : DARK_THEME_OPTIONS
                ).map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectAssistantTheme(t.id)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      borderLeft:
                        activeThemeId === t.id
                          ? '3px solid var(--icon-accent-color)'
                          : '3px solid transparent',
                      background:
                        activeThemeId === t.id
                          ? 'var(--dropdown-item-hover)'
                          : 'transparent',
                      padding: '10px 14px 10px 11px',
                      cursor: 'pointer',
                      font: 'inherit',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'var(--dropdown-item-text)',
                      }}
                    >
                      {t.label}
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--dropdown-muted-text)',
                        marginTop: '2px',
                        lineHeight: 1.35,
                      }}
                    >
                      {t.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {chatHistory ? (
          <ChatHistoryPopover
            conversations={chatHistory.conversations}
            activeId={chatHistory.activeId}
            onSelectConversation={chatHistory.onSelectConversation}
            onNewChat={chatHistory.onNewChat}
            onDeleteConversation={chatHistory.onDeleteConversation}
          />
        ) : null}

        <div style={{ position: 'relative' }} ref={menuRef}>
            <HeaderBtn
              onClick={() => {
                setShowMenu(!showMenu);
                setShowThemePanel(false);
              }}
              title="Account"
              ariaLabel="Account menu, sign in or sign up"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="8" r="4" />
                <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" />
              </svg>
            </HeaderBtn>

             {showMenu && (
                <div className="dropdown-menu" style={{
                    position: 'absolute',
                    top: '32px',
                    right: '0',
                    background: 'var(--dropdown-surface)',
                    border: '1px solid var(--dropdown-border-color)',
                    borderRadius: '12px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                    width: '200px',
                    overflow: 'hidden',
                    zIndex: 1000
                }}>
                    {auth.isAuthenticated ? (
                        <div>
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--dropdown-border-color)', background: 'var(--dropdown-header-bg)' }}>
                                <div style={{ fontSize: '11px', color: 'var(--dropdown-muted-text)', marginBottom: '2px' }}>Signed in as</div>
                                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--dropdown-item-text)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userEmail}</div>
                            </div>
                            <MenuItem onClick={handleSignOut} style={{ color: '#e53935' }}>Sign Out</MenuItem>
                        </div>
                    ) : (
                        <div>
                             <MenuItem onClick={() => { onShowAuth(); setShowMenu(false); }}>Sign In / Sign Up</MenuItem>
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* Toggle Sidebar */}
        <HeaderBtn
          onClick={(e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (!runOasisAssistantLayoutToggle()) {
              postOasisOverlayChromeMessage({ type: 'oasisOverlayToggleSidebar' });
            }
          }}
          title="Toggle Sidebar"
        >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 21C5.20435 21 4.44129 20.6839 3.87868 20.1213C3.31607 19.5587 3 18.7956 3 18V6C3 5.20435 3.31607 4.44129 3.87868 3.87868C4.44129 3.31607 5.20435 3 6 3H18C18.7956 3 19.5587 3.31607 20.1213 3.87868C20.6839 4.44129 21 5.20435 21 6V18C21 18.7956 20.6839 19.5587 20.1213 20.1213C19.5587 20.6839 18.7956 21 18 21H6ZM18 5H10V19H18C18.2652 19 18.5196 18.8946 18.7071 18.7071C18.8946 18.5196 19 18.2652 19 18V6C19 5.73478 18.8946 5.48043 18.7071 5.29289C18.5196 5.10536 18.2652 5 18 5Z" fill="currentColor"/>
            </svg>
        </HeaderBtn>
      </div>
    </div>
  );
}

type HeaderBtnProps = {
  onClick: (e: MouseEvent) => void;
  title: string;
  children: ComponentChildren;
  hoverColor?: string;
  ariaLabel?: string;
  btnRef?: Ref<HTMLButtonElement>;
};

function HeaderBtn({
  onClick,
  title,
  children,
  hoverColor,
  ariaLabel,
  btnRef,
}: HeaderBtnProps) {
  return (
    <button
      ref={btnRef}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel ?? title}
      style={{
        border: 0,
        background: 'transparent',
        cursor: 'pointer',
        borderRadius: '50%',
        width: '28px',
        height: '28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.2s',
        color: 'var(--icon-accent-color)'
      }}
      onMouseEnter={(e: JSX.TargetedMouseEvent<HTMLButtonElement>) => (e.currentTarget.style.backgroundColor = hoverColor || 'var(--icon-accent-hover-bg)')}
      onMouseLeave={(e: JSX.TargetedMouseEvent<HTMLButtonElement>) => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      {children}
    </button>
  );
}

type MenuItemProps = {
  onClick: () => void;
  children: ComponentChildren;
  style?: JSX.CSSProperties;
};

function MenuItem({ onClick, children, style }: MenuItemProps) {
    return (
        <div 
            onClick={onClick}
            style={{
                padding: '10px 16px',
                fontSize: '13px',
                color: 'var(--dropdown-item-text)',
                cursor: 'pointer',
                transition: 'background 0.1s',
                ...style
            }}
            onMouseEnter={(e: JSX.TargetedMouseEvent<HTMLDivElement>) => (e.currentTarget.style.backgroundColor = 'var(--dropdown-item-hover)')}
            onMouseLeave={(e: JSX.TargetedMouseEvent<HTMLDivElement>) => (e.currentTarget.style.backgroundColor = 'var(--dropdown-surface)')}
        >
            {children}
        </div>
    );
}
