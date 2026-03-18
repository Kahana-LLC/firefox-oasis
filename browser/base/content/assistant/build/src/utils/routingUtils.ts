const CANCEL_RE = /^(?:no|cancel|nevermind|never\s+mind|stop)$/i;

export function parseAmbiguityResolution(
  text: string
): "bookmark-folder" | "tab-group" | "tab" | "cancel" | null {
  const input = String(text || "").trim();
  if (!input) return null;

  if (CANCEL_RE.test(input)) {
    return "cancel";
  }

  const hasTabGroup = /\btab\s*group\b/i.test(input);
  const hasBookmarkFolder = /\bbookmark\s*folder\b/i.test(input);
  if (hasTabGroup && hasBookmarkFolder) return null;
  if (hasTabGroup) return "tab-group";
  if (hasBookmarkFolder) return "bookmark-folder";

  const hasGroupWord = /\bgroup\b/i.test(input);
  const hasFolderWord = /\bfolder\b/i.test(input);
  const hasTabWord = /\btab\b/i.test(input);
  if (hasGroupWord && hasFolderWord) return null;
  if (hasGroupWord) return "tab-group";
  if (hasFolderWord) return "bookmark-folder";
  if (hasTabWord) return "tab";

  return null;
}

export function looksLikeNewActionCommand(text: string): boolean {
  const input = String(text || "");
  const hasAction = /\b(?:open|close|delete|remove|create|make|new|add|save|move|put|rename|list|show|search|find|summarize|split|go\s+to|navigate|visit)\b/i.test(
    input
  );
  const hasObjectOrTarget =
    /\b(?:tab|tabs|group|folder|bookmark|window|history|memory|page|site|website|url|link)\b/i.test(
      input
    ) ||
    /\bhttps?:\/\/[^\s]+\b|\b[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?\b/i.test(input) ||
    /\b(?:youtube|google|gmail|github|twitter|instagram|facebook|reddit|netflix|spotify|amazon|wikipedia|slack|notion|linear|figma|jira|vercel|supabase|openai|anthropic|claude|chatgpt|linkedin|whatsapp|discord|twitch|tiktok|pinterest|dropbox|zoom|meet|calendar|drive|docs|sheets|maps)\b/i.test(input);
  return hasAction && hasObjectOrTarget;
}
