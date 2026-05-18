export type AssistantInputType = "text" | "voice";
export type InteractionCommandArgs = Record<string, unknown>;

export type ToolActionStatus = "pending" | "running" | "done" | "error";
export type ToolBridgeUpdateStatus = "done" | "error";

export type AmbiguityTarget = "bookmark-folder" | "tab-group" | "tab";

export type PendingConfirmationPayload = {
  command: string;
  args: InteractionCommandArgs;
  description: string;
};

export type PendingAmbiguityPayload = {
  kind: "container_target" | "close_delete_target";
  name: string;
  query?: string;
  all?: boolean;
  originalText: string;
  choices?: AmbiguityTarget[];
  tabIndex?: number;
  verb?: string;
  description: string;
};

export type ClarificationOption = {
  id: string;
  label: string;
  resolvedPrompt: string;
};

export type PendingClarificationPayload = {
  originalMessage: string;
  options: ClarificationOption[];
};

export const OASIS_EVENT_CLARIFICATION_UPDATE =
  "oasis-clarification-update" as const;

export type OasisRecordToolActionStart = (
  commandName: string,
  messageId?: string,
  label?: string
) => string | undefined;

export type OasisRecordToolActionUpdate = (
  actionId: string,
  status: ToolBridgeUpdateStatus
) => void;

export type AssistantHistoryWireEntry = {
  id?: string;
  role?: string;
  type?: string;
  content?: string;
  lc_kwargs?: { content?: string };
  constructor?: { name?: string };
};

export type VoiceUiDelivery = "spoken" | "text_chat";

export type RunAssistantStream = (
  prompt: string,
  onChunk: (chunk: string) => void,
  inputType?: AssistantInputType,
  messageId?: string,
  voiceDelivery?: VoiceUiDelivery
) => Promise<string>;

export const OASIS_EVENT_AUTH_UPDATE = "oasis-auth-update" as const;
export const OASIS_EVENT_HISTORY_UPDATE = "oasis-history-update" as const;
export const OASIS_EVENT_CONFIRMATION_UPDATE =
  "oasis-confirmation-update" as const;
export const OASIS_EVENT_BOOKMARK_FOLDERS_CHANGED =
  "oasis-bookmark-folders-changed" as const;

export type OasisEventName =
  | typeof OASIS_EVENT_AUTH_UPDATE
  | typeof OASIS_EVENT_HISTORY_UPDATE
  | typeof OASIS_EVENT_CONFIRMATION_UPDATE
  | typeof OASIS_EVENT_CLARIFICATION_UPDATE
  | typeof OASIS_EVENT_BOOKMARK_FOLDERS_CHANGED;

export type BookmarkFoldersChangedDetail = {
  folderNames?: string[];
};

export type OasisEventDetailMap = {
  [OASIS_EVENT_AUTH_UPDATE]: unknown;
  [OASIS_EVENT_HISTORY_UPDATE]: undefined;
  [OASIS_EVENT_CONFIRMATION_UPDATE]: PendingConfirmationPayload | null;
  [OASIS_EVENT_CLARIFICATION_UPDATE]: PendingClarificationPayload | null;
  [OASIS_EVENT_BOOKMARK_FOLDERS_CHANGED]: BookmarkFoldersChangedDetail;
};
