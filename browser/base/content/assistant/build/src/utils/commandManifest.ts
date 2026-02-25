import type { ManifestCommandDefinition } from "./manifestTypes.js";

export const COMMAND_MANIFEST: readonly ManifestCommandDefinition[] = [
  {
    id: "list.window.tabs",
    family: "list",
    commandName: "list_tabs",
    phrases: ["list tabs", "show tabs", "list my tabs"],
    condition: context => context.hasOpenTabs,
  },
  {
    id: "list.container.tabs",
    family: "list",
    commandName: "list_tabs",
    phrases: ["list tabs in", "show tabs in", "list my", "show my", "list the", "show the"],
    slots: [
      { name: "name", type: "target_name", source: "rest", optional: true },
      { name: "scope", type: "scope", source: "rest", optional: true },
    ],
  },
  {
    id: "search.memory",
    family: "search",
    commandName: "search_memory",
    phrases: [
      "search",
      "find",
      "look up",
      "have i visited",
      "have i",
      "what is in",
      "do i have",
    ],
    slots: [
      { name: "query", type: "string", source: "quoted_or_rest" },
      { name: "folder", type: "target_name", source: "rest", optional: true },
    ],
  },
  {
    id: "mutation.container.add",
    family: "mutation",
    commandName: "add_tab_to_bookmark_folder",
    phrases: ["add", "save", "move", "put"],
    slots: [
      { name: "name", type: "target_name", source: "rest", optional: true },
      { name: "query", type: "string", source: "quoted_or_rest", optional: true },
    ],
  },
  {
    id: "mutation.target.delete",
    family: "mutation",
    commandName: "resolve_ambiguity",
    phrases: ["close", "delete", "remove"],
    slots: [{ name: "target", type: "target_name", source: "rest", optional: true }],
  },
] as const;

export function validateCommandManifest(
  manifest: readonly ManifestCommandDefinition[] = COMMAND_MANIFEST
): { ok: boolean; duplicateIds: string[] } {
  const seen = new Set<string>();
  const duplicateIds = new Set<string>();
  for (const item of manifest) {
    if (seen.has(item.id)) {
      duplicateIds.add(item.id);
      continue;
    }
    seen.add(item.id);
  }
  return { ok: duplicateIds.size === 0, duplicateIds: Array.from(duplicateIds) };
}
