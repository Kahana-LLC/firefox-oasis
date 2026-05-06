import { useCallback, useMemo, useRef, useState } from "preact/hooks";
import { HOW_OASIS_WORKS_CHIP_LABEL } from "../utils/exampleCommands";
import {
  CAPABILITIES_OVERVIEW_FIRST_LINE,
  OASIS_CAPABILITIES_FEATURES_URL,
  OASIS_CAPABILITIES_LINK_LABEL,
  OASIS_CAPABILITIES_FEEDBACK_URL,
  OASIS_CAPABILITIES_FEEDBACK_LINK_LABEL,
} from "../../../shared/capabilitiesOverviewConstants.js";
import TOOL_LABELS from "../toolLabels";
import type {
  AssistantHistoryEntry,
  AssistantMessage,
  AuthState,
  ConfirmationData,
  OasisWindow,
  ToolAction,
  ToolActionStatus,
} from "../types";

const oasisWindow: OasisWindow = window;

function uuid() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, char => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function dispatchOasisUsageUpdate() {
  try {
    window.dispatchEvent(new CustomEvent("oasis-usage-update"));
  } catch {
    void 0;
  }
}

function prettifyToolName(name: string): string {
  if (!name) return "";
  if (name.includes(" ")) return name;
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function normalizeAssistantChunk(raw: string): string {
  return String(raw || "");
}

function isHumanHistoryEntry(entry: AssistantHistoryEntry): boolean {
  return (
    entry.type === "human" ||
    entry.id?.includes("Human") ||
    entry.constructor?.name === "HumanMessage"
  );
}

const COMPOSER_INLINE_CHIPS_MAX_SENDS = 1;
const LS_COMPOSER_CHIPS_COUNT = "oasis.assistant.composerInlineChipsSendCount";
const LS_COMPOSER_CHIPS_RETIRED = "oasis.assistant.composerInlineChipsRetired";
const COMMAND_HISTORY_CAP = 50;

function readInitialComposerInlineSends(): number {
  try {
    if (localStorage.getItem(LS_COMPOSER_CHIPS_RETIRED) === "1") {
      return COMPOSER_INLINE_CHIPS_MAX_SENDS;
    }
    const n = parseInt(
      localStorage.getItem(LS_COMPOSER_CHIPS_COUNT) || "0",
      10
    );
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function bumpComposerInlineSends(): number {
  try {
    if (localStorage.getItem(LS_COMPOSER_CHIPS_RETIRED) === "1") {
      return COMPOSER_INLINE_CHIPS_MAX_SENDS;
    }
    const raw = parseInt(
      localStorage.getItem(LS_COMPOSER_CHIPS_COUNT) || "0",
      10
    );
    const cur = Number.isFinite(raw) && raw >= 0 ? raw : 0;
    const next = cur + 1;
    localStorage.setItem(LS_COMPOSER_CHIPS_COUNT, String(next));
    if (next >= COMPOSER_INLINE_CHIPS_MAX_SENDS) {
      localStorage.setItem(LS_COMPOSER_CHIPS_RETIRED, "1");
    }
    return next;
  } catch {
    return COMPOSER_INLINE_CHIPS_MAX_SENDS;
  }
}

function appendCommandHistoryLine(store: string[], line: string) {
  const t = line.replace(/\s+/g, " ").trim();
  if (!t) {
    return;
  }
  if (store.length > 0 && store[store.length - 1] === t) {
    return;
  }
  store.push(t);
  if (store.length > COMMAND_HISTORY_CAP) {
    store.splice(0, store.length - COMMAND_HISTORY_CAP);
  }
}

export function mapHistoryEntriesToMessages(
  history: AssistantHistoryEntry[]
): AssistantMessage[] {
  return history.map((entry, index) => {
    const isHuman = isHumanHistoryEntry(entry);
    const content =
      entry.content || (entry.lc_kwargs ? entry.lc_kwargs.content : "") || "";

    return {
      id: entry.id || `hist-${index}-${entry.role || "msg"}`,
      role: isHuman ? "user" : "ai",
      content,
    };
  });
}

export function useAssistantRuntime(params: {
  auth: AuthState;
  setPendingConfirmation: (data: ConfirmationData | null) => void;
  originalResetAssistantSession?: (() => void | Promise<void>) | undefined;
}) {
  const { auth, setPendingConfirmation, originalResetAssistantSession } =
    params;

  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [responseStreaming, setResponseStreaming] = useState(false);
  const [toolActions, setToolActions] = useState<ToolAction[]>([]);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [composerInlineSends, setComposerInlineSends] = useState(
    readInitialComposerInlineSends
  );
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsObjectUrlRef = useRef<string | null>(null);
  const commandHistoryRef = useRef<string[]>([]);
  const historyNavIndexRef = useRef(-1);
  const draftBeforeHistoryRef = useRef("");

  const appendChunkToMessage = useCallback(
    (messageId: string, chunk: string) => {
      setMessages(previous => {
        const index = previous.findIndex(message => message.id === messageId);
        if (index === -1) {
          return previous;
        }
        const updated = [...previous];
        const current = updated[index];
        updated[index] = { ...current, content: `${current.content}${chunk}` };
        return updated;
      });
    },
    []
  );

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
      if (typeof ttsFn !== "function") {
        return;
      }

      stopSpeaking();
      setSpeakingMsgId(messageId);

      try {
        const plainText = text
          .replace(/<[^>]*>/g, "")
          .replace(/[#*_`~\[\]()>!|]/g, "")
          .replace(/\n{2,}/g, ". ")
          .replace(/\n/g, " ")
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
        console.error("TTS playback error:", error);
        stopSpeaking();
      }
    },
    [stopSpeaking]
  );

  const runStreamTurn = useCallback(
    async (prompt: string, inputType: "text" | "voice" = "text") => {
      const run = oasisWindow.runAssistantStream;
      if (typeof run !== "function") {
        setMessages(previous => [
          ...previous,
          {
            id: uuid(),
            role: "ai",
            content: "(runAssistantStream not available)",
          },
        ]);
        return null;
      }

      const aiMessageId = uuid();
      setMessages(previous => [
        ...previous,
        { id: aiMessageId, role: "ai", content: "" },
      ]);

      let sawContentChunk = false;
      const fullText = await run(
        prompt,
        (chunk: string) => {
          const normalized = normalizeAssistantChunk(chunk);
          if (!normalized) {
            return;
          }
          if (!sawContentChunk) {
            sawContentChunk = true;
            setResponseStreaming(true);
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

  const startToolAction = useCallback(
    (name: string, messageId?: string, label?: string) => {
      const id = uuid();
      const display = label || TOOL_LABELS[name] || prettifyToolName(name);
      setToolActions(previous => [
        ...previous,
        { id, name, status: "running", messageId, label: display },
      ]);
      return id;
    },
    []
  );

  const updateToolAction = useCallback(
    (id: string, status: ToolActionStatus) => {
      setToolActions(previous =>
        previous.map(action =>
          action.id === id ? { ...action, status } : action
        )
      );
    },
    []
  );

  const activeToolAction = useMemo(
    () =>
      [...toolActions]
        .reverse()
        .find(
          action => action.status === "running" || action.status === "pending"
        ) || null,
    [toolActions]
  );

  const showComposerInlineChips = useMemo(
    () =>
      auth.isAuthenticated &&
      (messages.length === 0 ||
        composerInlineSends < COMPOSER_INLINE_CHIPS_MAX_SENDS),
    [auth.isAuthenticated, messages.length, composerInlineSends]
  );

  const handleComposerInput = useCallback((value: string) => {
    historyNavIndexRef.current = -1;
    setInput(value);
  }, []);

  const resetAssistantSession = useCallback(async () => {
    setMessages([]);
    setToolActions([]);
    setComposerInlineSends(0);
    try {
      localStorage.removeItem(LS_COMPOSER_CHIPS_COUNT);
      localStorage.removeItem(LS_COMPOSER_CHIPS_RETIRED);
    } catch {
      void 0;
    }

    if (typeof originalResetAssistantSession === "function") {
      await Promise.resolve(originalResetAssistantSession());
    }

    const setHistory = oasisWindow.setAssistantHistory;
    if (typeof setHistory === "function") {
      await setHistory([]);
    }
  }, [originalResetAssistantSession]);

  const CAPABILITIES_FALLBACK_MARKDOWN = [
    CAPABILITIES_OVERVIEW_FIRST_LINE,
    "",
    "Oasis assistant capabilities are not available in this build.",
    "",
    "You can still describe what you wanted in plain English. When something is wrong or missing, use the feedback link below or the thumbs up and thumbs down on assistant replies (training) so we can widen what Oasis supports.",
    "",
    "### Support and feedback",
    "",
    "Kahana lists commands in depth; the feedback form captures suggestions. Thumbs on each reply add training signal so we can expand supported behavior quickly.",
    "",
    `- [${OASIS_CAPABILITIES_LINK_LABEL}](${OASIS_CAPABILITIES_FEATURES_URL})`,
    `- [${OASIS_CAPABILITIES_FEEDBACK_LINK_LABEL}](${OASIS_CAPABILITIES_FEEDBACK_URL})`,
  ].join("\n");

  const insertCapabilitiesOverview = useCallback(() => {
    if (!auth.isAuthenticated) {
      setMessages(previous => [
        ...previous,
        {
          id: uuid(),
          role: "ai",
          content: "Please sign in to use the assistant.",
        },
      ]);
      return;
    }
    stopSpeaking();
    setComposerInlineSends(bumpComposerInlineSends());
    let aiContent = CAPABILITIES_FALLBACK_MARKDOWN;
    try {
      const raw = oasisWindow.getOasisCapabilitiesMarkdown?.();
      if (raw && raw.replace(/\s+/g, "").length > 0) {
        aiContent = raw;
      }
    } catch {
      aiContent = CAPABILITIES_FALLBACK_MARKDOWN;
    }
    oasisWindow.oasisPushLocalChatTurn?.(HOW_OASIS_WORKS_CHIP_LABEL, aiContent);
    const userId = uuid();
    const aiId = uuid();
    setMessages(previous => [
      ...previous,
      { id: userId, role: "user", content: HOW_OASIS_WORKS_CHIP_LABEL },
      { id: aiId, role: "ai", content: aiContent },
    ]);
    const st = oasisWindow.assistantBridge?.getOnboardingStatus?.();
    if (st && !st.firstAiTurnComplete) {
      oasisWindow.assistantBridge?.markFirstAiTurnComplete?.();
    }
    dispatchOasisUsageUpdate();
  }, [auth.isAuthenticated, stopSpeaking]);

  const send = useCallback(
    async (textInput?: string, options?: { fromVoice?: boolean }) => {
      const fromVoice = options?.fromVoice ?? false;
      const text = textInput || input;
      if (!text.trim()) {
        return;
      }

      if (!auth.isAuthenticated) {
        setMessages(previous => [
          ...previous,
          {
            id: uuid(),
            role: "ai",
            content: "Please sign in to use the assistant.",
          },
        ]);
        return;
      }

      stopSpeaking();
      if (!fromVoice) {
        appendCommandHistoryLine(commandHistoryRef.current, text);
        historyNavIndexRef.current = -1;
        setComposerInlineSends(bumpComposerInlineSends());
      }
      setInput("");
      setResponseStreaming(false);
      setBusy(true);
      setToolActions([]);
      const userMessageId = uuid();
      setMessages(previous => [
        ...previous,
        { id: userMessageId, role: "user", content: text },
      ]);

      try {
        const result = await runStreamTurn(text, fromVoice ? "voice" : "text");
        if (result) {
          const st = oasisWindow.assistantBridge?.getOnboardingStatus?.();
          if (st && !st.firstAiTurnComplete) {
            oasisWindow.assistantBridge?.markFirstAiTurnComplete?.();
          }
        }
        if (fromVoice && ttsEnabled && result?.fullText?.trim()) {
          void speakText(result.fullText, result.aiMessageId);
        }
      } catch (error) {
        setMessages(previous => [
          ...previous,
          { id: uuid(), role: "ai", content: `Error: ${String(error)}` },
        ]);
      } finally {
        setResponseStreaming(false);
        setBusy(false);
        dispatchOasisUsageUpdate();
      }
    },
    [
      auth.isAuthenticated,
      input,
      runStreamTurn,
      speakText,
      stopSpeaking,
      ttsEnabled,
    ]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        historyNavIndexRef.current = -1;
        void send();
        return;
      }
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
        return;
      }
      if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const ta = event.target as HTMLTextAreaElement | null;
      if (!ta || ta.tagName !== "TEXTAREA") {
        return;
      }
      const value = ta.value;
      const sel = ta.selectionStart ?? 0;
      const history = commandHistoryRef.current;
      if (history.length === 0) {
        return;
      }
      const firstNl = value.indexOf("\n");
      const onFirstLine = firstNl === -1 || sel <= firstNl;
      if (event.key === "ArrowUp") {
        let idx = historyNavIndexRef.current;
        if (idx < 0) {
          if (!onFirstLine) {
            return;
          }
          draftBeforeHistoryRef.current = value;
          idx = 0;
        } else {
          if (idx >= history.length - 1) {
            return;
          }
          idx += 1;
        }
        historyNavIndexRef.current = idx;
        const line = history[history.length - 1 - idx];
        event.preventDefault();
        setInput(line);
        return;
      }
      const idx = historyNavIndexRef.current;
      if (idx < 0) {
        return;
      }
      event.preventDefault();
      if (idx === 0) {
        historyNavIndexRef.current = -1;
        setInput(draftBeforeHistoryRef.current);
        return;
      }
      const nextIdx = idx - 1;
      historyNavIndexRef.current = nextIdx;
      setInput(history[history.length - 1 - nextIdx]);
    },
    [send, setInput]
  );

  const handleConfirmationApprove = useCallback(async () => {
    setPendingConfirmation(null);
    stopSpeaking();
    setResponseStreaming(false);
    setBusy(true);
    setToolActions([]);
    try {
      await runStreamTurn("yes", "text");
    } finally {
      setResponseStreaming(false);
      setBusy(false);
      dispatchOasisUsageUpdate();
    }
  }, [runStreamTurn, setPendingConfirmation, stopSpeaking]);

  const handleConfirmationCancel = useCallback(async () => {
    setPendingConfirmation(null);
    stopSpeaking();
    setResponseStreaming(false);
    setBusy(true);
    setToolActions([]);
    try {
      await runStreamTurn("no", "text");
    } catch {
      const clearPending = oasisWindow.oasisClearPendingConfirmation;
      if (typeof clearPending === "function") {
        clearPending();
      }
      setMessages(previous => [
        ...previous,
        { id: uuid(), role: "ai", content: "Action cancelled." },
      ]);
    } finally {
      setResponseStreaming(false);
      setBusy(false);
      dispatchOasisUsageUpdate();
    }
  }, [runStreamTurn, setPendingConfirmation, stopSpeaking]);

  const toggleTtsEnabled = useCallback(() => {
    setTtsEnabled(previous => {
      if (previous) {
        stopSpeaking();
      }
      return !previous;
    });
  }, [stopSpeaking]);

  const voiceTurnBeginForChat = useCallback((userTranscript: string) => {
    const userMessageId = uuid();
    const aiMessageId = uuid();
    setMessages(previous => [
      ...previous,
      { id: userMessageId, role: "user", content: userTranscript },
      { id: aiMessageId, role: "ai", content: "" },
    ]);
    return aiMessageId;
  }, []);

  const voiceStreamChunkForChat = useCallback(
    (messageId: string, chunk: string) => {
      const normalized = normalizeAssistantChunk(chunk);
      if (!normalized) {
        return;
      }
      appendChunkToMessage(messageId, normalized);
    },
    [appendChunkToMessage]
  );

  const voiceSpokenTurnMirrorForChat = useCallback(
    (userTranscript: string, assistantText: string) => {
      const trimmedUser = userTranscript.replace(/\s+/g, " ").trim();
      const trimmedAi = assistantText.replace(/\s+/g, " ").trim();
      if (!trimmedUser && !trimmedAi) {
        return;
      }
      setMessages(previous => [
        ...previous,
        ...(trimmedUser
          ? [{ id: uuid(), role: "user" as const, content: trimmedUser }]
          : []),
        ...(trimmedAi
          ? [{ id: uuid(), role: "ai" as const, content: trimmedAi }]
          : []),
      ]);
    },
    []
  );

  return {
    messages,
    setMessages,
    input,
    setInput,
    handleComposerInput,
    busy,
    responseStreaming,
    toolActions,
    activeToolAction,
    send,
    insertCapabilitiesOverview,
    handleKeyDown,
    showComposerInlineChips,
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
    voiceTurnBeginForChat,
    voiceStreamChunkForChat,
    voiceSpokenTurnMirrorForChat,
  };
}
