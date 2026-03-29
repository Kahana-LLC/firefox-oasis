import { h, Fragment } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { VoiceAuraVisualizer } from './components/VoiceAuraVisualizer';
import { Header } from './components/Header';
import { Auth } from './components/Auth';
import { Feedback } from './components/Feedback';
import TOOL_LABELS from './toolLabels';
import type {
  AssistantHistoryEntry,
  AssistantMessage,
  AuthState,
  ConfirmationData,
  OasisWindow,
  SupabaseAuthState,
  ToolAction,
  ToolActionStatus,
  VoiceAgentEvent,
  VoiceAgentState,
} from './types';
import {
  OASIS_EVENT_AUTH_UPDATE,
  OASIS_EVENT_CONFIRMATION_UPDATE,
  OASIS_EVENT_HISTORY_UPDATE,
} from '../../shared/contracts.js';
import './App.css';

const oasisWindow: OasisWindow = window;

function ActiveToolIndicator({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#7A9200', fontSize: '13px', margin: '8px 0', paddingLeft: '4px' }}>
      <svg width="12" height="12" viewBox="0 0 50 50">
        <circle cx="25" cy="25" r="20" stroke="#7A9200" strokeWidth="4" fill="none" opacity="0.2" />
        <circle cx="25" cy="25" r="20" stroke="#7A9200" strokeWidth="4" fill="none" strokeDasharray="31.4 94.2" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite" />
        </circle>
      </svg>
      <span>{label}</span>
    </div>
  );
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
let recordStartRelay: ((name: string, messageId?: string, label?: string) => string) | null = null;
let recordUpdateRelay: ((id: string, status: ToolActionStatus, output?: string) => void) | null = null;
let resetAssistantSessionRelay: (() => void | Promise<void>) | null = null;
let pendingConfirmationRelay: ((data: ConfirmationData | null) => void) | null = null;

// Store the original backend reset function before we overwrite it
const originalResetAssistantSession = oasisWindow.resetAssistantSession;

oasisWindow.oasisRecordToolActionStart = (name: string, messageId?: string, label?: string) => {
  return recordStartRelay?.(name, messageId, label);
};
oasisWindow.oasisRecordToolActionUpdate = (id: string, status: ToolActionStatus, output?: string) => {
  recordUpdateRelay?.(id, status, output);
};
oasisWindow.resetAssistantSession = () => {
  if (resetAssistantSessionRelay) {
    return resetAssistantSessionRelay();
  }
  // Fallback to original if relay not set
  return originalResetAssistantSession?.();
};
oasisWindow.oasisSetPendingConfirmationRelay = (data: ConfirmationData | null) => {
  if (pendingConfirmationRelay) {
    pendingConfirmationRelay(data);
  }
};

function userIdOf(user: AuthState["user"]): string | undefined {
  if (!user || typeof user === "string") return undefined;
  return typeof user.id === "string" ? user.id : undefined;
}

function userEmailOf(user: AuthState["user"]): string {
  if (!user) return "";
  if (typeof user === "string") return user;
  return typeof user.email === "string" ? user.email : "";
}

function sanitizeAssistantChunk(raw: string): string {
  return String(raw || "")
    .replace(/\n?\s*\[\s*tool output for[^\]]+\]:[^\n]*(?:\n|$)/gi, "\n")
    .replace(/\[\s*tool output for[^\]]+\]:\s*/gi, "")
    .replace(/^\s*tool output for[^:]+:[^\n]*(?:\n|$)/gim, "")
    .replace(/\n{3,}/g, "\n\n");
}

function voicePrimaryStatus(
  state: VoiceAgentState,
  userSpeaking: boolean
): string {
  switch (state) {
    case "idle":
      return "Voice ready";
    case "listening":
      return userSpeaking ? "Hearing you" : "Listening";
    case "transcribing":
      return "Processing speech";
    case "thinking":
      return "Assistant is thinking";
    case "speaking":
      return "Assistant is speaking";
    default:
      return "";
  }
}

function voiceStatusHint(state: VoiceAgentState): string {
  switch (state) {
    case "idle":
      return "Tap the microphone below to start";
    case "listening":
      return "Speak naturally; pause briefly when you are done";
    case "transcribing":
      return "Hang on";
    case "thinking":
      return "Please wait";
    case "speaking":
      return "Tap the orb to stop playback";
    default:
      return "";
  }
}

