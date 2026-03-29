import { useCallback, useMemo, useRef, useState } from 'preact/hooks';
import TOOL_LABELS from '../toolLabels';
import type {
  AssistantHistoryEntry,
  AssistantMessage,
  AuthState,
  ConfirmationData,
  OasisWindow,
  ToolAction,
  ToolActionStatus,
} from '../types';

const oasisWindow: OasisWindow = window;

function uuid() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function prettifyToolName(name: string): string {
  if (!name) return '';
  if (name.includes(' ')) return name;
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function normalizeAssistantChunk(raw: string): string {
  return String(raw || '');
}

function isHumanHistoryEntry(entry: AssistantHistoryEntry): boolean {
  return (
    entry.type === 'human' ||
    entry.id?.includes('Human') ||
    entry.constructor?.name === 'HumanMessage'
  );
}

export function mapHistoryEntriesToMessages(
  history: AssistantHistoryEntry[]
): AssistantMessage[] {
  return history.map((entry, index) => {
    const isHuman = isHumanHistoryEntry(entry);
    const content =
      entry.content ||
      (entry.lc_kwargs ? entry.lc_kwargs.content : '') ||
      '';

    return {
      id: entry.id || `hist-${index}-${entry.role || 'msg'}`,
      role: isHuman ? 'user' : 'ai',
      content,
    };
  });
}

export function useAssistantRuntime(params: {
  auth: AuthState;
  setPendingConfirmation: (data: ConfirmationData | null) => void;
  originalResetAssistantSession?: (() => void | Promise<void>) | undefined;
}) {
  const { auth, setPendingConfirmation, originalResetAssistantSession } = params;

  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [toolActions, setToolActions] = useState<ToolAction[]>([]);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsObjectUrlRef = useRef<string | null>(null);

  const appendChunkToMessage = useCallback((messageId: string, chunk: string) => {
    setMessages((previous) => {
      const index = previous.findIndex((message) => message.id === messageId);
      if (index === -1) {
        return previous;
      }
      const updated = [...previous];
      const current = updated[index];
      updated[index] = { ...current, content: `${current.content}${chunk}` };
      return updated;
    });
  }, []);

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

  const speakText = useCallback(
    async (text: string, messageId: string) => {
      const ttsFn = oasisWindow.textToSpeech;
      if (typeof ttsFn !== 'function') {
        return;
      }

      stopSpeaking();
      setSpeakingMsgId(messageId);

      try {
        const plainText = text
          .replace(/<[^>]*>/g, '')
          .replace(/[#*_`~\[\]()>!|]/g, '')
          .replace(/\n{2,}/g, '. ')
          .replace(/\n/g, ' ')
          .trim();
        if (!plainText) {
          return;
        }

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
      } catch (error) {
        console.error('TTS playback error:', error);
        stopSpeaking();
      }
    },
    [stopSpeaking]
  );

  const runStreamTurn = useCallback(
    async (prompt: string, inputType: 'text' | 'voice' = 'text') => {
      const run = oasisWindow.runAssistantStream;
      if (typeof run !== 'function') {
        setMessages((previous) => [
          ...previous,
          { id: uuid(), role: 'ai', content: '(runAssistantStream not available)' },
        ]);
        return null;
      }

      const aiMessageId = uuid();
      setMessages((previous) => [...previous, { id: aiMessageId, role: 'ai', content: '' }]);

      const fullText = await run(
        prompt,
        (chunk: string) => {
          const normalized = normalizeAssistantChunk(chunk);
          if (!normalized) {
            return;
          }
          appendChunkToMessage(aiMessageId, normalized);
        },
        inputType,
        aiMessageId
      );
      return { fullText, aiMessageId };
    },
    [appendChunkToMessage]
  );

  const startToolAction = useCallback((name: string, messageId?: string, label?: string) => {
    const id = uuid();
    const display = label || TOOL_LABELS[name] || prettifyToolName(name);
    setToolActions((previous) => [
      ...previous,
      { id, name, status: 'running', messageId, label: display },
    ]);
    return id;
  }, []);

  const updateToolAction = useCallback((id: string, status: ToolActionStatus) => {
    setToolActions((previous) =>
      previous.map((action) => (action.id === id ? { ...action, status } : action))
    );
  }, []);

  const activeToolAction = useMemo(
    () =>
      [...toolActions]
        .reverse()
        .find((action) => action.status === 'running' || action.status === 'pending') ||
      null,
    [toolActions]
  );

  const resetAssistantSession = useCallback(async () => {
    setMessages([]);
    setToolActions([]);

    if (typeof originalResetAssistantSession === 'function') {
      await Promise.resolve(originalResetAssistantSession());
    }

    const setHistory = oasisWindow.setAssistantHistory;
    if (typeof setHistory === 'function') {
      await setHistory([]);
    }
  }, [originalResetAssistantSession]);

  const send = useCallback(
    async (textInput?: string, options?: { fromVoice?: boolean }) => {
      const fromVoice = options?.fromVoice ?? false;
      const text = textInput || input;
      if (!text.trim()) {
        return;
      }

      if (!auth.isAuthenticated) {
        setMessages((previous) => [
          ...previous,
          {
            id: uuid(),
            role: 'ai',
            content: 'Please sign in to use the assistant.',
          },
        ]);
        return;
      }

      stopSpeaking();
      setInput('');
      setBusy(true);
      setToolActions([]);
      const userMessageId = uuid();
      setMessages((previous) => [
        ...previous,
        { id: userMessageId, role: 'user', content: text },
      ]);

      try {
        const result = await runStreamTurn(text, fromVoice ? 'voice' : 'text');
        if (fromVoice && ttsEnabled && result?.fullText?.trim()) {
          void speakText(result.fullText, result.aiMessageId);
        }
      } catch (error) {
        setMessages((previous) => [
          ...previous,
          { id: uuid(), role: 'ai', content: `Error: ${String(error)}` },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [auth.isAuthenticated, input, runStreamTurn, speakText, stopSpeaking, ttsEnabled]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void send();
      }
    },
    [send]
  );

  const toggleRecording = useCallback(async () => {
    const service = oasisWindow.voiceInputService;
    if (!service) {
      alert('Voice input service not available.');
      return;
    }

    try {
      if (isRecording) {
        const text = await service.stopRecording();
        setIsRecording(false);
        if (text?.trim()) {
          void send(text, { fromVoice: true });
        }
        return;
      }

      stopSpeaking();
      await service.startRecording();
      setIsRecording(true);
    } catch {
      setIsRecording(false);
    }
  }, [isRecording, send, stopSpeaking]);

  const handleConfirmationApprove = useCallback(async () => {
    setPendingConfirmation(null);
    stopSpeaking();
    setBusy(true);
    setToolActions([]);
    try {
      await runStreamTurn('yes', 'text');
    } finally {
      setBusy(false);
    }
  }, [runStreamTurn, setPendingConfirmation, stopSpeaking]);

  const handleConfirmationCancel = useCallback(async () => {
    setPendingConfirmation(null);
    stopSpeaking();
    setBusy(true);
    setToolActions([]);
    try {
      await runStreamTurn('no', 'text');
    } catch {
      const clearPending = oasisWindow.oasisClearPendingConfirmation;
      if (typeof clearPending === 'function') {
        clearPending();
      }
      setMessages((previous) => [
        ...previous,
        { id: uuid(), role: 'ai', content: 'Action cancelled.' },
      ]);
    } finally {
      setBusy(false);
    }
  }, [runStreamTurn, setPendingConfirmation, stopSpeaking]);

  const toggleTtsEnabled = useCallback(() => {
    setTtsEnabled((previous) => {
      if (previous) {
        stopSpeaking();
      }
      return !previous;
    });
  }, [stopSpeaking]);

  return {
    messages,
    setMessages,
    input,
    setInput,
    busy,
    isRecording,
    toolActions,
    activeToolAction,
    send,
    handleKeyDown,
    toggleRecording,
    handleConfirmationApprove,
    handleConfirmationCancel,
    startToolAction,
    updateToolAction,
    resetAssistantSession,
    ttsEnabled,
    toggleTtsEnabled,
    speakingMsgId,
    speakText,
    stopSpeaking,
  };
}
