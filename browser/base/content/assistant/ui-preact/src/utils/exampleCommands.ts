export const CAPABILITIES_CHIP_LABEL = "What can Oasis do?";

export type ComposerInlineSuggestion =
  | { label: string; message: string }
  | { label: string; action: "capabilities" };

export const COMPOSER_INLINE_SUGGESTIONS: readonly ComposerInlineSuggestion[] = [
  { label: CAPABILITIES_CHIP_LABEL, action: "capabilities" },
];

export const EXAMPLE_COMMANDS_ROTATION: readonly string[] = [
  CAPABILITIES_CHIP_LABEL,
  "Ask in plain English",
];
