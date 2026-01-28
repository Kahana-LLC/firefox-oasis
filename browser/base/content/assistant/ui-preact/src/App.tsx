import { h, Fragment } from 'preact';
import { useState, useEffect, useRef, useMemo } from 'preact/hooks';
import { Header } from './components/Header';
import { Auth } from './components/Auth';
import { ToolActionMessage } from './components/ToolActionMessage';
import { ToolActionInline } from './components/ToolActionInline';
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

// Global relays to ensure functions are available even if App remounts
let recordStartRelay: any = null;
let recordUpdateRelay: any = null;
let resetAssistantSessionRelay: any = null;

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

export function App() {
  const [messages, setMessages] = useState<Array<{id: string, role: 'user' | 'ai', content: string}>>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [toolActions, setToolActions] = useState<Array<{id:string; name:string; status: 'pending'|'running'|'done'|'error'; output?: string; messageId?: string; label?: string;}>>([]);
  const [auth, setAuth] = useState<AuthState>({ isAuthenticated: false, user: null });
  const [view, setView] = useState<'chat' | 'auth'>('chat');
  const [bannerVisible, setBannerVisible] = useState(true);
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
    return () => {
      recordStartRelay = null;
      recordUpdateRelay = null;
      resetAssistantSessionRelay = null;
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
      updateFromGlobal();
      if ((window as any).supabaseAuth) {
        try {
            const isAuth = await (window as any).supabaseAuth.isAuthenticated();
            const user = await (window as any).supabaseAuth.getCurrentUser();
            setAuth({ isAuthenticated: isAuth, user });
        } catch (e) {
            console.error("Auth check failed:", e);
        }
      }
    };
    checkAuth();

    window.addEventListener('oasis-auth-update', updateFromGlobal);
    window.addEventListener('oasis-history-update', loadHistory);

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
        clearTimeout(pollTimer);
    };
  }, []);

  // Tool action helpers: allow external code to report tool runs
  // Generate unique IDs for messages and tool actions
  function uuid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
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

  const userEmail = auth.user?.email || (typeof auth.user === 'string' ? auth.user : '');

  return (
    <div className="assistant-container">
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
              <div style={{ textAlign: 'center', marginTop: 'auto', marginBottom: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '120px', height: '100px', opacity: 0.1 }}>
                   <svg viewBox="0 0 100 80" fill="#978455">
                      <path d="M50 20 C60 20 70 30 70 40 C70 50 60 60 50 60 C40 60 30 50 30 40 C30 30 40 20 50 20 Z" />
                   </svg>
                </div>
                <div style={{ color: '#999', fontSize: '14px', lineHeight: '1.5' }}>
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
                    <div className="ai-response-container">
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
                        background: '#F8FAF2',
                        color: isRecording ? '#d32f2f' : '#7A9200', 
                        width: '32px', 
                        height: '32px',
                        borderRadius: '64px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '8px',
                        gap: '8px',
                        border: 'none',
                        flex: 'none'
                    }}
                   >
                     {isRecording ? (
                       <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                         <rect x="6" y="6" width="12" height="12" rx="2" />
                       </svg>
                     ) : (
                       <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                         <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                         <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                         <line x1="12" y1="19" x2="12" y2="23" />
                         <line x1="8" y1="23" x2="16" y2="23" />
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
