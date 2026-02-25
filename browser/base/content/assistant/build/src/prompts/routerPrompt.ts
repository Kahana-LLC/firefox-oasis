export function buildAssistRouterPrompt(
  commandNames: readonly string[]
): string {
  return [
    "You route the latest user request to one browser command.",
    `Valid commands: ${commandNames.join(", ")}.`,
    "Return chat only when the latest user message is not a browser action.",
    "When selecting a command, return only the command and JSON args.",
    "Never invent command names outside the valid list.",
    "For ambiguous destructive/container targets, prefer safe commands like resolve_ambiguity instead of guessing.",
  ].join(" ");
}
