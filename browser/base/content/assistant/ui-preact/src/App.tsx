import { h, createRef } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { VoiceAuraVisualizer } from './components/VoiceAuraVisualizer';
import { Header } from './components/Header';
import { Auth } from './components/Auth';
import { ConfirmationModal } from './components/ConfirmationModal';
import { ClarificationModal } from './components/ClarificationModal';
import { ChatTimeline } from './components/ChatTimeline';
import { Composer } from './components/Composer';
import { AssistantBusyBar } from './components/AssistantBusyBar';
import { OnboardingChecklist } from './components/OnboardingChecklist';
import { useAssistantRuntime } from './hooks/useAssistantRuntime';
import { postOasisOverlayChromeMessage } from './utils/postOasisOverlayChrome';
import { useAuthSync } from './hooks/useAuthSync';
import { useAssistantBridge } from './hooks/useAssistantBridge';
import { useResearchBriefProgress } from './hooks/useResearchBriefProgress';
import { OASIS_EVENT_ASSISTANT_SUBMIT } from '../../shared/contracts.js';
import { COMPOSER_INLINE_SUGGESTIONS } from './utils/exampleCommands';
import type {
  AuthState,
  ClarificationData,
  ConfirmationData,
  OasisWindow,
  VoiceAgentEvent,
  VoiceAgentState,
  VoiceCaptureMode,
} from './types';
import './App.css';
import './themes.css';

import { applyAssistantThemeToDocument } from './utils/applyAssistantTheme';
import { chatUserKey } from './utils/chatUserKey';
import {
  isResearchBriefToolMessage,
  pinnedEntryFromToolMessage,
} from './utils/researchBriefPersist';
import {
  hydrateResearchBriefCacheFromPinned,
  toolMessageFromPinned,
} from './utils/researchBriefRestore';
import {
  loadPinnedResearchBrief,
  savePinnedResearchBrief,
  type PinnedResearchBrief,
} from './researchBriefPinStore';
const oasisWindow: OasisWindow = window;

