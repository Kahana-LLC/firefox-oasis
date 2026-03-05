export type ContainerType = "bookmark-folder" | "tab-group";
export type RouteArgs = Record<string, unknown>;
export type RoutingEntityType = "folder" | "group";
export type IntentFamily = "list" | "search" | "mutation" | "other";

export type ParsedIntent = {
  rawText: string;
  normalizedText: string;
  verb: string | null;
  isActionLike: boolean;
  explicitContainer: ContainerType | null;
  targetName?: string;
  query?: string;
  url?: string;
  index?: number;
  indices?: number[];
  all?: boolean;
  current?: boolean;
  kind:
    | "container_add"
    | "close_delete_target"
    | "search"
    | "explicit"
    | "unknown";
};

export type RoutingStateSnapshot = {
  folderNames: Set<string>;
  groupNames: Set<string>;
  stale: boolean;
};

export type RoutingStateMutation =
  | {
      kind: "upsert";
      entity: RoutingEntityType;
      name: string;
    }
  | {
      kind: "delete";
      entity: RoutingEntityType;
      name: string;
    }
  | {
      kind: "rename";
      entity: RoutingEntityType;
      from: string;
      to: string;
    }
  | {
      kind: "dirty";
      reason: string;
    };

export type ResolutionResult = {
  targetInFolders: boolean;
  targetInGroups: boolean;
  tabMatches: number[];
};

export type PendingAmbiguityPayload = {
  kind?: "container_target" | "close_delete_target";
  name: string;
  query?: string;
  all?: boolean;
  choices?: Array<"tab" | "tab-group" | "bookmark-folder">;
  tabIndex?: number;
  verb?: string;
  originalText: string;
};

export type DeterministicRouteDecision =
  | {
      type: "tool";
      next: string;
      args: RouteArgs;
      reason: string;
      pendingAmbiguity?: PendingAmbiguityPayload;
    }
  | {
      type: "chat";
      message: string;
      reason: string;
      actionable: boolean;
    }
  | {
      type: "no_match";
      actionable: boolean;
      reason: string;
    };
