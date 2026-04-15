import type {
  AssistantHistoryWireEntry,
  OasisRecordToolActionStart,
  OasisRecordToolActionUpdate,
  PendingConfirmationPayload,
  RunAssistantStream,
  ToolActionStatus as SharedToolActionStatus,
} from "../../shared/contracts.js";

export type ToolActionStatus = SharedToolActionStatus;

export type AssistantRole = "user" | "ai";

export interface AssistantMessage {
  id: string;
  role: AssistantRole;
  content: string;
}

export interface ToolAction {
  id: string;
  name: string;
  status: ToolActionStatus;
  messageId?: string;
  label?: string;
}

export interface AuthUser {
  id?: string;
  email?: string;
  [key: string]: unknown;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | string | null;
}

export type ConfirmationData = PendingConfirmationPayload;

export type VoiceAgentState =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking";

export type VoiceAgentListeningSource = "user" | "continuous" | "handsfree";

export type VoiceCaptureMode = "continuous" | "precise";

export type VoiceAgentEvent =
  | {
      type: "state";
      state: VoiceAgentState;
      listeningSource?: VoiceAgentListeningSource;
    }
  | { type: "userTranscript"; text: string }
  | { type: "error"; message: string }
  | { type: "turn_done" }
  | { type: "assistant_reply_text"; text: string }
  | { type: "vad"; userSpeaking: boolean }
  | { type: "audio_level"; mic: number; tts: number }
  | { type: "listening_phase"; phase: "echo_guard" | "capturing" };
export type AssistantHistoryEntry = AssistantHistoryWireEntry;

export interface SupabaseAuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  session?: unknown;
}

export interface SupabaseAuthLike {
  isAuthenticated(): Promise<boolean>;
  getCurrentUser(): Promise<AuthUser | null>;
  signOut(): Promise<void>;
  signUp(
    email: string,
    password: string
  ): Promise<{ user: AuthUser | null; error?: { message?: string } | null }>;
  signInWithEmail(
    email: string,
    password: string
  ): Promise<{ user: AuthUser | null; error?: { message?: string } | null }>;
  resetPasswordForEmail(
    email: string
  ): Promise<{ error?: { message?: string } | null }>;
  handleAuthError?(error: unknown): string;
  onAuthStateChange?(
    cb: (state: SupabaseAuthState) => void
  ):
    | void
    | (() => void)
    | { unsubscribe?: () => void }
    | { data?: { subscription?: { unsubscribe?: () => void } } };
  currentSession?: { session_id?: string };
  supabase?: {
    auth: {
      getUser(): Promise<{ data: { user: AuthUser | null } }>;
    };
    from(table: string): {
      insert(payload: unknown): Promise<{ error: { message?: string } | null }>;
    };
  };
}

export type OnboardingStatus = {
  guidedFlowEnabled: boolean;
  migrationCompleted: boolean;
  postMigrationTipShown: boolean;
  checklistDismissed: boolean;
  oauthAttemptStarted: boolean;
  importOptOut: boolean;
  firstAiTurnComplete: boolean;
  welcomeCompleted: boolean;
};

export interface AssistantBridgeLike {
  openTab(url: string): boolean;
  getAssistantHistory?():
    | AssistantHistoryEntry[]
    | Promise<AssistantHistoryEntry[]>;
  setAssistantHistory?(history: AssistantHistoryEntry[]): Promise<void>;
  getAuthState?(): AuthState;
  getOnboardingStatus?(): OnboardingStatus | null;
  markOauthSignInStarted?(): void;
  dismissOnboardingChecklist?(): void;
  markImportOptOut?(): void;
  markFirstAiTurnComplete?(): void;
  openImportBrowserData?(): boolean;
}

type MarkedLike = {
  parse(markdown: string): string;
};

type DOMPurifyLike = {
  sanitize(input: string): string;
};

export type OasisWindow = Window & {
  oasisAuthState?: AuthState;
  supabaseAuth?: SupabaseAuthLike;
  subscriptionService?: {
    forceRefresh?: () => Promise<void>;
  };
  assistantBridge?: AssistantBridgeLike;
  runAssistantStream?: RunAssistantStream;
  voiceInputService?: {
    startRecording(): Promise<void>;
    stopRecording(): Promise<string | null>;
  };
  getAssistantHistory?: () =>
    | AssistantHistoryEntry[]
    | Promise<AssistantHistoryEntry[]>;
  setAssistantHistory?: (history: AssistantHistoryEntry[]) => Promise<void>;
  resetAssistantSession?: () => void | Promise<void>;
  oasisRecordToolActionStart?: OasisRecordToolActionStart;
  oasisRecordToolActionUpdate?: OasisRecordToolActionUpdate;
  oasisSetPendingConfirmationRelay?: (data: ConfirmationData | null) => void;
  oasisClearPendingConfirmation?: () => void;
  textToSpeech?: (text: string) => Promise<Blob>;
  voiceAgent?: {
    on(listener: (event: VoiceAgentEvent) => void): () => void;
    getState(): string;
    startConversation(): Promise<void>;
    startListening(opts?: {
      source?: VoiceAgentListeningSource;
    }): Promise<void>;
    finishListening(): Promise<void>;
    stop(): void;
    stopSpeaking(): void;
    setContinuousConversation(enabled: boolean): void;
    getContinuousConversation(): boolean;
    getListeningSource(): VoiceAgentListeningSource | null;
    getUserSpeaking(): boolean;
    getCaptureMode(): VoiceCaptureMode;
    setCaptureMode(mode: VoiceCaptureMode): void;
    getVoiceSpokenRepliesEnabled(): boolean;
    setVoiceSpokenRepliesEnabled(enabled: boolean): void;
  };
  oasisVoiceAssistantTurnBegin?: (userTranscript: string) => string;
  oasisVoiceAssistantStreamChunk?: (messageId: string, chunk: string) => void;
  oasisVoiceSpokenTurnMirror?: (
    userTranscript: string,
    assistantText: string
  ) => void;
  openWebLinkIn?: (
    url: string,
    where: string,
    options: Record<string, unknown>
  ) => void;
  mpTrack?: (event: string, props?: Record<string, unknown>) => void;
  marked?: MarkedLike;
  DOMPurify?: DOMPurifyLike;
};
