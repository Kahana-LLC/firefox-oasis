import { h, Fragment } from 'preact';
import { useCallback, useRef, useState } from 'preact/hooks';
import { Header } from './components/Header';
import { Auth } from './components/Auth';
import { ConfirmationModal } from './components/ConfirmationModal';
import { ChatTimeline } from './components/ChatTimeline';
import { Composer } from './components/Composer';
import { useAssistantRuntime } from './hooks/useAssistantRuntime';
import { useAuthSync } from './hooks/useAuthSync';
import { useAssistantBridge } from './hooks/useAssistantBridge';
import type { AuthState, ConfirmationData, OasisWindow } from './types';
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

export function App() {
  const [auth, setAuth] = useState<AuthState>({ isAuthenticated: false, user: null });
  const [view, setView] = useState<'chat' | 'auth'>('chat');
  const [bannerVisible, setBannerVisible] = useState(true);
  const [pendingConfirmation, setPendingConfirmation] = useState<ConfirmationData | null>(null);

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

  const userEmail = userEmailOf(auth.user);

  return (
    <div className="assistant-container">
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
          />

          <Composer
            input={runtime.input}
            isRecording={runtime.isRecording}
            busy={runtime.busy}
            isAuthenticated={auth.isAuthenticated}
            onInput={runtime.setInput}
            onKeyDown={runtime.handleKeyDown}
            onSend={() => {
              void runtime.send();
            }}
            onToggleRecording={() => {
              void runtime.toggleRecording();
            }}
            onResetSession={() => {
              void oasisWindow.resetAssistantSession?.();
            }}
            onFeedback={handleFeedback}
          />
        </Fragment>
      )}
    </div>
  );
}
