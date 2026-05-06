export const CAPABILITIES_CHIP_LABEL = "What can Oasis do?";

export const HOW_OASIS_WORKS_CHIP_LABEL = "How does Oasis work?";

export type ComposerInlineSuggestion =
  | { label: string; message: string }
  | { label: string; action: "commandReferenceMarkdown" };

export const COMPOSER_INLINE_SUGGESTIONS: readonly ComposerInlineSuggestion[] = [
  { label: CAPABILITIES_CHIP_LABEL, message: CAPABILITIES_CHIP_LABEL },
  { label: HOW_OASIS_WORKS_CHIP_LABEL, action: "commandReferenceMarkdown" },
];

export const EXAMPLE_COMMANDS_ROTATION: readonly string[] = [
  CAPABILITIES_CHIP_LABEL,
  HOW_OASIS_WORKS_CHIP_LABEL,
  "Ask in plain English",
];
