import { isRecord } from "../assistant/messageUtils.js";
import type {
  ResearchBrief,
  ResearchBriefQuote,
  ResearchBriefSource,
  TabDigest,
} from "./researchBriefTypes.js";

export const DEFAULT_MAX_TABS = 10;
export const HARD_MAX_TABS = 15;
const MAX_QUOTE_CHARS = 500;

export function clampMaxTabs(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) {
    return DEFAULT_MAX_TABS;
  }
  return Math.min(HARD_MAX_TABS, Math.max(1, Math.floor(value)));
}

export function estimateSynthesisTokens(digests: TabDigest[]): number {
  const chars = digests.reduce(
    (sum, d) => sum + String(d.content || "").length,
    0
  );
  return Math.ceil(chars / 4) + 4000;
}

export function truncateDigestsToBudget(
  digests: TabDigest[],
  maxTotalChars: number
): { digests: TabDigest[]; truncated: boolean } {
  const total = digests.reduce(
    (sum, d) => sum + String(d.content || "").length,
    0
  );
  if (total <= maxTotalChars) {
    return { digests, truncated: false };
  }

  const ratio = maxTotalChars / total;
  const truncatedDigests = digests.map(d => {
    if (!d.content || d.status !== "ok") {
      return d;
    }
    const newLen = Math.max(200, Math.floor(d.content.length * ratio));
    if (newLen >= d.content.length) {
      return d;
    }
    return {
      ...d,
      content: d.content.substring(0, newLen) + "...",
    };
  });
  return { digests: truncatedDigests, truncated: true };
}

function truncateQuote(text: string): string {
  const t = String(text || "").trim();
  if (t.length <= MAX_QUOTE_CHARS) {
    return t;
  }
  return t.substring(0, MAX_QUOTE_CHARS - 3) + "...";
}

