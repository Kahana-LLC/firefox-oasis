import {
  UNTRUSTED_BLOCK_END,
  UNTRUSTED_BLOCK_START,
  buildTrustedUserIntentBlock,
  sanitizeUntrustedMetadata,
  sanitizeUntrustedWebText,
  wrapUntrustedJsonBlock,
} from "./untrustedContent.js";

export const PAGE_CONTEXT_REQUEST_MARKER = "__PAGE_CONTEXT_REQUEST__";

export type PageContextRequestPayload = {
  title: string;
  url: string;
  userQuery: string;
  content: string;
};

export function buildPageContextRequestMessage(
  payload: PageContextRequestPayload
): string {
  const sanitizedContent = sanitizeUntrustedWebText(payload.content);
  const trusted = buildTrustedUserIntentBlock({
    user_query: payload.userQuery,
    page_title: sanitizeUntrustedMetadata(payload.title),
    page_url: payload.url,
  });
  const evidence = wrapUntrustedJsonBlock("Active page content", {
    title: sanitizeUntrustedMetadata(payload.title),
    url: payload.url,
    content: sanitizedContent.shouldSkip ? "" : sanitizedContent.text,
    skipped: sanitizedContent.shouldSkip,
  });
  return `${PAGE_CONTEXT_REQUEST_MARKER}\n${trusted}\n\n${evidence}`;
}

export function hasPageContextRequest(text: string): boolean {
  return String(text || "").includes(PAGE_CONTEXT_REQUEST_MARKER);
}

function parseTrustedBlockField(
  block: string,
  field: string
): string | undefined {
  const match = block.match(new RegExp(`^${field}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim();
}

function parseUntrustedPageEvidence(
  input: string
): { title: string; url: string; content: string } | null {
  const start = input.indexOf(UNTRUSTED_BLOCK_START);
  const end = input.indexOf(UNTRUSTED_BLOCK_END);
  if (start < 0 || end <= start) {
    return null;
  }
  const jsonText = input
    .slice(start + UNTRUSTED_BLOCK_START.length, end)
    .trim();
  try {
    const raw = JSON.parse(jsonText) as Record<string, unknown>;
    if (typeof raw.title !== "string" || typeof raw.url !== "string") {
      return null;
    }
    return {
      title: raw.title,
      url: raw.url,
      content: typeof raw.content === "string" ? raw.content : "",
    };
  } catch {
    return null;
  }
}

export function parsePageContextRequestMessage(
  text: string
): PageContextRequestPayload | null {
  const input = String(text || "");
  const markerIndex = input.indexOf(PAGE_CONTEXT_REQUEST_MARKER);
  if (markerIndex < 0) {
    return null;
  }

  const body = input
    .slice(markerIndex + PAGE_CONTEXT_REQUEST_MARKER.length)
    .trim();

  const evidence = parseUntrustedPageEvidence(body);
  if (evidence) {
    const trustedBlock = body.split(UNTRUSTED_BLOCK_START)[0] || body;
    const userQuery = parseTrustedBlockField(trustedBlock, "user_query") || "";
    return {
      title: evidence.title,
      url: evidence.url,
      userQuery,
      content: evidence.content,
    };
  }

  try {
    const raw = JSON.parse(body) as Record<string, unknown>;
    if (
      typeof raw.title === "string" &&
      typeof raw.url === "string" &&
      typeof raw.userQuery === "string" &&
      typeof raw.content === "string"
    ) {
      return {
        title: raw.title,
        url: raw.url,
        userQuery: raw.userQuery,
        content: raw.content,
      };
    }
  } catch {
    return null;
  }

  return null;
}
