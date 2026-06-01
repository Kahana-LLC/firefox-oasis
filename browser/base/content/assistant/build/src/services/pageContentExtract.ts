import type { BrowserTabLike } from "../types/runtime.js";
import { assistantLogger } from "../utils/assistantLogger.js";
import { tabTitle, tabUrl } from "./firefoxFacade.js";

export const MAX_CONTENT_CHARS_PER_TAB = 12000;
export const MIN_CONTENT_CHARS = 50;

export type PageExtractStatus = "ok" | "failed" | "skipped";

export type PageExtractResult = {
  title: string;
  url: string;
  content: string;
  status: PageExtractStatus;
  failureReason?: string;
};

export function isNonWebUrl(url: string): boolean {
  const spec = String(url || "").trim();
  return (
    spec.startsWith("about:") ||
    spec.startsWith("chrome://") ||
    spec.startsWith("moz-extension://")
  );
}

function normalizeExtractedContent(content: string): string {
  return content
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

export async function extractPageContentFromTab(
  tab: BrowserTabLike | null | undefined
): Promise<PageExtractResult> {
  const title = tabTitle(tab);
  const url = tabUrl(tab);

  if (!tab?.linkedBrowser) {
    return {
      title,
      url,
      content: "",
      status: "failed",
      failureReason: "No active tab browser.",
    };
  }

  if (isNonWebUrl(url)) {
    return {
      title,
      url,
      content: "",
      status: "skipped",
      failureReason: "Internal browser page.",
    };
  }

  const browser = tab.linkedBrowser;
  const currentWindowContext = browser.browsingContext?.currentWindowContext;

  if (!currentWindowContext) {
    return {
      title,
      url,
      content: "",
      status: "failed",
      failureReason: "Page may still be loading or is not accessible.",
    };
  }

  const pageExtractor = currentWindowContext.getActor("PageExtractor");
  if (!pageExtractor) {
    return {
      title,
      url,
      content: "",
      status: "failed",
      failureReason: "Page content extractor is not available.",
    };
  }

  try {
    let content = "";
    try {
      content = (await pageExtractor.getReaderModeContent?.()) || "";
    } catch (e) {
      assistantLogger.warn(
        "pageContentExtract",
        "Reader mode extraction failed, trying full text",
        e
      );
    }

    if (!content || content.length < MIN_CONTENT_CHARS) {
      try {
        const result = await pageExtractor.getText?.();
        content = typeof result === "string" ? result : result?.text || "";
      } catch (e) {
        assistantLogger.warn(
          "pageContentExtract",
          "Full text extraction failed",
          e
        );
      }
    }

    content = normalizeExtractedContent(content);

    if (!content || content.length < MIN_CONTENT_CHARS) {
      return {
        title,
        url,
        content: "",
        status: "failed",
        failureReason: "Not enough readable content on this page.",
      };
    }

    if (content.length > MAX_CONTENT_CHARS_PER_TAB) {
      content = content.substring(0, MAX_CONTENT_CHARS_PER_TAB) + "...";
    }

    return { title, url, content, status: "ok" };
  } catch (e) {
    return {
      title,
      url,
      content: "",
      status: "failed",
      failureReason: String(e),
    };
  }
}
