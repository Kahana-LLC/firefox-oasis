import { h, createRef } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { VoiceAuraVisualizer } from './components/VoiceAuraVisualizer';
import { Header } from './components/Header';
import { Auth } from './components/Auth';
import { ConfirmationModal } from './components/ConfirmationModal';
import { ChatTimeline } from './components/ChatTimeline';
import { Composer } from './components/Composer';
import { AssistantBusyBar } from './components/AssistantBusyBar';
import { OnboardingChecklist } from './components/OnboardingChecklist';
import { useAssistantRuntime } from './hooks/useAssistantRuntime';
import { useAuthSync } from './hooks/useAuthSync';
import { useAssistantBridge } from './hooks/useAssistantBridge';
import type {
  AuthState,
  ConfirmationData,
  OasisWindow,
  VoiceAgentEvent,
  VoiceAgentState,
  VoiceCaptureMode,
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

const ECHO_HINT_STORAGE_KEY = 'oasis.voice.echoHintDismissed';

function voicePrimaryStatus(
  state: VoiceAgentState,
  userSpeaking: boolean,
  listeningPhase: 'echo_guard' | 'capturing' | null,
  spokenRepliesEnabled: boolean
): string {
  if (listeningPhase === 'echo_guard') {
    return 'Ready in a moment…';
  }
  switch (state) {
    case 'idle':
      return 'Voice ready';
    case 'listening':
      return userSpeaking ? 'Hearing you' : 'Listening';
    case 'transcribing':
      return 'Processing speech';
    case 'thinking':
      return spokenRepliesEnabled ? 'Assistant is thinking' : 'Writing in chat';
    case 'speaking':
      return 'Assistant is speaking';
    default:
      return '';
  }
}

function voiceStatusHint(
  state: VoiceAgentState,
  listeningPhase: 'echo_guard' | 'capturing' | null,
  spokenRepliesEnabled: boolean
): string {
  if (listeningPhase === 'echo_guard') {
    return 'Letting the room quiet down so your mic is not picking up the assistant.';
  }
  switch (state) {
    case 'idle':
      return 'Tap the microphone below to start';
    case 'listening':
      return 'Pause briefly after you speak, or tap the orb to send now';
    case 'transcribing':
      return 'Tap the orb to cancel if this takes too long';
    case 'thinking':
      return spokenRepliesEnabled
        ? 'Tap the orb to cancel if this takes too long'
        : 'Watch the chat for the streamed reply; tap the orb to cancel';
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

function readEchoHintDismissed(): boolean {
  try {
    return localStorage.getItem(ECHO_HINT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function VoiceAgentOverlay({ onClose }: { onClose: () => void }) {
  const [agentState, setAgentState] = useState<VoiceAgentState>('idle');
  const [userText, setUserText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [listeningPhase, setListeningPhase] = useState<
    'echo_guard' | 'capturing' | null
  >(null);
  const [captureMode, setCaptureModeState] = useState<VoiceCaptureMode>('continuous');
  const [spokenRepliesEnabled, setSpokenRepliesEnabledState] = useState(true);
  const [echoHintDismissed, setEchoHintDismissed] = useState(readEchoHintDismissed);

  const agent = oasisWindow.voiceAgent;

  useEffect(() => {
    if (!agent) return;
    setCaptureModeState(agent.getCaptureMode());
    setSpokenRepliesEnabledState(agent.getVoiceSpokenRepliesEnabled());
    const unsub = agent.on((event: VoiceAgentEvent) => {
      switch (event.type) {
        case 'state':
          setAgentState(event.state);
          if (event.state === 'idle') {
            setListeningPhase(null);
          }
          break;
        case 'userTranscript':
          setUserText(event.text);
          if (event.text.trim()) {
            setErrorMsg('');
          }
          break;
        case 'error':
          setErrorMsg(event.message);
          break;
        case 'vad':
          setUserSpeaking(event.userSpeaking);
          break;
        case 'listening_phase':
          setListeningPhase(event.phase);
          break;
        case 'turn_done':
          break;
        case 'assistant_reply_text':
        case 'audio_level':
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
    if (s === 'transcribing' || s === 'thinking') {
      agent.stop();
      return;
    }
    if (s === 'speaking') {
      agent.stopSpeaking();
      return;
    }
    if (s === 'listening') {
      void agent.finishListening();
      return;
    }
    if (s === 'idle') {
      setErrorMsg('');
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
  const showEchoHint =
    !echoHintDismissed &&
    isListening &&
    listeningPhase === 'capturing';

  const setCaptureMode = (mode: VoiceCaptureMode) => {
    if (!agent) return;
    agent.setCaptureMode(mode);
    setCaptureModeState(mode);
  };

  const setSpokenRepliesEnabled = (enabled: boolean) => {
    if (!agent) return;
    agent.setVoiceSpokenRepliesEnabled(enabled);
    setSpokenRepliesEnabledState(enabled);
  };

  const dismissEchoHint = () => {
    setEchoHintDismissed(true);
    try {
      localStorage.setItem(ECHO_HINT_STORAGE_KEY, '1');
    } catch {
      // ignore
    }
  };

  if (!agent) {
    return (
      <div className="voice-agent-overlay voice-agent-overlay-phase-idle">
        <button className="voice-agent-close" onClick={onClose} type="button" title="Close" aria-label="Close voice assistant">
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

  const orbActionLabel = isBusy
    ? 'Cancel'
    : agentState === 'speaking'
      ? 'Stop playback'
      : agentState === 'listening'
        ? 'Tap to stop listening and send what we heard'
        : 'Start voice conversation';

  return (
    <div className={`voice-agent-overlay ${voicePhaseClass(agentState)}`}>
      <button className="voice-agent-close" onClick={handleClose} title="Close" aria-label="Close voice assistant">
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

        {showEchoHint && (
          <div className="voice-agent-echo-hint" role="status">
            <span>
              For best results, use headphones or keep speaker volume low to reduce echo.
            </span>
            <button type="button" className="voice-agent-echo-hint-dismiss" onClick={dismissEchoHint}>
              Dismiss
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="voice-agent-error-row">
            <div className="voice-agent-transcript voice-agent-error">{errorMsg}</div>
            <button
              type="button"
              className="voice-agent-error-dismiss"
              onClick={() => setErrorMsg('')}
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      <div className="voice-agent-bottom">
        <div className="voice-agent-capture-toggle" role="group" aria-label="Voice capture mode">
          <span className="voice-agent-capture-label">Capture</span>
          <button
            type="button"
            className={
              captureMode === 'continuous'
                ? 'voice-agent-capture-option voice-agent-capture-option-active'
                : 'voice-agent-capture-option'
            }
            onClick={() => setCaptureMode('continuous')}
          >
            Continuous
          </button>
          <button
            type="button"
            className={
              captureMode === 'precise'
                ? 'voice-agent-capture-option voice-agent-capture-option-active'
                : 'voice-agent-capture-option'
            }
            onClick={() => setCaptureMode('precise')}
          >
            Precise
          </button>
        </div>
        <div className="voice-agent-capture-toggle" role="group" aria-label="Voice reply mode">
          <span className="voice-agent-capture-label">Replies</span>
          <button
            type="button"
            className={
              spokenRepliesEnabled
                ? 'voice-agent-capture-option voice-agent-capture-option-active'
                : 'voice-agent-capture-option'
            }
            onClick={() => setSpokenRepliesEnabled(true)}
          >
            Spoken
          </button>
          <button
            type="button"
            className={
              !spokenRepliesEnabled
                ? 'voice-agent-capture-option voice-agent-capture-option-active'
                : 'voice-agent-capture-option'
            }
            onClick={() => setSpokenRepliesEnabled(false)}
          >
            Chat
          </button>
        </div>
        <div className="voice-agent-status-block">
          <div className="voice-agent-status" aria-live="polite">
            {voicePrimaryStatus(agentState, userSpeaking, listeningPhase, spokenRepliesEnabled)}
          </div>
          <div className="voice-agent-hint">
            {voiceStatusHint(agentState, listeningPhase, spokenRepliesEnabled)}
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
          title={orbActionLabel}
          aria-label={orbActionLabel}
        >
          {isBusy ? (
            <svg className="voice-agent-orb-icon" width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
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

function initialAssistantView(): 'chat' | 'auth' {
  try {
    if (oasisWindow.oasisAuthState?.isAuthenticated) {
      return 'chat';
    }
  } catch {
    // ignore
  }
  return 'auth';
}

export function App() {
  const [auth, setAuth] = useState<AuthState>({ isAuthenticated: false, user: null });
  const [view, setView] = useState<'chat' | 'auth'>(() => initialAssistantView());
  const composerInputRef = createRef<HTMLTextAreaElement>();
  const [bannerVisible, setBannerVisible] = useState(true);
  const [pendingConfirmation, setPendingConfirmation] = useState<ConfirmationData | null>(null);
  const [voiceAgentOpen, setVoiceAgentOpen] = useState(false);

  const originalResetRef = useRef(oasisWindow.resetAssistantSession);
  const handleAuthenticated = useCallback(() => {
    void oasisWindow.subscriptionService?.forceRefresh?.();
    setView('chat');
  }, []);

  const runtime = useAssistantRuntime({
    auth,
    setPendingConfirmation,
    originalResetAssistantSession: originalResetRef.current,
  });

  const handleUserChanged = useCallback(() => {
    setBannerVisible(true);
    void runtime.resetAssistantSession();
    void oasisWindow.subscriptionService?.forceRefresh?.();
  }, [runtime.resetAssistantSession]);

  useAssistantBridge({
    startToolAction: runtime.startToolAction,
    updateToolAction: runtime.updateToolAction,
    resetAssistantSession: runtime.resetAssistantSession,
    setPendingConfirmation,
  });

  useEffect(() => {
    const turnBegin = runtime.voiceTurnBeginForChat;
    const streamChunk = runtime.voiceStreamChunkForChat;
    const spokenMirror = runtime.voiceSpokenTurnMirrorForChat;
    oasisWindow.oasisVoiceAssistantTurnBegin = turnBegin;
    oasisWindow.oasisVoiceAssistantStreamChunk = streamChunk;
    oasisWindow.oasisVoiceSpokenTurnMirror = spokenMirror;
    return () => {
      if (oasisWindow.oasisVoiceAssistantTurnBegin === turnBegin) {
        delete oasisWindow.oasisVoiceAssistantTurnBegin;
      }
      if (oasisWindow.oasisVoiceAssistantStreamChunk === streamChunk) {
        delete oasisWindow.oasisVoiceAssistantStreamChunk;
      }
      if (oasisWindow.oasisVoiceSpokenTurnMirror === spokenMirror) {
        delete oasisWindow.oasisVoiceSpokenTurnMirror;
      }
    };
  }, [
    runtime.voiceTurnBeginForChat,
    runtime.voiceStreamChunkForChat,
    runtime.voiceSpokenTurnMirrorForChat,
  ]);

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

  const onboardingNavigate = useMemo(
    () => ({
      goAuth: () => setView('auth'),
      goChat: () => setView('chat'),
      focusComposer: () => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            composerInputRef.current?.focus();
          });
        });
      },
    }),
    []
  );

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
        className="assistant-main"
        aria-busy={view !== 'auth' && runtime.busy ? true : undefined}
      >
        <div className="assistant-scroll">
          {view === 'auth' ? (
            <Auth onSuccess={() => setView('chat')} onCancel={() => setView('chat')} />
          ) : (
            <div className="assistant-chat-stack">
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
                isAuthenticated={auth.isAuthenticated}
                onStarterPrompt={text => {
                  void runtime.send(text);
                }}
              />
            </div>
          )}
        </div>

        {view !== 'auth' && (
          <AssistantBusyBar
            busy={runtime.busy}
            activeToolLabel={runtime.activeToolAction?.label || null}
            responseStreaming={runtime.responseStreaming}
          />
        )}
        {view !== 'auth' && (
          <Composer
            input={runtime.input}
            busy={runtime.busy}
            isAuthenticated={auth.isAuthenticated}
            ttsEnabled={runtime.ttsEnabled}
            inputRef={composerInputRef}
            onInput={runtime.setInput}
            onKeyDown={runtime.handleKeyDown}
            onSend={() => {
              void runtime.send();
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
            onRequestSignIn={() => setView('auth')}
          />
        )}

        <OnboardingChecklist
          auth={auth}
          view={view}
          onNavigate={onboardingNavigate}
        />
      </div>

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
    </div>
  );
}
