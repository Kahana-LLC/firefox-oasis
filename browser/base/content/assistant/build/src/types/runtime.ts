/** Type definitions for Firefox's privileged runtime objects: gBrowser, tabs, tab groups, PlacesUtils, Services, and the assistant's window interface. */
import type { BaseMessage } from "@langchain/core/messages";
import type SupabaseAuth from "../services/supabase.js";
import type voiceInputService from "../services/voiceInput.js";
import type {
  OasisRecordToolActionStart,
  OasisRecordToolActionUpdate,
  PendingAmbiguityPayload,
  PendingConfirmationPayload,
  RunAssistantStream,
} from "../../../shared/contracts.js";

export type UnknownRecord = Record<string, unknown>;

export type BrowserUriLike = {
  spec?: string;
  href?: string;
  toString?: () => string;
};

export type BrowserLinkedBrowserLike = {
  currentURI?: BrowserUriLike;
  contentTitle?: string;
  loadURI?: (url: string, options?: unknown) => void;
  contentDocument?: {
    body?: {
      innerText?: string;
    };
  };
  browsingContext?: {
    currentWindowContext?: {
      getActor: (actorName: string) => {
        getReaderModeContent?: () => Promise<string>;
        getText?: () => Promise<string | { text?: string }>;
      } | null;
    } | null;
  };
};

export type BrowserTabGroupLike = {
  id?: string | number;
  label?: string;
  collapsed?: boolean;
  tabs?: BrowserTabLike[];
  addTabs?: (tabs: BrowserTabLike[]) => void;
};

export type BrowserTabLike = {
  label?: string;
  pinned?: boolean;
  group?: BrowserTabGroupLike | null;
  splitview?: {
    unsplitTabs?: () => void;
  } | null;
  linkedBrowser?: BrowserLinkedBrowserLike;
  ownerGlobal?: { gBrowser?: GBrowserLike };
  [key: string]: unknown;
};

export type GBrowserLike = {
  tabs: ArrayLike<BrowserTabLike> | BrowserTabLike[];
  selectedTab?: BrowserTabLike;
  tabGroups?: ArrayLike<BrowserTabGroupLike> | BrowserTabGroupLike[];
  getAllTabGroups?: () =>
    | ArrayLike<BrowserTabGroupLike>
    | BrowserTabGroupLike[];
  adoptTab?: (tab: BrowserTabLike, index: number) => void;
  removeTab?: (tab: BrowserTabLike) => void;
  addTrustedTab?: (
    url: string,
    options?: { triggeringPrincipal?: unknown; relatedToCurrent?: boolean }
  ) => BrowserTabLike;
  addTabSplitView?: (
    tabs: BrowserTabLike[],
    options?: { insertBefore?: BrowserTabLike }
  ) => void;
  addTabGroup?: (
    tabs: BrowserTabLike[],
    options?: { label?: string }
  ) => BrowserTabGroupLike;
  ungroupTab?: (tab: BrowserTabLike) => void;
  [key: string]: unknown;
};

type WindowMediatorLike = {
  getMostRecentWindow: (windowType: string) => BrowserWindowLike | null;
  getEnumerator?: (windowType: string) => {
    hasMoreElements: () => boolean;
    getNext: () => BrowserWindowLike;
  };
};

type ObserverLike = {
  observe: (subject: unknown, topic: string, data: string | null) => void;
};

export type ServicesLike = {
  wm?: WindowMediatorLike;
  obs?: {
    addObserver: (
      observer: ObserverLike,
      topic: string,
      ownsWeak?: boolean
    ) => void;
  };
  prefs?: {
    getBoolPref?: (name: string, defaultValue?: boolean) => boolean;
  };
  uriFixup?: {
    getFixupURIInfo?: (
      input: string,
      flags: number
    ) => {
      preferredURI?: BrowserUriLike;
    };
  };
  scriptSecurityManager?: {
    getSystemPrincipal?: () => unknown;
  };
};

export type PlacesBookmarkEntry = {
  guid: string;
  parentGuid?: string;
  title?: string;
  uri?: string;
  url?: string | BrowserUriLike;
  dateAdded?: number;
  type?: number;
};

