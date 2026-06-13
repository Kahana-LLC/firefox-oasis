import type { CompetitiveIntelReport } from "../services/competitiveIntelTypes.js";
import type { CiReportMode } from "../services/competitiveIntelTypes.js";
import { loadCompetitiveIntelReportCache } from "../services/competitiveIntelReportCache.js";

export const COMPETITIVE_INTEL_MARKER = "__COMPETITIVE_INTEL__";

export type CompetitiveIntelToolPayload = {
  markdown: string;
  report: CompetitiveIntelReport;
  reportId?: string;
  reportMode?: CiReportMode;
  budgetNote?: string;
};

export function buildCompetitiveIntelToolMessage(
  payload: CompetitiveIntelToolPayload
): string {
  return `${COMPETITIVE_INTEL_MARKER}\n${JSON.stringify(payload)}`;
}

export function buildSlimCompetitiveIntelToolMessage(reportId: string): string {
  return `${COMPETITIVE_INTEL_MARKER}\n${JSON.stringify({ reportId })}`;
}

export function hasCompetitiveIntelMarker(text: string): boolean {
  return String(text || "").includes(COMPETITIVE_INTEL_MARKER);
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through to brace matching
  }

  const start = trimmed.indexOf("{");
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < trimmed.length; index += 1) {
    const ch = trimmed[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (ch === "{") {
      depth += 1;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(trimmed.slice(start, index + 1)) as Record<
            string,
            unknown
          >;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function suffixAfterCiJsonPayload(text: string): string {
  const markerIndex = text.indexOf(COMPETITIVE_INTEL_MARKER);
  if (markerIndex < 0) {
    return "";
  }
  const afterMarker = text.slice(markerIndex + COMPETITIVE_INTEL_MARKER.length);
  const start = afterMarker.indexOf("{");
  if (start < 0) {
    return "";
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < afterMarker.length; index += 1) {
    const ch = afterMarker[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (ch === "{") {
      depth += 1;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return afterMarker.slice(index + 1).trim();
      }
    }
  }
  return "";
}

export function parseCompetitiveIntelToolMessage(
  text: string
): CompetitiveIntelToolPayload | null {
  const input = String(text || "");
  const markerIndex = input.indexOf(COMPETITIVE_INTEL_MARKER);
  if (markerIndex < 0) {
    return null;
  }

  const raw = extractJsonObject(
    input.slice(markerIndex + COMPETITIVE_INTEL_MARKER.length)
  );
  if (raw && typeof raw.reportId === "string" && !raw.report) {
    const cached = loadCompetitiveIntelReportCache(raw.reportId);
    if (cached) {
      return cached;
    }
  }
  if (
    raw &&
    typeof raw.markdown === "string" &&
    raw.report &&
    typeof raw.report === "object"
  ) {
    return {
      markdown: raw.markdown,
      report: raw.report as CompetitiveIntelReport,
      reportId: typeof raw.reportId === "string" ? raw.reportId : undefined,
      reportMode:
        raw.reportMode === "full" || raw.reportMode === "compact"
          ? raw.reportMode
          : undefined,
      budgetNote:
        typeof raw.budgetNote === "string" ? raw.budgetNote : undefined,
    };
  }
  return null;
}

export function displayMarkdownFromCompetitiveIntelToolMessage(
  text: string
): string {
  const input = String(text || "");
  const markerIndex = input.indexOf(COMPETITIVE_INTEL_MARKER);
  const preamble = markerIndex >= 0 ? input.slice(0, markerIndex).trim() : "";
  const parsed = parseCompetitiveIntelToolMessage(input);
  const suffix = suffixAfterCiJsonPayload(input);

  if (parsed?.markdown) {
    return [preamble, parsed.markdown, suffix].filter(Boolean).join("\n\n");
  }
  if (markerIndex >= 0) {
    return preamble;
  }
  return input.trim();
}
