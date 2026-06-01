export type UtteranceExpectation = {
  phrase: string;
  route: "build_research_brief" | "summarize_page" | "not_brief";
  scope?: string;
  useActiveGroup?: boolean;
  name?: string;
  inferTopic?: boolean;
  topic?: string;
};

export const UTTERANCE_FIXTURES: UtteranceExpectation[] = [
  {
    phrase: "Build a research brief on AI privacy tools from tab group AI Privacy",
    route: "build_research_brief",
    scope: "tab-group",
    name: "AI Privacy",
    topic: "AI privacy tools",
  },
  {
    phrase: "create a research brief based on tab group sports",
    route: "build_research_brief",
    scope: "tab-group",
    name: "sports",
    inferTopic: true,
  },
  {
    phrase: "research brief from tab group sports",
    route: "build_research_brief",
    scope: "tab-group",
    name: "sports",
    inferTopic: true,
  },
  {
    phrase: "create a brief based on this tab group",
    route: "build_research_brief",
    useActiveGroup: true,
    inferTopic: true,
  },
  {
    phrase: "research brief from this group",
    route: "build_research_brief",
    useActiveGroup: true,
    inferTopic: true,
  },
  {
    phrase: "build a report from tab group sports",
    route: "build_research_brief",
    scope: "tab-group",
    name: "sports",
    inferTopic: true,
  },
  {
    phrase: "generate a digest on college football from tab group sports",
    route: "build_research_brief",
    scope: "tab-group",
    name: "sports",
    topic: "college football",
  },
  {
    phrase: "draft an outline from tab group research",
    route: "build_research_brief",
    scope: "tab-group",
    name: "research",
    inferTopic: true,
  },
  {
    phrase: "consolidate findings from this tab group",
    route: "build_research_brief",
    useActiveGroup: true,
    inferTopic: true,
  },
  {
    phrase: "synthesize findings from tab group sports",
    route: "build_research_brief",
    scope: "tab-group",
    name: "sports",
    inferTopic: true,
  },
  {
    phrase: "compile research from my tab group sports",
    route: "build_research_brief",
    scope: "tab-group",
    name: "sports",
    inferTopic: true,
  },
  {
    phrase: "merge findings across this tab group",
    route: "build_research_brief",
    useActiveGroup: true,
    inferTopic: true,
  },
  {
    phrase: "summarize tabs in tab group sports",
    route: "build_research_brief",
    scope: "tab-group",
    name: "sports",
    inferTopic: true,
  },
  {
    phrase: "summarize tabs in sports group",
    route: "build_research_brief",
    scope: "tab-group",
    name: "sports",
    inferTopic: true,
  },
  {
    phrase: "summarize across this tab group",
    route: "build_research_brief",
    useActiveGroup: true,
    inferTopic: true,
  },
  {
    phrase: "summarize everything in my tab group sports",
    route: "build_research_brief",
    scope: "tab-group",
    name: "sports",
    inferTopic: true,
  },
  {
    phrase: "give me a summary of tab group sports",
    route: "build_research_brief",
    scope: "tab-group",
    name: "sports",
    inferTopic: true,
  },
  {
    phrase: "research brief from tabs ESPN, NFL",
    route: "build_research_brief",
    scope: "tabs",
    inferTopic: true,
  },
  {
    phrase: "report on GDPR from tabs privacy law, EU regulation",
    route: "build_research_brief",
    scope: "tabs",
    topic: "GDPR",
  },
  {
    phrase: "research brief from this window",
    route: "build_research_brief",
    scope: "window",
    inferTopic: true,
  },
  {
    phrase: "summarize this page",
    route: "summarize_page",
  },
  {
    phrase: "summarize tab 2",
    route: "summarize_page",
  },
  {
    phrase: "create a tab group sports",
    route: "not_brief",
  },
  {
    phrase: "summarize all my tabs",
    route: "not_brief",
  },
  {
    phrase: "give me a summary",
    route: "not_brief",
  },
];
