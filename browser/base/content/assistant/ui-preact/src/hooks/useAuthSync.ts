import { useEffect } from 'preact/hooks';
import {
  OASIS_EVENT_AUTH_UPDATE,
  OASIS_EVENT_CONFIRMATION_UPDATE,
  OASIS_EVENT_HISTORY_UPDATE,
} from '../../../shared/contracts.js';
import type {
  AssistantHistoryEntry,
  AssistantMessage,
  AuthState,
  ConfirmationData,
  OasisWindow,
  SupabaseAuthState,
} from '../types';
import { mapHistoryEntriesToMessages } from './useAssistantRuntime';

const oasisWindow: OasisWindow = window;

function userIdOf(user: AuthState['user']): string | undefined {
  if (!user || typeof user === 'string') return undefined;
  return typeof user.id === 'string' ? user.id : undefined;
}

type AuthSubscriptionCleanup = (() => void) | undefined;

function toCleanup(value: unknown): AuthSubscriptionCleanup {
  if (typeof value === 'function') {
    return value as () => void;
  }
  if (value && typeof value === 'object') {
    const asRecord = value as {
      unsubscribe?: unknown;
      data?: { subscription?: { unsubscribe?: unknown } };
    };
    if (typeof asRecord.unsubscribe === 'function') {
      return () => {
        (asRecord.unsubscribe as () => void)();
      };
    }
    if (typeof asRecord.data?.subscription?.unsubscribe === 'function') {
      const unsubscribe = asRecord.data.subscription.unsubscribe as () => void;
      return () => {
        unsubscribe();
      };
    }
  }
  return undefined;
}

export function useAuthSync(params: {
  setAuth: (next: AuthState | ((prev: AuthState) => AuthState)) => void;
  setMessages: (updater: (prev: AssistantMessage[]) => AssistantMessage[]) => void;
  setPendingConfirmation: (data: ConfirmationData | null) => void;
  onAuthenticated: () => void;
  onUserChanged: () => void;
}) {
  const { setAuth, setMessages, setPendingConfirmation, onAuthenticated, onUserChanged } = params;

  useEffect(() => {
    const updateFromGlobal = () => {
      const globalState = oasisWindow.oasisAuthState;
      if (!globalState || globalState.isAuthenticated === undefined) {
        return;
      }

      setAuth((previous) => {
        const sameAuth = previous.isAuthenticated === globalState.isAuthenticated;
        const sameUser = userIdOf(previous.user) === userIdOf(globalState.user);
        if (sameAuth && sameUser) {
          return previous;
        }
        if (!sameUser) {
          onUserChanged();
        }
        return {
          isAuthenticated: !!globalState.isAuthenticated,
          user: globalState.user,
        };
      });

      if (globalState.isAuthenticated) {
        onAuthenticated();
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
          const formatted = mapHistoryEntriesToMessages(history as AssistantHistoryEntry[]);
          setMessages(() => formatted);
        } catch {
          // ignore
        }
      })();
    };

    const checkAuth = async () => {
      try {
        const globalState = oasisWindow.oasisAuthState;
        if (globalState?.isAuthenticated) {
          setAuth({ isAuthenticated: true, user: globalState.user });
          onAuthenticated();
          return;
        }

        const supabaseAuth = oasisWindow.supabaseAuth;
        if (!supabaseAuth) {
          return;
        }

        const isAuthenticated = await supabaseAuth.isAuthenticated();
        if (!isAuthenticated) {
          return;
        }

        const user = await supabaseAuth.getCurrentUser();
        setAuth({ isAuthenticated: true, user });
        onAuthenticated();
      } catch {
        // ignore
      }
    };

    void checkAuth();

    window.addEventListener(OASIS_EVENT_AUTH_UPDATE, updateFromGlobal);
    window.addEventListener(OASIS_EVENT_HISTORY_UPDATE, loadHistory);
    const handleConfirmationUpdate = (event: Event) => {
      const detail = (event as CustomEvent<ConfirmationData | null>).detail;
      setPendingConfirmation(detail);
    };
    window.addEventListener(OASIS_EVENT_CONFIRMATION_UPDATE, handleConfirmationUpdate);

    let authCleanup: AuthSubscriptionCleanup;
    if (typeof oasisWindow.supabaseAuth?.onAuthStateChange === 'function') {
      const maybeCleanup = oasisWindow.supabaseAuth.onAuthStateChange(
        (state: SupabaseAuthState) => {
          setAuth({ isAuthenticated: !!state.isAuthenticated, user: state.user });
          if (state.isAuthenticated) {
            onAuthenticated();
            onUserChanged();
          }
        }
      );
      authCleanup = toCleanup(maybeCleanup);
    }

    const pollTimer = window.setTimeout(() => {
      void checkAuth();
    }, 1500);
    const delayedHistoryTimer = window.setTimeout(loadHistory, 500);

    loadHistory();

    return () => {
      window.removeEventListener(OASIS_EVENT_AUTH_UPDATE, updateFromGlobal);
      window.removeEventListener(OASIS_EVENT_HISTORY_UPDATE, loadHistory);
      window.removeEventListener(OASIS_EVENT_CONFIRMATION_UPDATE, handleConfirmationUpdate);
      window.clearTimeout(pollTimer);
      window.clearTimeout(delayedHistoryTimer);
      authCleanup?.();
    };
  }, [onAuthenticated, onUserChanged, setAuth, setMessages, setPendingConfirmation]);
}
