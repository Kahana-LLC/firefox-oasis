export type OrganizeTabsUtteranceExpectation = {
  phrase: string;
  route:
    | "organize_tabs"
    | "organize_windows"
    | "create_tab_group"
    | "not_organize";
  mode?: string;
  scope?: string;
  focus?: string;
  name?: string;
  useActiveGroup?: boolean;
  excludeIndices?: number[];
};

export const ORGANIZE_UTTERANCE_FIXTURES: OrganizeTabsUtteranceExpectation[] = [
  {
    phrase: "Group all tabs related to LLM research",
    route: "organize_tabs",
    mode: "single_focus",
    focus: "LLM research",
  },
  {
    phrase: "I'm doing research on transformers — group those tabs",
    route: "organize_tabs",
    mode: "single_focus",
    focus: "transformers",
  },
  {
    phrase: "Put my LLM tabs in a group called LLM Research",
    route: "organize_tabs",
    mode: "single_focus",
    name: "LLM Research",
    focus: "LLM",
  },
  {
    phrase: "Organize my open tabs by topic",
    route: "organize_tabs",
    mode: "multi_topic",
    scope: "window",
  },
  {
    phrase: "Sort these tabs into groups",
    route: "organize_tabs",
    mode: "multi_topic",
  },
  {
    phrase: "Cluster my tabs in this window",
    route: "organize_tabs",
    mode: "multi_topic",
    scope: "window",
  },
  {
    phrase: "Separate my LLM research from everything else",
    route: "organize_tabs",
    mode: "research_vs_other",
    focus: "LLM research",
  },
  {
    phrase: "Split research tabs from the rest",
    route: "organize_tabs",
    mode: "research_vs_other",
  },
  {
    phrase: "Group tabs about pricing except tabs 2 and 5",
    route: "organize_tabs",
    mode: "single_focus",
    focus: "pricing",
    excludeIndices: [2, 5],
  },
  {
    phrase: "Organize ungrouped tabs only",
    route: "organize_tabs",
    mode: "multi_topic",
    scope: "ungrouped_only",
  },
  {
    phrase: "Organize tabs in tab group Sports by topic",
    route: "organize_tabs",
    mode: "multi_topic",
    scope: "tab-group",
    name: "Sports",
  },
  {
    phrase: "Organize this tab group",
    route: "organize_tabs",
    mode: "multi_topic",
    useActiveGroup: true,
  },
  {
    phrase: "Group tabs about machine learning",
    route: "organize_tabs",
    mode: "single_focus",
    focus: "machine learning",
  },
  {
    phrase: "Tidy up my open tabs",
    route: "organize_tabs",
    mode: "multi_topic",
  },
  {
    phrase: "Clean up tabs in this window",
    route: "organize_tabs",
    mode: "multi_topic",
    scope: "window",
  },
  {
    phrase: "Organize tabs from tab group research by topic",
    route: "organize_tabs",
    mode: "multi_topic",
    scope: "tab-group",
    name: "research",
  },
  {
    phrase: "Isolate my sports research from other tabs",
    route: "organize_tabs",
    mode: "research_vs_other",
    focus: "sports research",
  },
  {
    phrase: "organize windows",
    route: "organize_windows",
  },
  {
    phrase: "Create a tab group called Research",
    route: "create_tab_group",
  },
  {
    phrase: "Build a research brief from tab group sports",
    route: "not_organize",
  },
  {
    phrase: "What tabs do I have open",
    route: "not_organize",
  },
  {
    phrase: "Add tabs about LLM to group Research",
    route: "not_organize",
  },
  {
    phrase: "Organize my tabs",
    route: "organize_tabs",
    mode: "multi_topic",
  },
  {
    phrase: "Group all tabs about OAuth in a group called Auth Research",
    route: "organize_tabs",
    mode: "single_focus",
    focus: "OAuth",
    name: "Auth Research",
  },
  {
    phrase: "Separate my LLM work from unrelated tabs",
    route: "organize_tabs",
    mode: "research_vs_other",
    focus: "LLM work",
  },
  {
    phrase: "group all tabs reltated to LLMs",
    route: "organize_tabs",
    mode: "single_focus",
    focus: "LLMs",
  },
  {
    phrase: "can you group all tabs related to LLMs?",
    route: "organize_tabs",
    mode: "single_focus",
    focus: "LLMs",
  },
  {
    phrase: "please organize tabs related to OAuth",
    route: "organize_tabs",
    mode: "single_focus",
    focus: "OAuth",
  },
  {
    phrase: 'group tabs related to "machine learning"',
    route: "organize_tabs",
    mode: "single_focus",
    focus: "machine learning",
  },
  {
    phrase: "put all my LLM tabs together",
    route: "organize_tabs",
    mode: "single_focus",
    focus: "LLM",
  },
  {
    phrase: "categorize tabs about React",
    route: "organize_tabs",
    mode: "single_focus",
    focus: "React",
  },
  {
    phrase: "bundle tabs regarding climate change",
    route: "organize_tabs",
    mode: "single_focus",
    focus: "climate change",
  },
  {
    phrase: "collect tabs about pricing into a group",
    route: "organize_tabs",
    mode: "single_focus",
    focus: "pricing",
  },
  {
    phrase: "all the tabs about transformers — group them",
    route: "organize_tabs",
    mode: "single_focus",
    focus: "transformers",
  },
  {
    phrase: "tabs that are about Kubernetes — organize them",
    route: "organize_tabs",
    mode: "single_focus",
    focus: "Kubernetes",
  },
  {
    phrase: "help me organize my open tabs by topic",
    route: "organize_tabs",
    mode: "multi_topic",
    scope: "window",
  },
  {
    phrase: "consolidate my open tabs",
    route: "organize_tabs",
    mode: "multi_topic",
  },
];
