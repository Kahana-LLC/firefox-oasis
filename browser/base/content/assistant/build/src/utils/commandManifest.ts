/**
 * Command manifest — static phrase-to-command mapping.
 *
 * Maps known natural language phrases to command names and families.
 * E.g., "list bookmark folders" -> list_bookmark_folders (family: list).
 * Each entry defines: id, family, commandName, phrases[], and optional
 * slots[] and conditions.
 *
 * Used by manifestResolver.ts for fast phrase-based matching.
 */
import type { ManifestCommandDefinition } from "./manifestTypes.js";

export const COMMAND_MANIFEST: readonly ManifestCommandDefinition[] = [
  {
    id: "list.bookmark.folders",
    family: "list",
    commandName: "list_bookmark_folders",
    phrases: [
      "list bookmark folders",
      "list my bookmark folders",
      "list my bookmarks",
      "list bookmarks",
      "show bookmark folders",
      "show my bookmark folders",
      "show bookmarks",
      "show my bookmarks",
      "list folders",
      "show folders",
      "list hubs",
      "show hubs",
    ],
  },
  {
    id: "list.tab.groups",
    family: "list",
    commandName: "list_tab_groups",
    phrases: [
      "list tab groups",
      "show tab groups",
      "list groups",
      "show groups",
      "list my tab groups",
      "show my tab groups",
    ],
  },
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
    phrases: [
      "list tabs in",
      "show tabs in",
      "list my",
      "show my",
      "list the",
      "show the",
    ],
    slots: [
      { name: "name", type: "target_name", source: "rest", optional: true },
      { name: "scope", type: "scope", source: "rest", optional: true },
    ],
  },
  {
    id: "search.history",
    family: "search",
    commandName: "search_history",
    priority: 1,
    phrases: [
      "what pages did i visit",
      "what did i read",
      "what did i browse",
      "find that article",
      "find that page",
      "find that site",
      "what sites did i visit",
      "pages i visited",
      "articles i read",
      "browsing history",
      "search history",
      "search my history",
      "find in my history",
      "what was that page",
      "what was that site",
      "what was that article",
      "did i visit",
      "did i look at",
      "did i read",
      "did i browse",
    ],
    slots: [{ name: "query", type: "string", source: "quoted_or_rest" }],
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
      {
        name: "query",
        type: "string",
        source: "quoted_or_rest",
        optional: true,
      },
    ],
  },
  {
    id: "mutation.target.delete",
    family: "mutation",
    commandName: "resolve_ambiguity",
    phrases: ["close", "delete", "remove"],
    slots: [
      { name: "target", type: "target_name", source: "rest", optional: true },
    ],
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
  return {
    ok: duplicateIds.size === 0,
    duplicateIds: Array.from(duplicateIds),
  };
}
