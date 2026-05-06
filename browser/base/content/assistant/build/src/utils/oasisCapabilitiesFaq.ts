const OASIS_CAPABILITIES_REPLY = `I'm Oasis AI, your assistant in this browser. Here's what I focus on:

**Browser tasks (first and foremost)**
- **Tabs and navigation:** Open sites in new tabs, run web searches, and move around your windows.
- **Organization:** Create and manage tab groups, and work with your tabs in bulk when you ask.
- **Your data:** Search your browsing history and bookmarks.
- **The page you're reading:** Summarize, translate, or rework text on normal web pages you have open. (Built-in pages like the new tab page can't be summarized the same way—open a regular website first.)

**General help**
- Answer questions, brainstorm, explain ideas in plain language, and help you phrase something clearly.

I don't take the place of a coding debugger or deep technical support. If you want something done in the browser, say what you're trying to do and I'll walk you through it.

What would you like to try first?`;

export function getOasisCapabilitiesReply(userText: string): string | null {
  const t = userText.trim().toLowerCase();
  if (t.length < 12 || t.length > 220) {
    return null;
  }
  if (!/\bwhat\b/.test(t)) {
    return null;
  }
  if (!t.includes("oasis") && !t.includes("assistant")) {
    return null;
  }
  const asksScope =
    /\bcan\b/.test(t) ||
    /\bdo\b/.test(t) ||
    /\bcapabilities\b/.test(t) ||
    /\bhelp (with|me)\b/.test(t);
  if (!asksScope) {
    return null;
  }
  if (
    /\bwhat can i\b/.test(t) &&
    !t.includes("you") &&
    !t.includes("assistant")
  ) {
    return null;
  }
  return OASIS_CAPABILITIES_REPLY;
}
