import { h, Fragment } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { VoiceAuraVisualizer } from './components/VoiceAuraVisualizer';
import { Header } from './components/Header';
import { Auth } from './components/Auth';
import { ConfirmationModal } from './components/ConfirmationModal';
import { ChatTimeline } from './components/ChatTimeline';
import { Composer } from './components/Composer';
import { useAssistantRuntime } from './hooks/useAssistantRuntime';
import { useAuthSync } from './hooks/useAuthSync';
import { useAssistantBridge } from './hooks/useAssistantBridge';
import type {
  AuthState,
  ConfirmationData,
  OasisWindow,
  VoiceAgentEvent,
  VoiceAgentState,
} from './types';
import './App.css';

const oasisWindow: OasisWindow = window;

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

function userEmailOf(user: AuthState['user']): string {
  if (!user) return '';
  if (typeof user === 'string') return user;
  return typeof user.email === 'string' ? user.email : '';
}

function voicePrimaryStatus(
  state: VoiceAgentState,
  userSpeaking: boolean
): string {
  switch (state) {
    case 'idle':
      return 'Voice ready';
    case 'listening':
      return userSpeaking ? 'Hearing you' : 'Listening';
    case 'transcribing':
      return 'Processing speech';
    case 'thinking':
      return 'Assistant is thinking';
    case 'speaking':
      return 'Assistant is speaking';
    default:
      return '';
  }
}

function voiceStatusHint(state: VoiceAgentState): string {
  switch (state) {
    case 'idle':
      return 'Tap the microphone below to start';
    case 'listening':
      return 'Pause briefly after you speak, or tap the orb to send now';
    case 'transcribing':
      return 'Hang on';
    case 'thinking':
      return 'Please wait';
    case 'speaking':
      return 'Tap the orb to stop playback';
    default:
      return '';
  }
}

function voicePhaseClass(state: VoiceAgentState): string {
  if (state === 'listening') return 'voice-agent-overlay-phase-you';
  if (state === 'transcribing' || state === 'thinking' || state === 'speaking') {
    return 'voice-agent-overlay-phase-assistant';
  }
  return 'voice-agent-overlay-phase-idle';
}

