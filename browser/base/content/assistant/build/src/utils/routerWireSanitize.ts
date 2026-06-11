import {
  UNTRUSTED_BLOCK_END,
  UNTRUSTED_BLOCK_START,
} from "./untrustedContent.js";
import { PAGE_CONTEXT_REQUEST_MARKER } from "./pageContextRequest.js";

const UNTRUSTED_BLOCK_RE = new RegExp(
  `${escapeRegExp(UNTRUSTED_BLOCK_START)}[\\s\\S]*?${escapeRegExp(UNTRUSTED_BLOCK_END)}`,
  "g"
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function sanitizeAssistRouterMessageContent(content: string): string {
  let text = String(content || "");
  if (text.includes(PAGE_CONTEXT_REQUEST_MARKER)) {
    return "[Page context omitted from router]";
  }
  if (text.includes(UNTRUSTED_BLOCK_START)) {
    text = text.replace(UNTRUSTED_BLOCK_RE, "[Untrusted tab data omitted]");
  }
  return text;
}
