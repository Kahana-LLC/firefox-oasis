/**
 * Known site names for routing: regex fragment for looksLikeNewActionCommand
 * and URL map for "open X in a new tab" style commands.
 */

const SITE_NAMES = [
  "youtube",
  "google",
  "gmail",
  "github",
  "twitter",
  "instagram",
  "facebook",
  "reddit",
  "netflix",
  "spotify",
  "amazon",
  "wikipedia",
  "slack",
  "notion",
  "linear",
  "figma",
  "jira",
  "vercel",
  "supabase",
  "openai",
  "anthropic",
  "claude",
  "chatgpt",
  "linkedin",
  "whatsapp",
  "discord",
  "twitch",
  "tiktok",
  "pinterest",
  "dropbox",
  "zoom",
  "meet",
  "calendar",
  "drive",
  "docs",
  "sheets",
  "maps",
] as const;

export const KNOWN_SITE_NAMES_PATTERN = SITE_NAMES.join("|");

export const KNOWN_SITES_HINT_RE = new RegExp(
  `\\b(?:${KNOWN_SITE_NAMES_PATTERN})\\b`,
  "i"
);

const DEFAULT_URLS: Record<string, string> = {
  youtube: "https://www.youtube.com",
  google: "https://www.google.com",
  gmail: "https://mail.google.com",
  github: "https://github.com",
  twitter: "https://twitter.com",
  instagram: "https://www.instagram.com",
  facebook: "https://www.facebook.com",
  reddit: "https://www.reddit.com",
  netflix: "https://www.netflix.com",
  spotify: "https://open.spotify.com",
  amazon: "https://www.amazon.com",
  wikipedia: "https://www.wikipedia.org",
  slack: "https://slack.com",
  notion: "https://www.notion.so",
  linear: "https://linear.app",
  figma: "https://www.figma.com",
  jira: "https://www.atlassian.com/software/jira",
  vercel: "https://vercel.com",
  supabase: "https://supabase.com",
  openai: "https://chat.openai.com",
  anthropic: "https://www.anthropic.com",
  claude: "https://claude.ai",
  chatgpt: "https://chatgpt.com",
  linkedin: "https://www.linkedin.com",
  whatsapp: "https://web.whatsapp.com",
  discord: "https://discord.com",
  twitch: "https://www.twitch.tv",
  tiktok: "https://www.tiktok.com",
  pinterest: "https://www.pinterest.com",
  dropbox: "https://www.dropbox.com",
  zoom: "https://zoom.us",
  meet: "https://meet.google.com",
  calendar: "https://calendar.google.com",
  drive: "https://drive.google.com",
  docs: "https://docs.google.com",
  sheets: "https://sheets.google.com",
  maps: "https://maps.google.com",
};

const TYPO_ALIASES: Record<string, string> = {
  youtub: "youtube",
};

const LOOKUP: ReadonlyMap<string, string> = new Map<string, string>([
  ...(Object.entries(DEFAULT_URLS) as [string, string][]),
  ...Object.entries(TYPO_ALIASES).map(([typo, canon]): [string, string] => [
    typo,
    DEFAULT_URLS[canon] ?? `https://www.${canon}.com`,
  ]),
]);

export function resolveKnownSiteToUrl(raw: string): string | null {
  const key = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^["']|["']$/g, "");
  if (!key) {
    return null;
  }
  return LOOKUP.get(key) ?? null;
}
