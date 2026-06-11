import { isRecord } from "../assistant/messageUtils.js";
import { formatUntrustedSourceStatusLabel } from "./untrustedContent.js";
import type {
  OutreachEmailDraft,
  OutreachEmailPurpose,
  OutreachEmailSource,
} from "../services/outreachEmailTypes.js";
import type { TabDigest } from "../services/researchBriefTypes.js";

const URL_PATTERN =
  /\bhttps?:\/\/[^\s<>()]+|\bwww\.[a-z0-9][-a-z0-9.]*[a-z0-9](?:\/[^\s]*)?/gi;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\([^)]*\)/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripLinksFromOutreachText(text: string): string {
  return String(text || "")
    .replace(MARKDOWN_LINK_PATTERN, "$1")
    .replace(URL_PATTERN, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function replaceEmDashesInOutreachText(text: string): string {
  return String(text || "")
    .replace(/\s*[\u2014\u2013]\s*/g, ", ")
    .replace(/,\s*,/g, ", ")
    .replace(/,\s+([.!?])/g, "$1");
}

export function fixOutreachPunctuationSpacing(text: string): string {
  return String(text || "")
    .replace(/,([A-Za-z0-9])/g, ", $1")
    .replace(/\.([A-Za-z0-9])/g, ". $1")
    .replace(/!([A-Za-z0-9])/g, "! $1")
    .replace(/\?([A-Za-z0-9])/g, "? $1")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/([.!?])([A-Za-z])/g, "$1 $2");
}

function splitSentences(paragraph: string): string[] {
  const trimmed = paragraph.trim();
  if (!trimmed) {
    return [];
  }
  const parts = trimmed.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  return (parts || [trimmed]).map(part => part.trim()).filter(Boolean);
}

function groupSentencesIntoParagraphs(sentences: string[]): string[] {
  const paragraphs: string[] = [];
  let buffer: string[] = [];

  for (const sentence of sentences) {
    buffer.push(sentence);
    const wordCount = buffer.join(" ").split(/\s+/).length;
    if (buffer.length >= 2 && wordCount >= 28) {
      paragraphs.push(buffer.join(" "));
      buffer = [];
    }
  }
  if (buffer.length > 0) {
    paragraphs.push(buffer.join(" "));
  }
  return paragraphs;
}

function extractSignOff(text: string): {
  main: string;
  signOff: string | null;
} {
  const match = text.match(
    /\n\s*((?:Best|Thanks|Thank you|Regards|Cheers|Sincerely),?)\s*$/i
  );
  if (!match?.[1]) {
    return { main: text.trim(), signOff: null };
  }
  return {
    main: text.slice(0, match.index).trim(),
    signOff: match[1].replace(/,?\s*$/, ","),
  };
}

function isGreetingBlock(block: string): boolean {
  return /^(?:Hi|Hello|Hey)\s+.+,?$/i.test(block.trim());
}

function isSignOffBlock(block: string): boolean {
  return /^(?:Best|Thanks|Thank you|Regards|Cheers|Sincerely),?$/i.test(
    block.trim()
  );
}

function paragraphizeProse(block: string): string[] {
  const sentences = splitSentences(block);
  if (sentences.length <= 2) {
    return [block.trim()];
  }
  return groupSentencesIntoParagraphs(sentences);
}

export function normalizeOutreachEmailBody(
  body: string,
  recipientName?: string
): string {
  let text = String(body || "").trim();
  text = stripLinksFromOutreachText(text);
  text = replaceEmDashesInOutreachText(text);
  text = fixOutreachPunctuationSpacing(text);

  const firstName = String(recipientName || "")
    .trim()
    .split(/\s+/)[0];
  if (firstName) {
    const greetingPattern = new RegExp(
      `^((?:Hi|Hello|Hey)\\s+${escapeRegExp(firstName)}\\s*,)\\s*`,
      "i"
    );
    text = text.replace(greetingPattern, "$1\n\n");
  } else {
    text = text.replace(
      /^(Hi|Hello|Hey)\s+([^,\n]+),\s*(?=[A-Z])/im,
      "$1 $2,\n\n"
    );
  }

  const { main, signOff } = extractSignOff(text);
  const blocks = main
    .split(/\n\n+/)
    .map(block => block.trim())
    .filter(Boolean);

  const formatted: string[] = [];
  for (const block of blocks) {
    if (isGreetingBlock(block)) {
      formatted.push(block.replace(/,\s*$/, ","));
      continue;
    }
    formatted.push(...paragraphizeProse(block));
  }

  let core = formatted.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  if (signOff) {
    core = `${core}\n\n${signOff}`.trim();
  }
  return core;
}

export function normalizeOutreachEmailSubject(subject: string): string {
  let text = stripLinksFromOutreachText(subject);
  text = replaceEmDashesInOutreachText(text);
  text = fixOutreachPunctuationSpacing(text);
  return text.trim();
}

export function outreachEmailToPlainText(draft: OutreachEmailDraft): string {
  return `Subject: ${draft.subject.trim()}\n\n${draft.body.trim()}`;
}

export function outreachEmailToMarkdown(draft: OutreachEmailDraft): string {
  const title = draft.recipientName?.trim()
    ? draft.recipientName.trim()
    : draft.scopeLabel;
  const lines: string[] = [
    `# Outreach email: ${title}`,
    "",
    `**Subject:** ${draft.subject.trim()}`,
    "",
    "---",
    "",
    draft.body.trim(),
    "",
    "## Personalization (not copied)",
    "",
  ];
  for (const bullet of draft.personalizationBullets) {
    lines.push(`- ${bullet}`);
  }
  if (draft.suggestedEdits?.length) {
    lines.push("", "## Suggested edits", "");
    for (const edit of draft.suggestedEdits) {
      lines.push(`- ${edit}`);
    }
  }
  if (draft.sources.length > 0) {
    lines.push("", "## Sources", "");
    for (const source of draft.sources) {
      const statusLabel = formatUntrustedSourceStatusLabel(
        source.status,
        source.failureReason
      );
      const status =
        source.status === "ok"
          ? ""
          : ` (${statusLabel || source.status})`;
      lines.push(`- [${source.title}](${source.url})${status}`);
    }
  }
  return lines.join("\n");
}

function parseSource(raw: unknown): OutreachEmailSource | null {
  if (!isRecord(raw)) {
    return null;
  }
  const title = String(raw.title || "").trim();
  const url = String(raw.url || "").trim();
  const status = String(raw.status || "ok");
  if (!title || !url) {
    return null;
  }
  if (status !== "ok" && status !== "skipped" && status !== "failed") {
    return null;
  }
  return {
    title,
    url,
    status,
    failureReason:
      typeof raw.failureReason === "string" ? raw.failureReason : undefined,
  };
}

export function parseOutreachEmailFromAssistContent(
  content: unknown,
  defaults: {
    purpose: OutreachEmailPurpose;
    scopeLabel: string;
    recipientName?: string;
    recipientRole?: string;
  }
): OutreachEmailDraft | null {
  if (!isRecord(content)) {
    return null;
  }
  const subject = normalizeOutreachEmailSubject(String(content.subject || ""));
  const body = normalizeOutreachEmailBody(
    String(content.body || ""),
    defaults.recipientName
  );
  if (!subject || !body) {
    return null;
  }
  const personalizationBullets = Array.isArray(content.personalizationBullets)
    ? content.personalizationBullets
        .map(item => String(item || "").trim())
        .filter(Boolean)
    : [];
  const suggestedEdits = Array.isArray(content.suggestedEdits)
    ? content.suggestedEdits.map(item => String(item || "").trim()).filter(Boolean)
    : undefined;
  const sources: OutreachEmailSource[] = [];
  if (Array.isArray(content.sources)) {
    for (const item of content.sources) {
      const parsed = parseSource(item);
      if (parsed) {
        sources.push(parsed);
      }
    }
  }
  return {
    subject,
    body,
    personalizationBullets,
    sources,
    suggestedEdits,
    purpose: defaults.purpose,
    recipientName: defaults.recipientName,
    recipientRole: defaults.recipientRole,
    scopeLabel: defaults.scopeLabel,
    generatedAt: new Date().toISOString(),
  };
}

export function mergeDigestSourcesIntoOutreachEmail(
  draft: OutreachEmailDraft,
  digests: TabDigest[]
): OutreachEmailDraft {
  const byUrl = new Map(draft.sources.map(s => [s.url, s]));
  for (const digest of digests) {
    if (byUrl.has(digest.url)) {
      continue;
    }
    byUrl.set(digest.url, {
      title: digest.title,
      url: digest.url,
      status: digest.status,
      failureReason: digest.failureReason,
    });
  }
  return { ...draft, sources: Array.from(byUrl.values()) };
}
