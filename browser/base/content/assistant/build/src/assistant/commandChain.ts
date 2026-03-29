/**
 * Command chain parser — splits multi-command inputs.
 *
 * Detects and splits chained user inputs like "do X; then Y" or
 * "open tabs and then list bookmarks" into separate command strings.
 * Uses connector patterns: ";", "and then", "then", "and <verb>".
 * Max 3 commands per chain.
 *
 * Called by supervisorQueue.ts to populate the command queue.
 */
const CHAIN_VERBS = [
  "open",
  "close",
  "delete",
  "remove",
  "create",
  "make",
  "new",
  "add",
  "save",
  "move",
  "put",
  "rename",
  "list",
  "show",
  "search",
  "find",
  "summarize",
  "split",
  "organize",
  "copy",
] as const;

const CHAIN_VERB_PATTERN = CHAIN_VERBS.join("|");
const CHAIN_CONNECTOR_RE = new RegExp(
  `(?:\\s*;\\s*|\\s+(?:and\\s+then|then)\\s+(?=(?:please\\s+)?(?:${CHAIN_VERB_PATTERN})\\b)|\\s+and\\s+(?=(?:please\\s+)?(?:${CHAIN_VERB_PATTERN})\\b))`,
  "i"
);
const CHAIN_SPLIT_RE = new RegExp(
  `\\s*;\\s*|\\s+(?:and\\s+then|then)\\s+(?=(?:please\\s+)?(?:${CHAIN_VERB_PATTERN})\\b)|\\s+and\\s+(?=(?:please\\s+)?(?:${CHAIN_VERB_PATTERN})\\b)`,
  "gi"
);

export type CommandChainResult = {
  commands: string[];
  truncated: boolean;
};

export function looksLikeCommandChain(input: string): boolean {
  return CHAIN_CONNECTOR_RE.test(String(input || "").trim());
}

export function splitCommandChain(
  input: string,
  maxCommands = 3
): CommandChainResult {
  const text = String(input || "").trim();
  if (!text || maxCommands < 1) {
    return { commands: [], truncated: false };
  }

  const parts = text
    .split(CHAIN_SPLIT_RE)
    .map(part => part.trim())
    .filter(Boolean);

  if (parts.length <= maxCommands) {
    return { commands: parts, truncated: false };
  }

  return {
    commands: parts.slice(0, maxCommands),
    truncated: true,
  };
}
