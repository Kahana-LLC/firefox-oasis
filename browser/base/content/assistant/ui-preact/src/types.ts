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
  signUp(email: string, password: string): Promise<{ user: AuthUser | null; error?: { message?: string } | null }>;
  signInWithEmail(email: string, password: string): Promise<{ user: AuthUser | null; error?: { message?: string } | null }>;
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

export interface AssistantBridgeLike {
  openTab(url: string): boolean;
  getAssistantHistory?(): AssistantHistoryEntry[] | Promise<AssistantHistoryEntry[]>;
  setAssistantHistory?(history: AssistantHistoryEntry[]): Promise<void>;
  getAuthState?(): AuthState;
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
  assistantBridge?: AssistantBridgeLike;
  runAssistantStream?: RunAssistantStream;
  voiceInputService?: {
    startRecording(): Promise<void>;
    stopRecording(): Promise<string | null>;
  };
  getAssistantHistory?: () => AssistantHistoryEntry[] | Promise<AssistantHistoryEntry[]>;
  setAssistantHistory?: (history: AssistantHistoryEntry[]) => Promise<void>;
  resetAssistantSession?: () => void | Promise<void>;
  oasisRecordToolActionStart?: OasisRecordToolActionStart;
  oasisRecordToolActionUpdate?: OasisRecordToolActionUpdate;
  oasisSetPendingConfirmationRelay?: (data: ConfirmationData | null) => void;
  oasisClearPendingConfirmation?: () => void;
  openWebLinkIn?: (url: string, where: string, options: Record<string, unknown>) => void;
  mpTrack?: (event: string, props?: Record<string, unknown>) => void;
  marked?: MarkedLike;
  DOMPurify?: DOMPurifyLike;
};