export function researchBriefToMarkdown(brief: ResearchBrief): string {
  const okCount = brief.sources.filter(s => s.status === "ok").length;
  const failedCount = brief.sources.filter(
    s => s.status === "failed" || s.status === "skipped"
  ).length;
  const metaParts = [`**Generated:** ${brief.generatedAt}`];
  if (brief.topicInferred) {
    metaParts.push(`**Topic:** ${brief.topic} (inferred from page content)`);
  }
  if (brief.sources.length > 0) {
    metaParts.push(
      `**Sources:** ${brief.sources.length} (${okCount} ok${failedCount > 0 ? `, ${failedCount} unavailable` : ""})`
    );
  }
  if (brief.synthesisCharCount != null && brief.synthesisCharCount > 0) {
    const k = Math.round(brief.synthesisCharCount / 1000);
    metaParts.push(`**~${k}k chars sent for synthesis**`);
  }

  const lines: string[] = [
    `# Research brief: ${brief.topic}`,
    "",
    metaParts.join(" · "),
    "",
  ];

  if (brief.executiveSummary?.trim()) {
    lines.push("## Executive summary", "", brief.executiveSummary.trim(), "");
  }

  if (brief.outline?.length) {
    lines.push("## Suggested outline", "");
    for (const section of brief.outline) {
      lines.push(`### ${section.heading}`);
      for (const bullet of section.bullets || []) {
        lines.push(`- ${bullet}`);
      }
      lines.push("");
    }
  }

  if (brief.themes?.length) {
    lines.push("## Themes", "");
    for (const theme of brief.themes) {
      lines.push(`### ${theme.label}`, "", theme.synthesis.trim(), "");
      if (theme.sourceUrls?.length) {
        lines.push(
          `Sources: ${theme.sourceUrls.map(u => `<${u}>`).join(", ")}`,
          ""
        );
      }
    }
  }

  if (brief.sources?.length) {
    lines.push("## Sources", "");
    for (const source of brief.sources) {
      const title = source.title?.trim() || source.url || "Untitled";
      lines.push(`### [${title}](${source.url})`);
      if (source.status !== "ok" && source.failureReason) {
        lines.push("", `*${source.failureReason}*`, "");
      }
      for (const quote of source.quotes || []) {
        const q = truncateQuote(quote.text);
        if (q) {
          lines.push("> " + q.split("\n").join("\n> "));
          if (quote.context?.trim()) {
            lines.push(`> — ${quote.context.trim()}`);
          }
          lines.push("");
        }
      }
      if (source.keyClaims?.length) {
        lines.push("**Key claims:**");
        for (const claim of source.keyClaims) {
          lines.push(`- ${claim}`);
        }
        lines.push("");
      }
    }
  }

  if (brief.gapsAndContradictions?.length) {
    lines.push("## Gaps and contradictions", "");
    for (const item of brief.gapsAndContradictions) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

function normalizeQuote(raw: unknown): ResearchBriefQuote | null {
  if (!isRecord(raw) || typeof raw.text !== "string") {
    return null;
  }
  const text = truncateQuote(raw.text);
  if (!text) {
    return null;
  }
  return {
    text,
    context: typeof raw.context === "string" ? raw.context : undefined,
  };
}

function normalizeSource(raw: unknown): ResearchBriefSource | null {
  if (!isRecord(raw)) {
    return null;
  }
  const status = raw.status;
  if (status !== "ok" && status !== "skipped" && status !== "failed") {
    return null;
  }
  const quotes = Array.isArray(raw.quotes)
    ? raw.quotes
        .map(normalizeQuote)
        .filter((q): q is ResearchBriefQuote => q != null)
        .slice(0, 5)
    : [];
  const keyClaims = Array.isArray(raw.keyClaims)
    ? raw.keyClaims
        .filter((c): c is string => typeof c === "string")
        .slice(0, 8)
    : [];
  return {
    title: typeof raw.title === "string" ? raw.title : "",
    url: typeof raw.url === "string" ? raw.url : "",
    status,
    failureReason:
      typeof raw.failureReason === "string" ? raw.failureReason : undefined,
    keyClaims,
    quotes,
  };
}

function tryJsonParseLoose(str: string): unknown {
  const trimmed = String(str || "").trim();
  if (!trimmed) {
    return null;
  }
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : trimmed;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

export function parseResearchBriefFromAssistContent(
  content: unknown
): ResearchBrief | null {
  let parsed: unknown = content;
  if (typeof content === "string") {
    parsed = tryJsonParseLoose(content);
  }
  if (!isRecord(parsed)) {
    return null;
  }

  if (typeof parsed.topic !== "string") {
    return null;
  }

  const sources = Array.isArray(parsed.sources)
    ? parsed.sources
        .map(normalizeSource)
        .filter((s): s is ResearchBriefSource => s != null)
    : [];

  const outline = Array.isArray(parsed.outline)
    ? parsed.outline
        .filter(isRecord)
        .map(section => ({
          heading: typeof section.heading === "string" ? section.heading : "",
          bullets: Array.isArray(section.bullets)
            ? section.bullets.filter((b): b is string => typeof b === "string")
            : [],
        }))
        .slice(0, 15)
    : [];

  const themes = Array.isArray(parsed.themes)
    ? parsed.themes
        .filter(isRecord)
        .map(theme => ({
          label: typeof theme.label === "string" ? theme.label : "",
          synthesis: typeof theme.synthesis === "string" ? theme.synthesis : "",
          sourceUrls: Array.isArray(theme.sourceUrls)
            ? theme.sourceUrls.filter((u): u is string => typeof u === "string")
            : [],
        }))
        .slice(0, 10)
    : [];

  const gaps = Array.isArray(parsed.gapsAndContradictions)
    ? parsed.gapsAndContradictions.filter(
        (g): g is string => typeof g === "string"
      )
    : [];

  return {
    topic: parsed.topic,
    generatedAt:
      typeof parsed.generatedAt === "string"
        ? parsed.generatedAt
        : new Date().toISOString(),
    scopeLabel: typeof parsed.scopeLabel === "string" ? parsed.scopeLabel : "",
    executiveSummary:
      typeof parsed.executiveSummary === "string"
        ? parsed.executiveSummary
        : "",
    outline,
    themes,
    sources,
    gapsAndContradictions: gaps,
  };
}