function voicePhaseClass(state: VoiceAgentState): string {
  if (state === "listening") return "voice-agent-overlay-phase-you";
  if (state === "transcribing" || state === "thinking" || state === "speaking") {
    return "voice-agent-overlay-phase-assistant";
  }
  return "voice-agent-overlay-phase-idle";
}

function VoiceAgentOverlay({ onClose }: { onClose: () => void }) {
  const [agentState, setAgentState] = useState<VoiceAgentState>("idle");
  const [userText, setUserText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [userSpeaking, setUserSpeaking] = useState(false);

  const agent = oasisWindow.voiceAgent;

  useEffect(() => {
    if (!agent) return;
    const unsub = agent.on((event: VoiceAgentEvent) => {
      switch (event.type) {
        case "state":
          setAgentState(event.state);
          if (event.state === "listening") {
            setErrorMsg("");
          }
          break;
        case "userTranscript":
          setUserText(event.text);
          break;
        case "error":
          setErrorMsg(event.message);
          break;
        case "vad":
          setUserSpeaking(event.userSpeaking);
          break;
        case "turn_done":
          break;
      }
    });
    setAgentState(agent.getState() as VoiceAgentState);
    setUserSpeaking(agent.getUserSpeaking());
    return () => {
      unsub();
      agent.stop();
    };
  }, [agent]);

  const handleOrbPointerDown = () => {
    if (!agent) return;
    const s = agent.getState();
    if (s === "speaking") {
      agent.stopSpeaking();
      return;
    }
    if (s === "idle") {
      void agent.startConversation();
    }
  };

  const handleClose = () => {
    if (agent) agent.stop();
    onClose();
  };

  const isListening = agentState === "listening";
  const isBusy = agentState === "transcribing" || agentState === "thinking";
  const isSpeaking = agentState === "speaking";

  if (!agent) {
    return (
      <div className="voice-agent-overlay voice-agent-overlay-phase-idle">
        <button className="voice-agent-close" onClick={onClose} type="button" title="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <div className="voice-agent-content">
          <div className="voice-agent-transcript voice-agent-error">
            Voice assistant is not available in this build.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`voice-agent-overlay ${voicePhaseClass(agentState)}`}>
      <button className="voice-agent-close" onClick={handleClose} title="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div className="voice-agent-content">
        <VoiceAuraVisualizer agent={agent} agentState={agentState} />
        {isListening && (
          <div
            className={
              userSpeaking
                ? "voice-agent-recording-pill voice-agent-recording-pill-active"
                : "voice-agent-recording-pill"
            }
            aria-live="polite"
          >
            {userSpeaking ? "Picking up speech" : "Mic on"}
          </div>
        )}
        {userText && (
          <div className="voice-agent-transcript voice-agent-user-text">
            {userText}
          </div>
        )}

        {errorMsg && (
          <div className="voice-agent-transcript voice-agent-error">
            {errorMsg}
          </div>
        )}
      </div>

      <div className="voice-agent-bottom">
        <div className="voice-agent-status-block">
          <div className="voice-agent-status">
            {voicePrimaryStatus(agentState, userSpeaking)}
          </div>
          <div className="voice-agent-hint">
            {voiceStatusHint(agentState)}
          </div>
        </div>

        <button
          type="button"
          className={[
            "voice-agent-orb",
            isListening ? "voice-agent-orb-listening" : "",
            isBusy ? "voice-agent-orb-busy" : "",
            isSpeaking ? "voice-agent-orb-speaking" : "",
          ].filter(Boolean).join(" ")}
          onPointerDown={handleOrbPointerDown}
          disabled={isBusy}
        >
          {isBusy ? (
            <svg className="voice-agent-orb-icon" width="32" height="32" viewBox="0 0 50 50">
              <circle cx="25" cy="25" r="20" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.3" />
              <circle cx="25" cy="25" r="20" stroke="currentColor" strokeWidth="4" fill="none" strokeDasharray="31.4 94.2" strokeLinecap="round">
                <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.8s" repeatCount="indefinite" />
              </circle>
            </svg>
          ) : isSpeaking ? (
            <svg className="voice-agent-orb-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg className="voice-agent-orb-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

export function App() {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [toolActions, setToolActions] = useState<ToolAction[]>([]);
  const [auth, setAuth] = useState<AuthState>({ isAuthenticated: false, user: null });
  const [view, setView] = useState<'chat' | 'auth'>('chat');
  const [bannerVisible, setBannerVisible] = useState(true);
  const [pendingConfirmation, setPendingConfirmation] = useState<ConfirmationData | null>(null);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [voiceAgentOpen, setVoiceAgentOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsObjectUrlRef = useRef<string | null>(null);

  const resetAssistantSession = async () => {
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
    const setHistory = oasisWindow.setAssistantHistory;
    if (typeof setHistory === 'function') {
      await setHistory([]);
    }
  };

  const stopSpeaking = useCallback(() => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    if (ttsObjectUrlRef.current) {
      URL.revokeObjectURL(ttsObjectUrlRef.current);
      ttsObjectUrlRef.current = null;
    }
    setSpeakingMsgId(null);
  }, []);

  const speakText = useCallback(async (text: string, messageId: string) => {
    const ttsFn = oasisWindow.textToSpeech;
    if (typeof ttsFn !== 'function') return;

    stopSpeaking();
    setSpeakingMsgId(messageId);

    try {
      const plainText = text
        .replace(/<[^>]*>/g, '')
        .replace(/[#*_`~\[\]()>!|]/g, '')
        .replace(/\n{2,}/g, '. ')
        .replace(/\n/g, ' ')
        .trim();
      if (!plainText) return;

      const blob = await ttsFn(plainText);
      const url = URL.createObjectURL(blob);
      ttsObjectUrlRef.current = url;

      const audio = new Audio(url);
      ttsAudioRef.current = audio;
      audio.onended = () => {
        stopSpeaking();
      };
      audio.onerror = () => {
        stopSpeaking();
      };
      await audio.play();
    } catch (e) {
      console.error("TTS playback error:", e);
      stopSpeaking();
    }
  }, [stopSpeaking]);

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
        const globalState = oasisWindow.oasisAuthState;
        if (globalState && globalState.isAuthenticated !== undefined) {
             setAuth((prev) => {
                if (
                  prev.isAuthenticated === globalState.isAuthenticated &&
                  userIdOf(prev.user) === userIdOf(globalState.user)
                ) {
                    return prev;
                }
                // If user changed, reset banner
                if (userIdOf(prev.user) !== userIdOf(globalState.user)) {
                    setBannerVisible(true);
                }
                return { isAuthenticated: !!globalState.isAuthenticated, user: globalState.user };
             });
             if (globalState.isAuthenticated) setView('chat');
        }
    };

    const loadHistory = () => {
      void (async () => {
        try {
          const getHistory = oasisWindow.getAssistantHistory;
          if (typeof getHistory !== 'function') {
            return;
          }
          const history = await Promise.resolve(getHistory());
          if (!Array.isArray(history)) {
            return;
          }
          const formatted = history.map((m: AssistantHistoryEntry, idx: number): AssistantMessage => {
            const isHuman =
              m.type === 'human' ||
              m.id?.includes('Human') ||
              m.constructor.name === 'HumanMessage';
            const raw = m.content || (m.lc_kwargs ? m.lc_kwargs.content : '') || '';
            const content = isHuman
              ? raw
              : sanitizeAssistantChunk(raw).trim();

            return {
              id: m.id || `hist-${idx}-${m.role || 'msg'}`,
              role: isHuman ? 'user' : 'ai',
              content
            };
          });
          setMessages(formatted);
        } catch (e) {
          console.error("Failed to load history:", e);
        }
      })();
    };

    // Initial Auth Check
    const checkAuth = async () => {
      // First, check if the global shim already has the auth state
      const globalState = oasisWindow.oasisAuthState;
      if (globalState && globalState.isAuthenticated) {
        setAuth({ isAuthenticated: true, user: globalState.user });
        setView('chat');
        return;
      }

      // If not, we can try to ask supabaseAuth directly, but only if it's available
      if (oasisWindow.supabaseAuth) {
        try {
            // Give it a tiny bit of time to initialize if it's currently restoring
            const isAuth = await oasisWindow.supabaseAuth.isAuthenticated();
            if (isAuth) {
                const user = await oasisWindow.supabaseAuth.getCurrentUser();
                setAuth({ isAuthenticated: true, user });
                setView('chat');
            }
        } catch (e) {
            console.error("Auth check failed:", e);
        }
      }
    };
    checkAuth();

    window.addEventListener(OASIS_EVENT_AUTH_UPDATE, updateFromGlobal);
    window.addEventListener(OASIS_EVENT_HISTORY_UPDATE, loadHistory);
    
    const handleConfirmationUpdate = (e: Event) => {
      const detail = (e as CustomEvent<ConfirmationData | null>).detail;
      setPendingConfirmation(detail);
    };
    window.addEventListener(OASIS_EVENT_CONFIRMATION_UPDATE, handleConfirmationUpdate);

    if (oasisWindow.supabaseAuth?.onAuthStateChange) {
      oasisWindow.supabaseAuth.onAuthStateChange((state: SupabaseAuthState) => {
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
    // Try immediately and after a short delay to ensure assistant.ts is ready
    loadHistory();
    setTimeout(loadHistory, 500);

    return () => {
        window.removeEventListener(OASIS_EVENT_AUTH_UPDATE, updateFromGlobal);
        window.removeEventListener(OASIS_EVENT_HISTORY_UPDATE, loadHistory);
        window.removeEventListener(OASIS_EVENT_CONFIRMATION_UPDATE, handleConfirmationUpdate);
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

  function prettifyToolName(name: string) {
    if (!name) return '';
    if (name.includes(' ')) return name;
    const spaced = name
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }

  const startToolAction = (name: string, messageId?: string, label?: string) => {
    const id = uuid();
    const display = label || TOOL_LABELS[name] || prettifyToolName(name);
    setToolActions((prev) => [...prev, { id, name, status: 'running', messageId, label: display }]);
    return id;
  };

  const updateToolAction = (id: string, status: ToolActionStatus) => {
    setToolActions((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  };

  const activeToolAction = [...toolActions]
    .reverse()
    .find(a => a.status === 'running' || a.status === 'pending');

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages]);

  async function send(textInput?: string, fromVoice = false) {
    const text = textInput || input;
    if (!text.trim()) return;
    if (!auth.isAuthenticated) {
      setMessages(m => [...m, { id: uuid(), role: 'ai', content: "Please sign in to use the assistant." }]);
      return;
    }

    stopSpeaking();
    setInput('');
    setBusy(true);
    setToolActions([]);
    const userMsgId = uuid();
    setMessages((m) => [...m, { id: userMsgId, role: 'user', content: text }]);

    const inputType = fromVoice ? 'voice' : 'text';

    try {
      const run = oasisWindow.runAssistantStream;
      if (typeof run === 'function') {
        const aiMsgId = uuid();

        setMessages((m) => [...m, { id: aiMsgId, role: 'ai', content: '' }]);

        let fullResponse = '';
        try {
          fullResponse = await run(text, (chunk: string) => {
            const sanitizedChunk = sanitizeAssistantChunk(chunk);
            if (!sanitizedChunk) {
              return;
            }
            setMessages((prev) => {
              const idx = prev.findIndex(msg => msg.id === aiMsgId);
              if (idx !== -1) {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], content: updated[idx].content + sanitizedChunk };
                return updated;
              }
              return prev;
            });
          }, inputType, aiMsgId);
        } catch (e) {
          console.error("Stream error:", e);
          throw e;
        }

        if (fromVoice && ttsEnabled && fullResponse) {
          speakText(fullResponse, aiMsgId);
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
    const service = oasisWindow.voiceInputService;
    if (!service) {
      alert("Voice input service not available.");
      return;
    }

    if (isRecording) {
      try {
        const text = await service.stopRecording();
        setIsRecording(false);
        if (text) {
          send(text, true);
        }
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
    if (typeof oasisWindow.openWebLinkIn === 'function') {
        oasisWindow.openWebLinkIn(feedbackUrl, "tab", {});
    } else if (window.top && typeof (window.top as OasisWindow).openWebLinkIn === "function") {
        (window.top as OasisWindow).openWebLinkIn!(feedbackUrl, "tab", {});
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
      if (oasisWindow.assistantBridge?.openTab) {
        oasisWindow.assistantBridge.openTab(url);
      } else {
        window.open(url, '_blank');
      }
    }
  };

  const userEmail = userEmailOf(auth.user);

  const handleConfirmationApprove = async () => {
    // Only hide the modal UI - do NOT clear the backend pending confirmation yet
    // confirm_action will clear it after executing the command
    setPendingConfirmation(null);
    
    setBusy(true);
    try {
      const run = oasisWindow.runAssistantStream;
      if (typeof run === 'function') {
        const aiMsgId = uuid();
        setMessages((m) => [...m, { id: aiMsgId, role: 'ai', content: '' }]);
        await run("yes", (chunk: string) => {
          const sanitizedChunk = sanitizeAssistantChunk(chunk);
          if (!sanitizedChunk) {
            return;
          }
          setMessages((prev) => {
            const idx = prev.findIndex(msg => msg.id === aiMsgId);
            if (idx !== -1) {
              const updated = [...prev];
              updated[idx] = { ...updated[idx], content: updated[idx].content + sanitizedChunk };
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
    const clearFn = oasisWindow.oasisClearPendingConfirmation;
    if (clearFn) clearFn();
    
    setMessages((m) => [...m, { id: uuid(), role: 'ai', content: 'Action cancelled.' }]);
  };

  return (
    <div className="assistant-container">
      {voiceAgentOpen && (
        <VoiceAgentOverlay onClose={() => setVoiceAgentOpen(false)} />
      )}
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
                let htmlContent = m.content;
                try {
                  if (oasisWindow.marked && oasisWindow.DOMPurify) {
                    const raw = oasisWindow.marked.parse(m.content);
                    htmlContent = oasisWindow.DOMPurify.sanitize(raw);
                  }
                } catch (e) {
                  console.error("Markdown render error:", e);
                }
                return (
                  <Fragment key={m.id}>
                    <div className="ai-message-wrapper">
                      <div className="ai-response-container" onClick={handleLinkClick}>
                        {oasisWindow.marked ? (
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {!busy && m.content && (
                          <button
                            className="tts-btn"
                            onClick={() => {
                              if (speakingMsgId === m.id) {
                                stopSpeaking();
                              } else {
                                speakText(m.content, m.id);
                              }
                            }}
                            title={speakingMsgId === m.id ? "Stop speaking" : "Read aloud"}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '4px',
                              color: speakingMsgId === m.id ? '#7A9200' : '#999',
                            }}
                          >
                            {speakingMsgId === m.id ? (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="6" y="4" width="4" height="16" />
                                <rect x="14" y="4" width="4" height="16" />
                              </svg>
                            ) : (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                              </svg>
                            )}
                          </button>
                        )}
                        {isLastAI && !busy && (
                          <Feedback messageId={m.id} />
                        )}
                      </div>
                    </div>
                  </Fragment>
                );
              }
              return null;
            })}

            {(busy || activeToolAction) && (
              <ActiveToolIndicator label={activeToolAction?.label || 'Thinking...'} />
            )}

          </div>

          <div className="input-bar">
            <textarea 
                className="input-field"
                value={isRecording ? "Listening..." : input} 
                onInput={(e: Event) => {
                  const target = e.currentTarget as HTMLTextAreaElement;
                  setInput(target.value);
                }}
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
                     onClick={() => { void oasisWindow.resetAssistantSession?.(); }} 
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
                     onClick={() => {
                       if (speakingMsgId) stopSpeaking();
                       setTtsEnabled(prev => !prev);
                     }}
                     title={ttsEnabled ? "Disable auto read-aloud" : "Enable auto read-aloud"}
                     style={{
                       background: 'none',
                       border: 'none',
                       width: '32px',
                       height: '32px',
                       flex: 'none',
                       display: 'flex',
                       alignItems: 'center',
                       justifyContent: 'center',
                       padding: 0,
                       cursor: 'pointer',
                       color: ttsEnabled ? '#7A9200' : '#999',
                     }}
                   >
                     {ttsEnabled ? (
                       <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                         <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                         <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                         <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                       </svg>
                     ) : (
                       <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                         <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                         <line x1="23" y1="9" x2="17" y2="15" />
                         <line x1="17" y1="9" x2="23" y2="15" />
                       </svg>
                     )}
                   </button>

                   <button
                     className="send-btn"
                     onClick={() => setVoiceAgentOpen(true)}
                     disabled={busy || !auth.isAuthenticated}
                     title="Voice Agent"
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
                     <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                       <rect width="36" height="36" rx="18" fill="#F8FAF2"/>
                       <path d="M18 10a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3z" fill="#94A833" />
                       <path d="M23 17v1a5 5 0 0 1-10 0v-1" stroke="#94A833" strokeWidth="1.5" strokeLinecap="round" />
                       <line x1="18" y1="23" x2="18" y2="26" stroke="#94A833" strokeWidth="1.5" strokeLinecap="round" />
                       <line x1="15" y1="26" x2="21" y2="26" stroke="#94A833" strokeWidth="1.5" strokeLinecap="round" />
                     </svg>
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