function VoiceAgentOverlay({ onClose }: { onClose: () => void }) {
  const [agentState, setAgentState] = useState<VoiceAgentState>('idle');
  const [userText, setUserText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [userSpeaking, setUserSpeaking] = useState(false);

  const agent = oasisWindow.voiceAgent;

  useEffect(() => {
    if (!agent) return;
    const unsub = agent.on((event: VoiceAgentEvent) => {
      switch (event.type) {
        case 'state':
          setAgentState(event.state);
          if (event.state === 'listening') {
            setErrorMsg('');
          }
          break;
        case 'userTranscript':
          setUserText(event.text);
          break;
        case 'error':
          setErrorMsg(event.message);
          break;
        case 'vad':
          setUserSpeaking(event.userSpeaking);
          break;
        case 'turn_done':
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
    if (s === 'speaking') {
      agent.stopSpeaking();
      return;
    }
    if (s === 'listening') {
      void agent.finishListening();
      return;
    }
    if (s === 'idle') {
      void agent.startConversation();
    }
  };

  const handleClose = () => {
    if (agent) agent.stop();
    onClose();
  };

  const isListening = agentState === 'listening';
  const isBusy = agentState === 'transcribing' || agentState === 'thinking';
  const isSpeaking = agentState === 'speaking';

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
                ? 'voice-agent-recording-pill voice-agent-recording-pill-active'
                : 'voice-agent-recording-pill'
            }
            aria-live="polite"
          >
            {userSpeaking ? 'Picking up speech' : 'Mic on'}
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
            'voice-agent-orb',
            isListening ? 'voice-agent-orb-listening' : '',
            isBusy ? 'voice-agent-orb-busy' : '',
            isSpeaking ? 'voice-agent-orb-speaking' : '',
          ].filter(Boolean).join(' ')}
          onPointerDown={handleOrbPointerDown}
          disabled={isBusy}
          title={
            agentState === 'speaking'
              ? 'Stop playback'
              : agentState === 'listening'
                ? 'Tap to stop listening and send what we heard'
                : 'Start voice conversation'
          }
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
  const [auth, setAuth] = useState<AuthState>({ isAuthenticated: false, user: null });
  const [view, setView] = useState<'chat' | 'auth'>('chat');
  const [bannerVisible, setBannerVisible] = useState(true);
  const [pendingConfirmation, setPendingConfirmation] = useState<ConfirmationData | null>(null);
  const [voiceAgentOpen, setVoiceAgentOpen] = useState(false);

  const originalResetRef = useRef(oasisWindow.resetAssistantSession);
  const handleAuthenticated = useCallback(() => {
    setView('chat');
  }, []);
  const handleUserChanged = useCallback(() => {
    setBannerVisible(true);
  }, []);

  const runtime = useAssistantRuntime({
    auth,
    setPendingConfirmation,
    originalResetAssistantSession: originalResetRef.current,
  });

  useAssistantBridge({
    startToolAction: runtime.startToolAction,
    updateToolAction: runtime.updateToolAction,
    resetAssistantSession: runtime.resetAssistantSession,
    setPendingConfirmation,
  });

  useAuthSync({
    setAuth,
    setMessages: runtime.setMessages,
    setPendingConfirmation,
    onAuthenticated: handleAuthenticated,
    onUserChanged: handleUserChanged,
  });

  const handleResizeStart = (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      window.parent.postMessage(
        {
          type: 'oasisOverlayResizeStart',
          screenX: event.screenX,
          screenY: event.screenY,
        },
        '*'
      );
    } catch {
      // ignore
    }
  };

  const handleFeedback = () => {
    const feedbackUrl = 'https://tally.so/r/3jkNN6';
    if (typeof oasisWindow.openWebLinkIn === 'function') {
      oasisWindow.openWebLinkIn(feedbackUrl, 'tab', {});
      return;
    }
    if (window.top && typeof (window.top as OasisWindow).openWebLinkIn === 'function') {
      (window.top as OasisWindow).openWebLinkIn!(feedbackUrl, 'tab', {});
      return;
    }
    window.open(feedbackUrl, '_blank');
  };

  const handleLinkClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const anchor = target.closest('a') as HTMLAnchorElement | null;
    if (!anchor || !anchor.href || anchor.href.startsWith('javascript:')) {
      return;
    }

    event.preventDefault();
    const url = anchor.href;
    if (oasisWindow.assistantBridge?.openTab) {
      oasisWindow.assistantBridge.openTab(url);
    } else {
      window.open(url, '_blank');
    }
  };

  const handleTtsFromTimeline = useCallback(
    (messageId: string, content: string) => {
      if (!content) {
        runtime.stopSpeaking();
        return;
      }
      void runtime.speakText(content, messageId);
    },
    [runtime]
  );

  const userEmail = userEmailOf(auth.user);

  return (
    <div className="assistant-container">
      {voiceAgentOpen && (
        <VoiceAgentOverlay onClose={() => setVoiceAgentOpen(false)} />
      )}
      {pendingConfirmation && (
        <ConfirmationModal
          data={pendingConfirmation}
          onConfirm={() => {
            void runtime.handleConfirmationApprove();
          }}
          onCancel={() => {
            void runtime.handleConfirmationCancel();
          }}
        />
      )}

      <Header auth={auth} onShowAuth={() => setView('auth')} />

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
          <path d="M14 14L18 18" stroke="#000" strokeWidth="2" strokeLinecap="round" />
          <path d="M10 18L18 10" stroke="#000" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      {view === 'auth' ? (
        <Auth onSuccess={() => setView('chat')} onCancel={() => setView('chat')} />
      ) : (
        <Fragment>
          {auth.isAuthenticated && userEmail && bannerVisible && (
            <Banner email={userEmail} onClose={() => setBannerVisible(false)} />
          )}

          <ChatTimeline
            messages={runtime.messages}
            busy={runtime.busy}
            activeToolLabel={runtime.activeToolAction?.label || null}
            onLinkClick={handleLinkClick}
            speakingMsgId={runtime.speakingMsgId}
            onTtsClick={handleTtsFromTimeline}
          />

          <Composer
            input={runtime.input}
            isRecording={runtime.isRecording}
            busy={runtime.busy}
            isAuthenticated={auth.isAuthenticated}
            ttsEnabled={runtime.ttsEnabled}
            onInput={runtime.setInput}
            onKeyDown={runtime.handleKeyDown}
            onSend={() => {
              void runtime.send();
            }}
            onToggleRecording={() => {
              void runtime.toggleRecording();
            }}
            onResetSession={() => {
              void runtime.resetAssistantSession();
            }}
            onFeedback={handleFeedback}
            onToggleTts={() => {
              if (runtime.speakingMsgId) {
                runtime.stopSpeaking();
              }
              runtime.toggleTtsEnabled();
            }}
            onOpenVoiceAgent={() => setVoiceAgentOpen(true)}
          />
        </Fragment>
      )}
    </div>
  );
}