const SIGNED_IN_BANNER_AUTO_DISMISS_MS = 5000;

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
  const [pendingClarification, setPendingClarification] = useState<ClarificationData | null>(null);
  const [clarificationDirectInputOpen, setClarificationDirectInputOpen] = useState(false);
  const [clarificationDirectInput, setClarificationDirectInput] = useState('');
  const [voiceAgentOpen, setVoiceAgentOpen] = useState(false);
  const [trainingFocusTick, setTrainingFocusTick] = useState(0);
  const [trainingFocusMessageId, setTrainingFocusMessageId] = useState('');
  const [trainLatestComposerHint, setTrainLatestComposerHint] = useState(false);
  const [starterChipsHighlight, setStarterChipsHighlight] = useState(false);
  const [onboardingCollapseTick, setOnboardingCollapseTick] = useState(0);
  const [restoreOffer, setRestoreOffer] = useState<PinnedResearchBrief | null>(
    null
  );
  const [pinnedBriefId, setPinnedBriefId] = useState<string | null>(null);
  const [briefPinnedFlag, setBriefPinnedFlag] = useState(false);

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

  const { briefProgressLabel } = useResearchBriefProgress();
  const activeToolLabel =
    briefProgressLabel || runtime.activeToolAction?.label || null;

  const chatUid = auth.isAuthenticated ? chatUserKey(auth.user) : null;

  useEffect(() => {
    if (!chatUid || runtime.messages.length > 0) {
      setRestoreOffer(null);
      return;
    }
    let cancelled = false;
    void loadPinnedResearchBrief(chatUid).then(row => {
      if (!cancelled && row?.markdown) {
        setRestoreOffer(row);
        setPinnedBriefId(row.briefId);
        setBriefPinnedFlag(Boolean(row.pinned));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [chatUid, runtime.messages.length]);

  useEffect(() => {
    if (!chatUid) {
      return;
    }
    const lastBrief = [...runtime.messages]
      .reverse()
      .find(
        message =>
          message.role === 'ai' && isResearchBriefToolMessage(message.content)
      );
    if (!lastBrief) {
      return;
    }
    const entry = pinnedEntryFromToolMessage(chatUid, lastBrief.content, [], false);
    if (!entry) {
      return;
    }
    setPinnedBriefId(prev => {
      if (prev !== entry.briefId) {
        setBriefPinnedFlag(false);
      }
      return entry.briefId;
    });
    void loadPinnedResearchBrief(chatUid).then(existing => {
      const pinned =
        existing?.briefId === entry.briefId ? Boolean(existing.pinned) : false;
      const row = { ...entry, pinned };
      void savePinnedResearchBrief(row);
      hydrateResearchBriefCacheFromPinned(row);
      if (pinned) {
        setBriefPinnedFlag(true);
      }
    });
  }, [chatUid, runtime.messages]);

  const handleRestorePinnedBrief = useCallback(() => {
    if (!restoreOffer) {
      return;
    }
    hydrateResearchBriefCacheFromPinned(restoreOffer);
    const content = toolMessageFromPinned(restoreOffer);
    runtime.setMessages([
      {
        id: `restore-${restoreOffer.briefId}`,
        role: 'ai',
        content,
      },
    ]);
    setPinnedBriefId(restoreOffer.briefId);
    setBriefPinnedFlag(Boolean(restoreOffer.pinned));
    setRestoreOffer(null);
  }, [restoreOffer, runtime.setMessages]);

  const handleToggleBriefPin = useCallback(
    (content: string) => {
      if (!chatUid) {
        return;
      }
      const entry = pinnedEntryFromToolMessage(chatUid, content, [], true);
      if (!entry) {
        return;
      }
      const nextPinned = pinnedBriefId === entry.briefId ? !briefPinnedFlag : true;
      setBriefPinnedFlag(nextPinned);
      setPinnedBriefId(entry.briefId);
      void savePinnedResearchBrief({ ...entry, pinned: nextPinned });
    },
    [chatUid, pinnedBriefId, briefPinnedFlag]
  );

  useEffect(() => {
    const onSubmit = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string }>).detail;
      if (detail?.prompt?.trim()) {
        void runtime.send(detail.prompt.trim());
      }
    };
    window.addEventListener(OASIS_EVENT_ASSISTANT_SUBMIT, onSubmit);
    return () => {
      window.removeEventListener(OASIS_EVENT_ASSISTANT_SUBMIT, onSubmit);
    };
  }, [runtime.send]);

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
    setPendingClarification,
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
    setPendingConfirmation,
    setPendingClarification,
    onAuthenticated: handleAuthenticated,
    onUserChanged: handleUserChanged,
  });

  useEffect(() => {
    if (!pendingClarification) {
      setClarificationDirectInputOpen(false);
      setClarificationDirectInput('');
    }
  }, [pendingClarification]);

  useEffect(() => {
    try {
      const id = oasisWindow.assistantBridge?.getAssistantTheme?.();
      applyAssistantThemeToDocument(
        typeof id === "string" ? id : "default"
      );
    } catch {
      applyAssistantThemeToDocument("default");
    }
  }, []);

  const prevAuthenticatedRef = useRef<boolean | null>(null);
  useEffect(() => {
    const prev = prevAuthenticatedRef.current;
    const next = auth.isAuthenticated;
    if (prev === true && next === false) {
      setView('auth');
    }
    prevAuthenticatedRef.current = next;
  }, [auth.isAuthenticated]);

  const handleResizeStart = (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    postOasisOverlayChromeMessage({
      type: 'oasisOverlayResizeStart',
      screenX: event.screenX,
      screenY: event.screenY,
    });
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

  const handleGoToTrainingFromUsageBar = useCallback(() => {
    setView('chat');
    let lastId: string | null = null;
    for (let i = runtime.messages.length - 1; i >= 0; i--) {
      const m = runtime.messages[i];
      if (m.role === 'ai' && m.content?.trim()) {
        lastId = m.id;
        break;
      }
    }
    const hadTarget = Boolean(lastId);
    if (oasisWindow.mpTrack) {
      oasisWindow.mpTrack('token_usage_go_to_training', { hadTarget });
    }
    if (hadTarget && lastId) {
      setTrainingFocusMessageId(lastId);
      setTrainingFocusTick(t => t + 1);
    } else {
      setTrainingFocusMessageId('');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.getElementById('oasis-assistant-composer')?.scrollIntoView({
            block: 'center',
            behavior: 'smooth',
          });
          composerInputRef.current?.focus();
        });
      });
      setTrainLatestComposerHint(true);
      window.setTimeout(() => setTrainLatestComposerHint(false), 6000);
    }
  }, [runtime.messages]);

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

  useEffect(() => {
    if (!auth.isAuthenticated || !userEmail || !bannerVisible) {
      return;
    }
    const id = window.setTimeout(() => {
      setBannerVisible(false);
    }, SIGNED_IN_BANNER_AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [auth.isAuthenticated, userEmail, bannerVisible]);

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
      scrollToAuthPanel: () => {
        setView('auth');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            document.getElementById('oasis-auth-panel')?.scrollIntoView({
              block: 'start',
              behavior: 'smooth',
            });
          });
        });
      },
      snapToComposer: () => {
        setView('chat');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            document.getElementById('oasis-assistant-composer')?.scrollIntoView({
              block: 'center',
              behavior: 'smooth',
            });
            composerInputRef.current?.focus();
            setStarterChipsHighlight(true);
            window.setTimeout(() => setStarterChipsHighlight(false), 3200);
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
      {pendingClarification && (
        <ClarificationModal
          data={pendingClarification}
          directInputOpen={clarificationDirectInputOpen}
          directInputValue={clarificationDirectInput}
          onSelect={optionId => {
            const idx = pendingClarification.options.findIndex(
              o => o.id === optionId
            );
            setPendingClarification(null);
            setClarificationDirectInputOpen(false);
            setClarificationDirectInput('');
            if (idx >= 0) {
              void runtime.send(`clarify:opt_${idx + 1}`, {
                hideUserMessage: true,
              });
            }
          }}
          onOpenDirectInput={() => {
            setClarificationDirectInputOpen(true);
          }}
          onDirectInputChange={value => {
            setClarificationDirectInput(value);
          }}
          onTellDirectly={() => {
            const text = clarificationDirectInput.trim();
            if (!text) {
              return;
            }
            setPendingClarification(null);
            setClarificationDirectInputOpen(false);
            setClarificationDirectInput('');
            void runtime.send(text);
          }}
        />
      )}

      <div className="assistant-viewport">
        <div className="assistant-top-chrome">
          <Header
            auth={auth}
            onShowAuth={() => setView('auth')}
            chatHistory={
              auth.isAuthenticated && view === 'chat'
                ? {
                    conversations: runtime.chatConversations,
                    activeId: runtime.activeChatId,
                    onSelectConversation: id => {
                      void runtime.openConversation(id);
                    },
                    onNewChat: () => {
                      void runtime.startNewChat();
                    },
                    onDeleteConversation: id => {
                      void runtime.deleteChatConversation(id);
                    },
                  }
                : null
            }
          />
        </div>

        <div
          className={`assistant-main${view === 'auth' ? ' assistant-main--auth' : ''}${view === 'chat' ? ' assistant-main--chat' : ''}${view !== 'auth' && auth.isAuthenticated && runtime.messages.length === 0 ? ' assistant-main--empty-signed-chat' : ''}`}
          aria-busy={view !== 'auth' && runtime.busy ? true : undefined}
        >
        {view !== 'auth' && (
          <div className="assistant-onboarding-top">
            <OnboardingChecklist
              auth={auth}
              view={view}
              onNavigate={onboardingNavigate}
              onCollapseRequest={onboardingCollapseTick}
            />
          </div>
        )}

        <div className={`assistant-scroll${view === 'auth' ? ' assistant-scroll--auth' : ''}`}>
          {view === 'auth' ? (
            <>
              <Auth
                onSuccess={() => setView('chat')}
                onEmailPasswordOpen={() => setOnboardingCollapseTick(t => t + 1)}
              />
              <OnboardingChecklist
                auth={auth}
                view={view}
                onNavigate={onboardingNavigate}
                onCollapseRequest={onboardingCollapseTick}
              />
            </>
          ) : (
            <div className="assistant-chat-stack">
              {auth.isAuthenticated && userEmail && bannerVisible && (
                <Banner email={userEmail} onClose={() => setBannerVisible(false)} />
              )}

              {restoreOffer ? (
                <div className="research-brief-restore-banner" role="status">
                  <span>Restore last research brief</span>
                  <button type="button" onClick={handleRestorePinnedBrief}>
                    Restore
                  </button>
                  <button
                    type="button"
                    className="research-brief-restore-dismiss"
                    onClick={() => setRestoreOffer(null)}
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}

              <ChatTimeline
                messages={runtime.messages}
                isAuthenticated={auth.isAuthenticated}
                busy={runtime.busy}
                activeToolLabel={activeToolLabel}
                responseStreaming={runtime.responseStreaming}
                onLinkClick={handleLinkClick}
                onRegenerateBriefSection={sectionId => {
                  void runtime.send(
                    `regenerate research brief section ${sectionId}`
                  );
                }}
                speakingMsgId={runtime.speakingMsgId}
                onTtsClick={handleTtsFromTimeline}
                trainingFocusTick={trainingFocusTick}
                trainingFocusMessageId={trainingFocusMessageId}
                pinnedBriefId={pinnedBriefId}
                briefPinned={briefPinnedFlag}
                onToggleBriefPin={handleToggleBriefPin}
                onSubmitPrompt={prompt => {
                  void runtime.send(prompt);
                }}
              />
            </div>
          )}
        </div>

        {view !== 'auth' && (
          <AssistantBusyBar
            busy={runtime.busy}
            activeToolLabel={activeToolLabel}
            responseStreaming={runtime.responseStreaming}
            showBriefCancel={runtime.busy && !!briefProgressLabel}
            onCancelBrief={() => {
              oasisWindow.oasisAbortResearchBrief?.();
            }}
          />
        )}
        {view !== 'auth' && (
          <Composer
            input={runtime.input}
            busy={runtime.busy}
            isAuthenticated={auth.isAuthenticated}
            chatIsEmpty={runtime.messages.length === 0}
            ttsEnabled={runtime.ttsEnabled}
            inputRef={composerInputRef}
            showInlineChips={runtime.showComposerInlineChips}
            inlineSuggestions={COMPOSER_INLINE_SUGGESTIONS}
            highlightInlineChips={starterChipsHighlight}
            onInlineSuggestionSend={text => {
              void runtime.send(text);
            }}
            onInput={runtime.handleComposerInput}
            onKeyDown={runtime.handleKeyDown}
            onSend={() => {
              void runtime.send();
            }}
            onResetSession={() => {
              void runtime.startNewChat();
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
            onOpenTraining={handleGoToTrainingFromUsageBar}
            showTrainLatestComposerHint={trainLatestComposerHint}
            onDismissTrainLatestHint={() => setTrainLatestComposerHint(false)}
            onInsertCapabilities={() => {
              runtime.insertCapabilitiesOverview();
            }}
          />
        )}
        </div>
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
