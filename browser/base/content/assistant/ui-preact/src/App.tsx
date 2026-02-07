import { h, Fragment } from 'preact';
import { useState, useEffect, useRef, useMemo } from 'preact/hooks';
import { Header } from './components/Header';
import { Auth } from './components/Auth';
import { ToolActionMessage } from './components/ToolActionMessage';
import { ToolActionInline } from './components/ToolActionInline';
import { Feedback } from './components/Feedback';
import TOOL_LABELS from './toolLabels';
import './App.css';

// Minimal status icon for tool action
function ToolActionStatusIcon({ status }: { status: 'pending'|'running'|'done'|'error' }) {
  if (status === 'running' || status === 'pending') {
    return (
      <svg width="14" height="14" viewBox="0 0 50 50" style={{ marginRight: 2, verticalAlign: 'middle' }}>
        <circle cx="25" cy="25" r="20" stroke="#aaa" strokeWidth="4" fill="none" opacity="0.18" />
        <circle cx="25" cy="25" r="20" stroke="#aaa" strokeWidth="4" fill="none" strokeDasharray="31.4 94.2" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite" />
        </circle>
      </svg>
    );
  } else if (status === 'done') {
    return (
      <svg width="14" height="14" viewBox="0 0 20 20" style={{ marginRight: 2, verticalAlign: 'middle' }}>
        <circle cx="10" cy="10" r="9" stroke="#aaa" strokeWidth="2" fill="none" />
        <path d="M6 10l2 2 4-4" stroke="#aaa" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  } else {
    return (
      <svg width="14" height="14" viewBox="0 0 20 20" style={{ marginRight: 2, verticalAlign: 'middle' }}>
        <circle cx="10" cy="10" r="9" stroke="#d32f2f" strokeWidth="2" fill="none" />
        <line x1="7" y1="7" x2="13" y2="13" stroke="#d32f2f" strokeWidth="2" />
        <line x1="13" y1="7" x2="7" y2="13" stroke="#d32f2f" strokeWidth="2" />
      </svg>
    );
  }
}

function ToolActionsGroup({ actions }: { actions: any[] }) {
  const [open, setOpen] = useState(true);
  const anyRunning = actions.some(a => a.status === 'running' || a.status === 'pending');
  const anyError = actions.some(a => a.status === 'error');

  if (actions.length === 0) return null;

  return (
    <div className="tool-actions-group" style={{ margin: '8px 0 4px 0', paddingLeft: '4px' }}>
      <div 
        onClick={() => setOpen(!open)}
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          cursor: 'pointer', 
          color: '#999', 
          fontSize: '12px',
          gap: '4px',
          userSelect: 'none',
          marginBottom: open ? '4px' : '0'
        }}
      >
        <span style={{ fontWeight: 400 }}>Steps</span>
        <svg 
          width="10" height="10" 
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" 
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', opacity: 0.6 }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {actions.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#999', fontSize: '13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '14px' }}>
                {a.status === 'running' || a.status === 'pending' ? (
                  <svg width="10" height="10" viewBox="0 0 50 50">
                    <circle cx="25" cy="25" r="20" stroke="#999" strokeWidth="4" fill="none" opacity="0.2" />
                    <circle cx="25" cy="25" r="20" stroke="#999" strokeWidth="4" fill="none" strokeDasharray="31.4 94.2" strokeLinecap="round">
                      <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite" />
                    </circle>
                  </svg>
                ) : a.status === 'done' ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#d32f2f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                )}
              </div>
              <span style={{ opacity: a.status === 'done' ? 0.7 : 1, fontWeight: a.status === 'running' ? 500 : 400 }}>
                {a.label || a.output || a.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface AuthState {
  isAuthenticated: boolean;
  user: any;
}

function Banner({ email, onClose }: { email: string; onClose: () => void }) {
  return (
    <div className="signed-in-banner">
      <div className="banner-content">
        <span className="banner-label">Signed in as</span>
        <span className="banner-email">{email}</span>
      </div>
      <button className="banner-close" onClick={onClose} title="Close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  );
}

interface ConfirmationData {
  command: string;
  args: any;
  description: string;
}

function ConfirmationModal({ 
  data, 
  onConfirm, 
  onCancel 
}: { 
  data: ConfirmationData; 
  onConfirm: () => void; 
  onCancel: () => void;
}) {
  return (
    <div className="confirmation-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
    }}>
      <div className="confirmation-modal" style={{
        background: '#fff',
        borderRadius: '12px',
        padding: '24px',
        maxWidth: '400px',
        width: '90%',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        textAlign: 'center',
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          background: '#FFF8E1',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px auto',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7A9200" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        
        <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600, color: '#333' }}>
          Confirm Action
        </h3>
        
        <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#666' }}>
          {data.description}
        </p>
        
        <div style={{
          background: '#E8F5E9',
          borderRadius: '8px',
          padding: '8px 12px',
          marginBottom: '20px',
          fontSize: '13px',
          color: '#2E7D32',
        }}>
          Command: {data.command}
        </div>
        
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: '1px solid #ddd',
              borderRadius: '8px',
              background: '#fff',
              color: '#333',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: 'none',
              borderRadius: '8px',
              background: '#7A9200',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}

// Global relays to ensure functions are available even if App remounts
let recordStartRelay: any = null;
let recordUpdateRelay: any = null;
let resetAssistantSessionRelay: any = null;
let pendingConfirmationRelay: any = null;

// Store the original backend reset function before we overwrite it
const originalResetAssistantSession = (window as any).resetAssistantSession;

(window as any).oasisRecordToolActionStart = (name: string, messageId?: string, label?: string) => {
  return recordStartRelay?.(name, messageId, label);
};
(window as any).oasisRecordToolActionUpdate = (id: string, status: string, output?: string) => {
  return recordUpdateRelay?.(id, status, output);
};
(window as any).resetAssistantSession = () => {
  if (resetAssistantSessionRelay) {
    return resetAssistantSessionRelay();
  }
  // Fallback to original if relay not set
  return originalResetAssistantSession?.();
};
(window as any).oasisSetPendingConfirmationRelay = (data: any) => {
  if (pendingConfirmationRelay) {
    pendingConfirmationRelay(data);
  }
};

export function App() {
  const [messages, setMessages] = useState<Array<{id: string, role: 'user' | 'ai', content: string}>>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [toolActions, setToolActions] = useState<Array<{id:string; name:string; status: 'pending'|'running'|'done'|'error'; output?: string; messageId?: string; label?: string;}>>([]);
  const [auth, setAuth] = useState<AuthState>({ isAuthenticated: false, user: null });
  const [view, setView] = useState<'chat' | 'auth'>('chat');
  const [bannerVisible, setBannerVisible] = useState(true);
  const [pendingConfirmation, setPendingConfirmation] = useState<ConfirmationData | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const resetAssistantSession = async () => {
    console.log("Resetting assistant session (UI + Backend)");
    setMessages([]);
    setToolActions([]);
    
    // 1. Clear backend state (JSM)
    if (typeof originalResetAssistantSession === 'function') {
      try {
        originalResetAssistantSession();
      } catch (e) {
        console.error("Failed to call originalResetAssistantSession", e);
      }
    }

    // 2. Clear persistent history (browser logins)
    const setHistory = (window as any).setAssistantHistory;
    if (typeof setHistory === 'function') {
      await setHistory([]);
    }
  };

  useEffect(() => {
    recordStartRelay = startToolAction;
    recordUpdateRelay = updateToolAction;
    resetAssistantSessionRelay = resetAssistantSession;
    pendingConfirmationRelay = setPendingConfirmation;
    return () => {
      recordStartRelay = null;
      recordUpdateRelay = null;
      resetAssistantSessionRelay = null;
      pendingConfirmationRelay = null;
    };
  }, []);

  useEffect(() => {
    const updateFromGlobal = () => {
        const globalState = (window as any).oasisAuthState;
        if (globalState && globalState.isAuthenticated !== undefined) {
             setAuth((prev) => {
                if (prev.isAuthenticated === globalState.isAuthenticated && prev.user?.id === globalState.user?.id) {
                    return prev;
                }
                // If user changed, reset banner
                if (prev.user?.id !== globalState.user?.id) {
                    setBannerVisible(true);
                }
                return { isAuthenticated: !!globalState.isAuthenticated, user: globalState.user };
             });
             if (globalState.isAuthenticated) setView('chat');
        }
    };

    // Initial Auth Check
    const checkAuth = async () => {
      // First, check if the global shim already has the auth state
      const globalState = (window as any).oasisAuthState;
      if (globalState && globalState.isAuthenticated) {
        setAuth({ isAuthenticated: true, user: globalState.user });
        setView('chat');
        return;
      }

      // If not, we can try to ask supabaseAuth directly, but only if it's available
      if ((window as any).supabaseAuth) {
        try {
            // Give it a tiny bit of time to initialize if it's currently restoring
            const isAuth = await (window as any).supabaseAuth.isAuthenticated();
            if (isAuth) {
                const user = await (window as any).supabaseAuth.getCurrentUser();
                setAuth({ isAuthenticated: true, user });
                setView('chat');
            }
        } catch (e) {
            console.error("Auth check failed:", e);
        }
      }
    };
    checkAuth();

    window.addEventListener('oasis-auth-update', updateFromGlobal);
    window.addEventListener('oasis-history-update', loadHistory);
    
    const handleConfirmationUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setPendingConfirmation(detail);
    };
    window.addEventListener('oasis-confirmation-update', handleConfirmationUpdate);

    if ((window as any).supabaseAuth?.onAuthStateChange) {
      (window as any).supabaseAuth.onAuthStateChange((state: any) => {
        setAuth({ isAuthenticated: !!state.isAuthenticated, user: state.user });
        if (state.isAuthenticated) {
            setView('chat');
            setBannerVisible(true);
        }
      });
    }

    const pollTimer = setTimeout(() => {
        checkAuth();
    }, 1500);

    // Restore History
    const loadHistory = () => {
        try {
            const getHistory = (window as any).getAssistantHistory;
            if (typeof getHistory === 'function') {
                const history = getHistory();
                if (Array.isArray(history)) {
                     const formatted = history.map((m: any, idx: number) => ({
                         id: m.id || `hist-${idx}-${m.role || 'msg'}`,
                         role: (m.type === 'human' || m.id?.includes('Human') || m.constructor.name === 'HumanMessage') ? 'user' : 'ai',
                         content: m.content || (m.lc_kwargs ? m.lc_kwargs.content : '') || ''
                     }));
                     setMessages(formatted as any);
                }
            }
        } catch (e) {
            console.error("Failed to load history:", e);
        }
    };
    // Try immediately and after a short delay to ensure assistant.ts is ready
    loadHistory();
    setTimeout(loadHistory, 500);

    return () => {
        window.removeEventListener('oasis-auth-update', updateFromGlobal);
        window.removeEventListener('oasis-history-update', loadHistory);
        window.removeEventListener('oasis-confirmation-update', handleConfirmationUpdate);
        clearTimeout(pollTimer);
    };
  }, []);

  // Generate unique IDs for messages and tool actions (Valid UUID v4 for DB compatibility)
  function uuid() {
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
      }
    } catch (e) {}
    
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  // (labels imported from src/toolLabels.ts)

  function prettifyToolName(name: string) {
    if (!name) return '';
    // if contains spaces already, return as-is
    if (name.includes(' ')) return name;
    // camelCase or snake_case or kebab-case to words
    const spaced = name
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }

  // Start a tool action and associate it with a messageId (optional) and optional friendly label
  const startToolAction = (name: string, messageId?: string, label?: string) => {
    const id = uuid();
    console.log(`🛠️ startToolAction: name=${name}, messageId=${messageId}, id=${id}`);
    const display = label || TOOL_LABELS[name] || prettifyToolName(name);
    setToolActions((prev) => {
      const added = [...prev, { id, name, status: 'running', messageId, label: display } as any];
      // If a specific tool action starts for this message, mark the generic runAssistantStream action as done
      if (messageId && name !== 'runAssistantStream') {
        return added.map(a => (a.messageId === messageId && a.name === 'runAssistantStream') ? { ...a, status: 'done' } : a);
      }
      return added;
    });
    return id;
  };
  // Update tool action by id
  const updateToolAction = (id: string, status: 'done'|'error'|'running'|'pending', output?: string) => {
    console.log(`🛠️ updateToolAction: id=${id}, status=${status}, output=${output?.substring(0, 30)}`);
    setToolActions((prev) => prev.map((a) => a.id === id ? { ...a, status, output: output ?? a.output } : a));
  };

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages]);

  const onChunk = (text: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'ai') {
        return [...prev.slice(0, -1), { ...last, content: last.content + text }];
      } else {
        return [...prev, { id: uuid(), role: 'ai', content: text }];
      }
    });
  };

  async function send(textInput?: string) {
    const text = textInput || input;
    if (!text.trim()) return;
    if (!auth.isAuthenticated) {
      setMessages(m => [...m, { id: uuid(), role: 'ai', content: "Please sign in to use the assistant." }]);
      return;
    }

    setInput('');
    setBusy(true);
    setToolActions([]); 
    const userMsgId = uuid();
    setMessages((m) => [...m, { id: userMsgId, role: 'user', content: text }]);

    try {
      const run = (window as any).runAssistantStream;
      if (typeof run === 'function') {
        // Add empty AI message and get its id
        const aiMsgId = uuid();
        
        // Start a 'Thinking' step manually
        startToolAction('runAssistantStream', aiMsgId, 'Thinking...');
        
        setMessages((m) => [...m, { id: aiMsgId, role: 'ai', content: '' }]);
        
        try {
          await run(text, (chunk: string) => {
            setMessages((prev) => {
              const idx = prev.findIndex(msg => msg.id === aiMsgId);
              if (idx !== -1) {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], content: updated[idx].content + chunk };
                return updated;
              }
              return prev;
            });
          }, 'text', aiMsgId);
        } catch (e) {
          console.error("Stream error:", e);
          throw e;
        }
      } else {
        const aiMsgId = uuid();
        setMessages((m) => [...m, { id: aiMsgId, role: 'ai', content: '(runAssistantStream not available)' }]);
      }
    } catch (e) {
      setMessages((m) => [...m, { id: uuid(), role: 'ai', content: 'Error: ' + String(e) }]);
    } finally {
      setBusy(false);
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const toggleRecording = async () => {
    const service = (window as any).voiceInputService;
    if (!service) {
      alert("Voice input service not available.");
      return;
    }

    if (isRecording) {
      try {
        const text = await service.stopRecording();
        setIsRecording(false);
        if (text) setInput(text);
      } catch (e) {
        console.error("Error stopping recording:", e);
        setIsRecording(false);
      }
    } else {
      try {
        await service.startRecording();
        setIsRecording(true);
      } catch (e) {
        console.error("Error starting recording:", e);
      }
    }
  };

  const handleResizeStart = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
        window.parent.postMessage({ 
            type: "oasisOverlayResizeStart", 
            screenX: e.screenX, 
            screenY: e.screenY 
        }, "*");
    } catch (err) {}
  };

  const handleFeedback = () => {
    const feedbackUrl = "https://tally.so/r/3jkNN6";
    if (typeof (window as any).openWebLinkIn === 'function') {
        (window as any).openWebLinkIn(feedbackUrl, "tab", {});
    } else if (window.top && (window.top as any).openWebLinkIn) {
        (window.top as any).openWebLinkIn(feedbackUrl, "tab", {});
    } else {
        window.open(feedbackUrl, "_blank");
    }
  };

  const handleLinkClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (anchor && anchor.href && !anchor.href.startsWith('javascript:')) {
      e.preventDefault();
      const url = anchor.href;
      if ((window as any).assistantBridge?.openTab) {
        (window as any).assistantBridge.openTab(url);
      } else {
        window.open(url, '_blank');
      }
    }
  };

  const userEmail = auth.user?.email || (typeof auth.user === 'string' ? auth.user : '');

  const handleConfirmationApprove = async () => {
    // Only hide the modal UI - do NOT clear the backend pending confirmation yet
    // confirm_action will clear it after executing the command
    setPendingConfirmation(null);
    
    setBusy(true);
    try {
      const run = (window as any).runAssistantStream;
      if (typeof run === 'function') {
        const aiMsgId = uuid();
        setMessages((m) => [...m, { id: aiMsgId, role: 'ai', content: '' }]);
        await run("yes", (chunk: string) => {
          setMessages((prev) => {
            const idx = prev.findIndex(msg => msg.id === aiMsgId);
            if (idx !== -1) {
              const updated = [...prev];
              updated[idx] = { ...updated[idx], content: updated[idx].content + chunk };
              return updated;
            }
            return prev;
          });
        }, 'text', aiMsgId);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmationCancel = async () => {
    setPendingConfirmation(null);
    const clearFn = (window as any).oasisClearPendingConfirmation;
    if (clearFn) clearFn();
    
    setMessages((m) => [...m, { id: uuid(), role: 'ai', content: 'Action cancelled.' }]);
  };

  return (
    <div className="assistant-container">
      {pendingConfirmation && (
        <ConfirmationModal
          data={pendingConfirmation}
          onConfirm={handleConfirmationApprove}
          onCancel={handleConfirmationCancel}
        />
      )}
      <Header auth={auth} onShowAuth={() => setView('auth')} />
      
      {/* Resize Handle */}
      <div 
        onPointerDown={handleResizeStart}
        style={{
            position: 'fixed',
            bottom: '0',
            right: '0',
            width: '20px',
            height: '20px',
            cursor: 'nwse-resize',
            zIndex: 99999,
        }}
        title="Resize"
      >
         <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ position: 'absolute', bottom: 2, right: 2, opacity: 0.3 }}>
            <path d="M14 14L18 18" stroke="#000" strokeWidth="2" strokeLinecap="round"/>
            <path d="M10 18L18 10" stroke="#000" strokeWidth="2" strokeLinecap="round"/>
         </svg>
      </div>

      {view === 'auth' ? (
        <Auth onSuccess={() => setView('chat')} onCancel={() => setView('chat')} />
      ) : (
        <Fragment>
          {auth.isAuthenticated && userEmail && bannerVisible && (
            <Banner email={userEmail} onClose={() => setBannerVisible(false)} />
          )}

          {/* Remove global toolActions bar; now shown inline with messages */}

          <div className="chat-log" ref={logRef}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', marginTop: '8px', marginBottom: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px', width: '100%', padding: '8px', boxSizing: 'border-box', flexShrink: 0 }}>
                <div style={{ width: '75%', maxWidth: '260px', minWidth: '100px', flexShrink: 0 }}>
                  <img
                    src="chrome://browser/content/assistant/images/empty-state-bg.png"
                    alt=""
                    style={{ width: '100%', height: 'auto', maxHeight: '200px', objectFit: 'contain', display: 'block' }}
                  />
                </div>
                <div style={{ color: '#999', fontSize: '13px', lineHeight: '1.4' }}>
                   Welcome to Oasis AI<br/>
                   Browse, summarize, or manage your tabs.
                </div>
              </div>
            )}
            {messages.map((m, i) => {
              const isLast = i === messages.length - 1;
              const isLastAI = isLast && m.role === 'ai';

              if (m.role === 'user') {
                return (
                  <div key={m.id} className="message-bubble message-user">
                    <div className="message-content" style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                  </div>
                );
              } else if (m.role === 'ai') {
                // Only show tool actions for the very last AI message
                const showTools = isLastAI && toolActions.length > 0;
                
                let htmlContent = m.content;
                try {
                  const w = window as any;
                  if (w.marked && w.DOMPurify) {
                    const raw = w.marked.parse(m.content);
                    htmlContent = w.DOMPurify.sanitize(raw);
                  }
                } catch (e) {
                  console.error("Markdown render error:", e);
                }
                return (
                  <Fragment key={m.id}>
                    {showTools && (
                      <ToolActionsGroup actions={toolActions} />
                    )}
                    <div className="ai-message-wrapper">
                      <div className="ai-response-container" onClick={handleLinkClick}>
                        {(window as any).marked ? (
                          <div 
                            className="markdown-body"
                            dangerouslySetInnerHTML={{ __html: htmlContent }} 
                          />
                        ) : (
                          <div className="message-content" style={{ whiteSpace: 'pre-wrap', background: 'transparent', border: 'none', padding: 0 }}>
                            {m.content}
                          </div>
                        )}
                      </div>
                      {isLastAI && !busy && (
                        <Feedback messageId={m.id} />
                      )}
                    </div>
                  </Fragment>
                );
              }
              return null;
            })}

            {/* If we're busy but no AI message yet, show tools at the bottom */}
            {busy && messages.length > 0 && messages[messages.length - 1].role === 'user' && toolActions.length > 0 && (
              <ToolActionsGroup actions={toolActions} />
            )}

          </div>

          <div className="input-bar">
            <textarea 
                className="input-field"
                value={isRecording ? "Listening..." : input} 
                onInput={(e: any) => setInput(e.target.value)} 
                onKeyDown={handleKeyDown}
                placeholder={auth.isAuthenticated ? "Ask me anything..." : "Please sign in..."}
                disabled={busy || !auth.isAuthenticated || isRecording}
                rows={1}
                style={{ 
                    minHeight: '24px', 
                    fontSize: '15px',
                    color: '#333'
                }}
              />

            <div className="input-row" style={{ alignItems: 'center', justifyContent: 'space-between', paddingLeft: '8px' }}>
               <button 
                 onClick={handleFeedback}
                 title="Feedback?"
                 style={{ 
                    background: 'none', 
                    border: 'none', 
                    color: '#7A9200', 
                    fontSize: '13px', 
                    cursor: 'pointer',
                    fontWeight: 500,
                    padding: '4px 8px',
                    borderRadius: '4px'
                 }}
                 onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F2F4E5')}
                 onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
               >
                 Feedback?
               </button>
               
               <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {isRecording && (
                      <div className="voice-wave" style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '20px' }}>
                          {[...Array(8)].map((_, i) => (
                              <div key={i} className="wave-bar" style={{ 
                                  width: '2px', 
                                  height: '8px', 
                                  background: '#7A9200', 
                                  borderRadius: '1px',
                                  animationDelay: `${i * 0.1}s`
                              }} />
                          ))}
                      </div>
                    )}

                   <button 
                     className="send-btn" 
                     onClick={() => (window as any).resetAssistantSession()} 
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
                     onClick={toggleRecording} 
                     disabled={busy || !auth.isAuthenticated} 
                     title={isRecording ? "Stop Recording" : "Voice Input"}
                     style={{ 
                        background: 'transparent',
                        width: '36px', 
                        height: '36px',
                        border: 'none',
                        flex: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0
                    }}
                   >
                     {isRecording ? (
                       <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                         <rect width="36" height="36" rx="18" fill="#F8FAF2"/>
                         <path d="M17.945 11.75C16.578 11.75 15.475 11.75 14.608 11.867C13.708 11.987 12.95 12.247 12.348 12.848C11.746 13.45 11.488 14.208 11.367 15.108C11.25 15.975 11.25 17.078 11.25 18.445V18.555C11.25 19.922 11.25 21.025 11.367 21.892C11.487 22.792 11.747 23.55 12.348 24.152C12.95 24.754 13.708 25.012 14.608 25.134C15.475 25.25 16.578 25.25 17.945 25.25H18.055C19.422 25.25 20.525 25.25 21.392 25.134C22.292 25.012 23.05 24.754 23.652 24.152C24.254 23.55 24.512 22.792 24.634 21.892C24.75 21.025 24.75 19.922 24.75 18.555V18.445C24.75 17.078 24.75 15.975 24.634 15.108C24.512 14.208 24.254 13.45 23.652 12.848C23.05 12.246 22.292 11.988 21.392 11.867C20.525 11.75 19.422 11.75 18.055 11.75H17.945Z" fill="#7A9200"/>
                       </svg>
                     ) : (
                       <svg width="36" height="36" viewBox="313 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                         <rect x="313" y="0" width="36" height="36" rx="18" fill="#F8FAF2"/>
                         <path fillRule="evenodd" clipRule="evenodd" d="M327.958 12.8511C327.958 12.0442 328.278 11.2703 328.849 10.6997C329.419 10.1291 330.193 9.80859 331 9.80859C331.807 9.80859 332.581 10.1291 333.152 10.6997C333.722 11.2703 334.043 12.0442 334.043 12.8511V18.4681C334.043 19.2751 333.722 20.0489 333.152 20.6195C332.581 21.1901 331.807 21.5107 331 21.5107C330.193 21.5107 329.419 21.1901 328.849 20.6195C328.278 20.0489 327.958 19.2751 327.958 18.4681V12.8511ZM331 11.2128C330.566 11.2128 330.149 11.3854 329.842 11.6927C329.534 11.9999 329.362 12.4166 329.362 12.8511V18.4681C329.362 18.9026 329.534 19.3193 329.842 19.6266C330.149 19.9338 330.566 20.1064 331 20.1064C331.435 20.1064 331.851 19.9338 332.159 19.6266C332.466 19.3193 332.638 18.9026 332.638 18.4681V12.8511C332.638 12.4166 332.466 11.9999 332.159 11.6927C331.851 11.3854 331.435 11.2128 331 11.2128ZM326.319 17.766C326.506 17.766 326.684 17.84 326.816 17.9716C326.947 18.1033 327.021 18.2819 327.021 18.4681C327.021 19.5233 327.441 20.5353 328.187 21.2815C328.933 22.0276 329.945 22.4468 331 22.4468C332.055 22.4468 333.067 22.0276 333.814 21.2815C334.56 20.5353 334.979 19.5233 334.979 18.4681C334.979 18.2819 335.053 18.1033 335.184 17.9716C335.316 17.84 335.495 17.766 335.681 17.766C335.867 17.766 336.046 17.84 336.177 17.9716C336.309 18.1033 336.383 18.2819 336.383 18.4681C336.383 19.7742 335.908 21.0357 335.047 22.0176C334.186 22.9995 332.997 23.6348 331.702 23.8052V24.7872H333.809C333.995 24.7872 334.173 24.8612 334.305 24.9929C334.437 25.1246 334.511 25.3031 334.511 25.4894C334.511 25.6756 334.437 25.8542 334.305 25.9858C334.173 26.1175 333.995 26.1915 333.809 26.1915H328.192C328.005 26.1915 327.827 26.1175 327.695 25.9858C327.563 25.8542 327.49 25.6756 327.49 25.4894C327.49 25.3031 327.563 25.1246 327.695 24.9929C327.827 24.8612 328.005 24.7872 328.192 24.7872H330.298V23.8052C329.003 23.6348 327.814 22.9995 326.953 22.0176C326.092 21.0357 325.617 19.7742 325.617 18.4681C325.617 18.2819 325.691 18.1033 325.823 17.9716C325.955 17.84 326.133 17.766 326.319 17.766Z" fill="#94A833"/>
                       </svg>
                     )}
                   </button>

                   <button className="send-btn" onClick={() => send()} disabled={busy || !auth.isAuthenticated} title="Send" style={{ width: '36px', height: '36px' }}>
                    {busy ? (
                       <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7A9200" strokeWidth="2">
                         <rect x="9" y="9" width="6" height="6" />
                       </svg>
                    ) : (
                      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="18" cy="18" r="18" fill="#7A9200"/>
                        <path d="M18 24V12M18 12L24 18M18 12L12 18" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
               </div>
            </div>
          </div>
        </Fragment>
      )}
    </div>
  );
}
