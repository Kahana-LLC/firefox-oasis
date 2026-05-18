export type AssistantThemeScheme = "light" | "dark";

export type AssistantThemeDef = {
  id: string;
  label: string;
  description: string;
  scheme: AssistantThemeScheme;
  order: number;
};

export const ASSISTANT_THEMES = [
  {
    id: "traditional-light",
    label: "Traditional light",
    description: "Cool neutral white and gray with slate accent",
    scheme: "light",
    order: 0,
  },
  {
    id: "default",
    label: "Oasis (default)",
    description: "Warm off-white with Oasis green accent",
    scheme: "light",
    order: 1,
  },
  {
    id: "neutral-light",
    label: "Oasis neutral light",
    description: "Cool gray UI with saturated blue accent",
    scheme: "light",
    order: 2,
  },
  {
    id: "clean-light",
    label: "Oasis clean light",
    description: "Near-white zinc surfaces with olive accent",
    scheme: "light",
    order: 3,
  },
  {
    id: "warm-light",
    label: "Oasis warm light",
    description: "Cream paper tones with muted green accent",
    scheme: "light",
    order: 4,
  },
  {
    id: "ide-light",
    label: "IDE light",
    description: "Cool gray-white with GitHub-style blue accent",
    scheme: "light",
    order: 5,
  },
  {
    id: "vs-light",
    label: "Light (Visual Studio)",
    description: "Light gray chrome with classic VS blue accent",
    scheme: "light",
    order: 6,
  },
  {
    id: "light-modern",
    label: "Light Modern",
    description: "Bright white with modern blue focus ring accent",
    scheme: "light",
    order: 7,
  },
  {
    id: "light-plus",
    label: "Light+",
    description: "High-contrast white with deep blue link accent",
    scheme: "light",
    order: 8,
  },
  {
    id: "quiet-light",
    label: "Quiet light",
    description: "Soft gray surfaces with muted purple accent",
    scheme: "light",
    order: 9,
  },
  {
    id: "solarized-light",
    label: "Solarized light",
    description: "Warm cream base3 with cyan and green accents",
    scheme: "light",
    order: 10,
  },
  {
    id: "traditional-dark",
    label: "Traditional dark",
    description: "Charcoal neutrals with soft gray accent",
    scheme: "dark",
    order: 0,
  },
  {
    id: "violet-dark",
    label: "Violet dark",
    description: "Charcoal panels with purple accent",
    scheme: "dark",
    order: 1,
  },
  {
    id: "forest-dark",
    label: "Oasis forest dark",
    description: "Olive green panels with lime green accent",
    scheme: "dark",
    order: 2,
  },
  {
    id: "slate-dark",
    label: "Oasis slate dark",
    description: "Blue-gray panels with cyan accent",
    scheme: "dark",
    order: 3,
  },
  {
    id: "high-contrast",
    label: "Oasis high contrast",
    description: "Black UI with yellow accent and white text",
    scheme: "dark",
    order: 4,
  },
  {
    id: "cool-dark",
    label: "Cool dark",
    description: "Blue-gray IDE panels with periwinkle accent",
    scheme: "dark",
    order: 5,
  },
  {
    id: "midnight-dark",
    label: "Midnight dark",
    description: "GitHub-style blue-black with bright blue accent",
    scheme: "dark",
    order: 6,
  },
  {
    id: "vs-dark",
    label: "Dark (Visual Studio)",
    description: "VS dark gray chrome with blue accent",
    scheme: "dark",
    order: 7,
  },
  {
    id: "dark-modern",
    label: "Dark Modern",
    description: "Dark gray UI with saturated blue accent",
    scheme: "dark",
    order: 8,
  },
  {
    id: "dark-plus",
    label: "Dark+",
    description: "VS Dark+ charcoal with teal accent",
    scheme: "dark",
    order: 9,
  },
  {
    id: "abyss",
    label: "Abyss",
    description: "Deep navy with periwinkle blue accent",
    scheme: "dark",
    order: 10,
  },
  {
    id: "kimbie-dark",
    label: "Kimbie dark",
    description: "Warm brown wood with orange accent",
    scheme: "dark",
    order: 11,
  },
  {
    id: "monokai",
    label: "Monokai",
    description: "Charcoal with Monokai green accent",
    scheme: "dark",
    order: 12,
  },
] as const satisfies readonly AssistantThemeDef[];

export type AssistantThemeId = (typeof ASSISTANT_THEMES)[number]["id"];

export const ASSISTANT_THEME_IDS: AssistantThemeId[] = ASSISTANT_THEMES.map(
  t => t.id
);

const THEME_ID_SET = new Set<string>(ASSISTANT_THEME_IDS);

const THEME_SCHEME_BY_ID = new Map<string, AssistantThemeScheme>(
  ASSISTANT_THEMES.map(t => [t.id, t.scheme])
);

export function isAssistantThemeId(id: string): id is AssistantThemeId {
  return THEME_ID_SET.has(id);
}

export function getAssistantThemeScheme(
  id: string
): AssistantThemeScheme | null {
  return THEME_SCHEME_BY_ID.get(id) ?? null;
}

export function assistantThemesForScheme(
  scheme: AssistantThemeScheme
): AssistantThemeDef[] {
  return ASSISTANT_THEMES.filter(t => t.scheme === scheme)
    .slice()
    .sort((a, b) => a.order - b.order);
}
