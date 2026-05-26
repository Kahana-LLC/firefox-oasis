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
  return `${PAGE_CONTEXT_REQUEST_MARKER}\n${JSON.stringify(payload)}`;
}

export function hasPageContextRequest(text: string): boolean {
  return String(text || "").includes(PAGE_CONTEXT_REQUEST_MARKER);
}

export function parsePageContextRequestMessage(
  text: string
): PageContextRequestPayload | null {
  const input = String(text || "");
  const markerIndex = input.indexOf(PAGE_CONTEXT_REQUEST_MARKER);
  if (markerIndex < 0) {
    return null;
  }

  const jsonText = input
    .slice(markerIndex + PAGE_CONTEXT_REQUEST_MARKER.length)
    .trim();

  try {
    const raw = JSON.parse(jsonText) as Record<string, unknown>;
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
