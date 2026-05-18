import { isAssistantThemeId, type AssistantThemeId } from "./themes";

export function normalizeAssistantThemeId(
  id: string | null | undefined
): AssistantThemeId {
  if (!id || id === "default" || !isAssistantThemeId(id)) {
    return "default";
  }
  return id;
}

export function applyAssistantThemeToDocument(themeId: string): void {
  const normalized = normalizeAssistantThemeId(themeId);
  const el = document.documentElement;
  if (normalized === "default") {
    el.removeAttribute("data-oasis-theme");
  } else {
    el.setAttribute("data-oasis-theme", normalized);
  }
}
