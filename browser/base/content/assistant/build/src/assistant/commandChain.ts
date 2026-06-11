/**
 * Command chain parser — splits multi-command inputs.
 *
 * Detects and splits chained user inputs like "do X; then Y" or
 * "open tabs and then list bookmarks" into separate command strings.
 * Connector patterns: ";", "and then", "then", "after that", "also",
 * "plus", "and <verb>", and ", <verb>". Max 3 commands per chain.
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
const CHAIN_VERB_LOOKAHEAD = `(?=(?:please\\s+)?(?:${CHAIN_VERB_PATTERN})\\b)`;
const CHAIN_CONNECTOR_BODY =
  `\\s*;\\s*` +
  `|\\s+(?:and\\s+then|then|after\\s+that,?|also|plus)\\s+${CHAIN_VERB_LOOKAHEAD}` +
  `|\\s+and\\s+${CHAIN_VERB_LOOKAHEAD}` +
  `|\\s*,\\s*(?:and\\s+)?${CHAIN_VERB_LOOKAHEAD}`;
const CHAIN_CONNECTOR_RE = new RegExp(`(?:${CHAIN_CONNECTOR_BODY})`, "i");
const CHAIN_SPLIT_RE = new RegExp(CHAIN_CONNECTOR_BODY, "gi");

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
