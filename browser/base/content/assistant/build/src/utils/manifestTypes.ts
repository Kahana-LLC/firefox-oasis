/** Type definitions for the command manifest: slot definitions, condition contexts, command definitions, and resolution results. */
import type {
  IntentFamily,
  RouteArgs,
  RoutingStateSnapshot,
} from "./routerTypes.js";

export type ManifestSlotSource = "rest" | "quoted_or_rest" | "number" | "url";

export type ManifestSlotType =
  | "string"
  | "target_name"
  | "tab_index"
  | "url"
  | "scope";

export type ManifestSlotDefinition = {
  name: string;
  type: ManifestSlotType;
  optional?: boolean;
  defaultValue?: string | number | boolean;
  source?: ManifestSlotSource;
  aliases?: readonly string[];
};

export type ManifestConditionContext = {
  snapshot: RoutingStateSnapshot;
  hasOpenTabs: boolean;
  hasPendingConfirmation: boolean;
};

export type ManifestCommandDefinition = {
  id: string;
  family: IntentFamily;
  commandName: string;
  phrases: readonly string[];
  slots?: readonly ManifestSlotDefinition[];
  priority?: number;
  condition?: (context: ManifestConditionContext) => boolean;
};

export type ManifestResolution = {
  definition: ManifestCommandDefinition;
  args: RouteArgs;
  score: number;
};