export type PlacesBookmarksLike = {
  TYPE_FOLDER: number;
  TYPE_BOOKMARK: number;
  menuGuid: string;
  toolbarGuid: string;
  unfiledGuid: string;
  search?: (query: { title?: string }) => Promise<PlacesBookmarkEntry[]>;
  fetch: (
    query: string | { guid?: string; parentGuid?: string },
    onResult?: (bookmark: PlacesBookmarkEntry) => void
  ) => Promise<PlacesBookmarkEntry[] | PlacesBookmarkEntry | null | undefined>;
  insert?: (details: {
    parentGuid: string;
    title?: string;
    type?: number;
    url?: string;
  }) => Promise<PlacesBookmarkEntry>;
  remove?: (guid: string) => Promise<void>;
  update?: (changes: {
    guid: string;
    title?: string;
  }) => Promise<PlacesBookmarkEntry>;
};

export type PlacesHistoryResultRoot = {
  containerOpen: boolean;
  childCount: number;
  getChild: (index: number) => {
    uri?: string;
    title?: string;
    time?: number;
  };
};

export type PlacesHistoryOptions = {
  SORT_BY_DATE_DESCENDING?: number;
  sortingMode?: number;
  maxResults?: number;
  includeVisits?: boolean;
};

export type PlacesHistoryLike = {
  getNewQueryOptions: () => PlacesHistoryOptions;
  getNewQuery: () => unknown;
  executeQuery: (
    query: unknown,
    options: unknown
  ) => { root: PlacesHistoryResultRoot };
};

export type PlacesUtilsLike = {
  bookmarks?: PlacesBookmarksLike;
  history?: PlacesHistoryLike;
  observers?: {
    addListener?: (
      topics: string[],
      listener: (events: unknown[]) => void
    ) => void;
  };
};

export type BrowserWindowLike = Window & {
  gBrowser?: GBrowserLike;
  PlacesUtils?: PlacesUtilsLike;
  Services?: ServicesLike;
  OpenBrowserWindow?: () => BrowserWindowLike;
  openTrustedLinkIn?: (url: string, where: string) => void;
  SidebarController?: {
    hide?: () => void;
  };
  [key: string]: unknown;
};

export type AssistantSessionLike = {
  readonly messages: unknown[];
  addTurn: (user: BaseMessage, assistant: BaseMessage) => void;
  clear: () => void;
  setSession: (messages: unknown[]) => void;
};

export type { OasisRecordToolActionStart, OasisRecordToolActionUpdate };

export type AssistantWindowLike = Window & {
  supabaseAuth?: ReturnType<typeof SupabaseAuth.getInstance>;
  voiceInputService?: typeof voiceInputService;
  marked?: unknown;
  DOMPurify?: unknown;
  resetAssistantSession?: () => void;
  getAssistantHistory?: () => BaseMessage[];
  runAssistantStream?: RunAssistantStream;
  oasisSetOAuthCallbackBaseUrl?: (url: string) => string;
  oasisGetOAuthCallbackBaseUrl?: () => string;
  oasisRecordToolActionStart?: OasisRecordToolActionStart;
  oasisRecordToolActionUpdate?: OasisRecordToolActionUpdate;
  oasisSetPendingConfirmationRelay?: (
    confirmation: PendingConfirmationPayload | null
  ) => void;
  oasisGetPendingConfirmation?: () => PendingConfirmationPayload | null;
  oasisClearPendingConfirmation?: () => void;
  oasisGetPendingAmbiguity?: () => PendingAmbiguityPayload | null;
  Services?: ServicesLike;
  ChromeUtils?: {
    importESModule?: (path: string) => Record<string, unknown>;
    import?: (path: string) => Record<string, unknown>;
  };
  PlacesUtils?: PlacesUtilsLike;
};

export function getBrowserWindow(
  globalRef: typeof globalThis = globalThis
): BrowserWindowLike | null {
  const maybeWindow = (globalRef as { window?: AssistantWindowLike }).window;
  const win = maybeWindow || (globalRef as unknown as AssistantWindowLike);
  const services =
    win.Services || (win.top as AssistantWindowLike | undefined)?.Services;
  if (services?.wm) {
    return services.wm.getMostRecentWindow("navigator:browser");
  }
  return (win.top as BrowserWindowLike | null) || (win as BrowserWindowLike);
}
