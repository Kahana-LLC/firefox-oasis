import type { OasisWindow } from "../types";

export function openExternalUrl(url: string, event?: MouseEvent): void {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const win = window as OasisWindow;
  if (typeof win.openWebLinkIn === "function") {
    win.openWebLinkIn(url, "tab", {});
    return;
  }
  if (
    window.top &&
    typeof (window.top as OasisWindow).openWebLinkIn === "function"
  ) {
    (window.top as OasisWindow).openWebLinkIn!(url, "tab", {});
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
