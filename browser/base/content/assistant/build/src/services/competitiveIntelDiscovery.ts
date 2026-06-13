import { getBrowserWindow } from "../types/runtime.js";
import type { AssistantWindowLike } from "../types/runtime.js";
import { getChromeContext } from "./firefoxFacade.js";
import type { BrowserWindowLike } from "../types/runtime.js";

function getAssistantWindow(): AssistantWindowLike {
  return window as AssistantWindowLike;
}

export type DiscoveryTool = {
  name: string;
  url: string;
};

export const DISCOVERY_TOOLS: DiscoveryTool[] = [
  { name: "ChatGPT", url: "https://chatgpt.com" },
  { name: "Perplexity", url: "https://www.perplexity.ai" },
  { name: "Claude", url: "https://claude.ai" },
  { name: "Gemini", url: "https://gemini.google.com" },
  { name: "Grok", url: "https://grok.com" },
];

const DISCOVERY_HOST_PATTERNS = [
  /chatgpt\.com/i,
  /chat\.openai\.com/i,
  /perplexity\.ai/i,
  /claude\.ai/i,
  /gemini\.google\.com/i,
  /grok\.com/i,
  /x\.com/i,
];

export function isDiscoveryToolUrl(url: string): boolean {
  return DISCOVERY_HOST_PATTERNS.some(pattern => pattern.test(url));
}

export function openTrustedLinksInBackground(
  topWin: BrowserWindowLike | null | undefined,
  urls: string[],
  max = 8
): string[] {
  const win = topWin || getBrowserWindow();
  const { gBrowser, Services } = getChromeContext();
  const bridge = getAssistantWindow().assistantBridge;
  if (!win && !gBrowser && !bridge?.openTab) {
    return [];
  }

  const opened: string[] = [];
  const principal =
    Services?.scriptSecurityManager?.getSystemPrincipal?.() ?? undefined;

  for (const url of urls.slice(0, max)) {
    if (!url) continue;
    let didOpen = false;
    try {
      if (bridge?.openTab?.(url)) {
        didOpen = true;
      } else if (win?.openTrustedLinkIn) {
        win.openTrustedLinkIn(url, "tab");
        didOpen = true;
      } else if (win?.openWebLinkIn) {
        win.openWebLinkIn(url, "tab", { inBackground: true });
        didOpen = true;
      } else if (gBrowser?.addTrustedTab) {
        gBrowser.addTrustedTab(url, { inBackground: true });
        didOpen = true;
      } else if (gBrowser && typeof gBrowser.addTab === "function") {
        (
          gBrowser as {
            addTab: (u: string, o?: Record<string, unknown>) => unknown;
          }
        ).addTab(url, {
          triggeringPrincipal: principal,
          inBackground: true,
        });
        didOpen = true;
      }
      if (didOpen) {
        opened.push(url);
      }
    } catch {
      // skip failed opens
    }
  }
  return opened;
}

export function openDiscoveryToolTabs(): {
  openedUrls: string[];
  toolNames: string[];
} {
  const { topWin } = getChromeContext();
  const urls = DISCOVERY_TOOLS.map(tool => tool.url);
  const openedUrls = openTrustedLinksInBackground(
    topWin,
    urls,
    DISCOVERY_TOOLS.length
  );
  const openedSet = new Set(openedUrls);
  const toolNames = DISCOVERY_TOOLS.filter(tool => openedSet.has(tool.url)).map(
    tool => tool.name
  );
  return { openedUrls, toolNames };
}

export function collectDiscoveryTabIds(
  discoveryTabIds: number[],
  openedUrls: string[]
): number[] {
  const { gBrowser } = getChromeContext();
  if (!gBrowser?.tabs) {
    return discoveryTabIds;
  }
  const seen = new Set(discoveryTabIds);
  const tabs = gBrowser.tabs || [];
  for (let index = 0; index < tabs.length; index += 1) {
    const tab = tabs[index];
    const url = String(
      tab?.linkedBrowser?.currentURI?.spec ||
        tab?.linkedBrowser?.documentURI?.spec ||
        ""
    );
    if (!url) continue;
    if (
      openedUrls.some(opened => url.startsWith(opened.replace(/\/$/, ""))) ||
      isDiscoveryToolUrl(url)
    ) {
      const tabId =
        typeof tab?.linkedBrowser?.outerWindowID === "number"
          ? tab.linkedBrowser.outerWindowID
          : index + 1;
      seen.add(tabId);
    }
  }
  return [...seen];
}
