import type {
  ResearchBrief,
  ResearchBriefOutlineSection,
  ResearchBriefSource,
  ResearchBriefTheme,
} from "./researchBriefTypes.js";

export type ResearchBriefSectionId =
  | "executiveSummary"
  | "outline"
  | "themes"
  | "sources"
  | "gapsAndContradictions";

export function mergeSectionIntoBrief(
  existing: ResearchBrief,
  section: ResearchBriefSectionId,
  payload: unknown
): ResearchBrief {
  if (section === "executiveSummary") {
    const text =
      typeof payload === "string"
        ? payload
        : typeof (payload as { executiveSummary?: string }).executiveSummary ===
            "string"
          ? (payload as { executiveSummary: string }).executiveSummary
          : existing.executiveSummary;
    return { ...existing, executiveSummary: text };
  }

  if (section === "outline") {
    const outline = Array.isArray(payload)
      ? (payload as ResearchBriefOutlineSection[])
      : Array.isArray((payload as { outline?: unknown }).outline)
        ? ((payload as { outline: ResearchBriefOutlineSection[] }).outline ??
          [])
        : existing.outline;
    return { ...existing, outline };
  }

  if (section === "themes") {
    const themes = Array.isArray(payload)
      ? (payload as ResearchBriefTheme[])
      : Array.isArray((payload as { themes?: unknown }).themes)
        ? ((payload as { themes: ResearchBriefTheme[] }).themes ?? [])
        : existing.themes;
    return { ...existing, themes };
  }

  if (section === "sources") {
    const sources = Array.isArray(payload)
      ? (payload as ResearchBriefSource[])
      : Array.isArray((payload as { sources?: unknown }).sources)
        ? ((payload as { sources: ResearchBriefSource[] }).sources ?? [])
        : existing.sources;
    return { ...existing, sources };
  }

  const gaps = Array.isArray(payload)
    ? (payload as string[])
    : Array.isArray(
          (payload as { gapsAndContradictions?: unknown }).gapsAndContradictions
        )
      ? ((payload as { gapsAndContradictions: string[] })
          .gapsAndContradictions ?? [])
      : existing.gapsAndContradictions;
  return { ...existing, gapsAndContradictions: gaps };
}
