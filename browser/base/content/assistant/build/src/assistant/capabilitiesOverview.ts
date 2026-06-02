import {
  CAPABILITIES_BLOCK_DELIMITER,
  CAPABILITIES_OVERVIEW_FIRST_LINE,
  OASIS_CAPABILITIES_FEATURES_URL,
  OASIS_CAPABILITIES_LINK_LABEL,
  OASIS_CAPABILITIES_FEEDBACK_URL,
  OASIS_CAPABILITIES_FEEDBACK_LINK_LABEL,
} from "../../../shared/capabilitiesOverviewConstants.js";

export type AssistToolForOverview = {
  name: string;
  description: string;
};

export {
  CAPABILITIES_BLOCK_DELIMITER,
  CAPABILITIES_OVERVIEW_FIRST_LINE,
  OASIS_CAPABILITIES_FEATURES_URL,
  OASIS_CAPABILITIES_FEEDBACK_URL,
};

const MAX_SUMMARY_CHARS = 180;

function stripLlmArgumentClauses(text: string): string {
  let s = text;
  const patterns = [
    /\s*\.?\s*accepts optional arguments:.*$/is,
    /\s*\.?\s*accepts arguments:.*$/is,
    /\s*\.?\s*accepts arguments\s.*$/is,
    /\s*\.?\s*accepts no arguments\.?\s*$/is,
    /\s*\.?\s*arguments:.*$/is,
    /\s*\.?\s*args:.*$/is,
  ];
  for (const re of patterns) {
    s = s.replace(re, "");
  }
  return s.replace(/\s+/g, " ").replace(/\s+\./g, ".").trim();
}

function firstSentenceOrCap(text: string): string {
  const t = text.trim();
  if (t.length <= MAX_SUMMARY_CHARS) {
    return t;
  }
  const dot = t.indexOf(". ");
  if (dot > 0 && dot <= MAX_SUMMARY_CHARS) {
    return t.slice(0, dot + 1).trim();
  }
  return `${t.slice(0, MAX_SUMMARY_CHARS - 1).trim()}…`;
}

export function summarizeForUser(description: string): string {
  const beforeArgs =
    description.split(" Args JSON:")[0]?.trim() || description.trim();
  let s = stripLlmArgumentClauses(beforeArgs);
  s = s.replace(/\.\s*$/, "").trim();
  if (!s) {
    return "Browser action you can ask for in plain English.";
  }
  if (!s.endsWith(".")) {
    s = `${s}.`;
  }
  s = firstSentenceOrCap(s);
  return s;
}

const kahanaMd = `[${OASIS_CAPABILITIES_LINK_LABEL}](${OASIS_CAPABILITIES_FEATURES_URL})`;
const feedbackMd = `[${OASIS_CAPABILITIES_FEEDBACK_LINK_LABEL}](${OASIS_CAPABILITIES_FEEDBACK_URL})`;

const SUPPORT_AND_FEEDBACK_HEADING = "### Support and feedback";

export function buildCapabilitiesOverviewMarkdown(
  assistTools: AssistToolForOverview[]
): string {
  if (!assistTools.length) {
    return [
      `${CAPABILITIES_OVERVIEW_FIRST_LINE}`,
      "",
      "Oasis capabilities are not available in this build.",
      "",
      "You can still describe what you wanted in plain English. When something is wrong or missing, use the feedback link below or the thumbs up and thumbs down on assistant replies (training) so we can widen what Oasis supports.",
      "",
      SUPPORT_AND_FEEDBACK_HEADING,
      "",
      "Kahana lists commands in depth; the feedback form captures suggestions. Thumbs on each reply add training signal so we can expand supported behavior quickly.",
      "",
      `- ${kahanaMd}`,
      `- ${feedbackMd}`,
    ].join("\n");
  }

  const intro = [
    `${CAPABILITIES_OVERVIEW_FIRST_LINE}`,
    "",
    "Ask in plain English; Oasis picks the right browser action. Destructive steps may ask you to confirm first.",
    "",
    "Use your imagination: rephrase, combine ideas, and try requests that are not spelled out here. If something fails or is missing, use the feedback link in Support and feedback below or the thumbs up and thumbs down on that assistant reply (training). You help expand what Oasis supports, and we use that signal to improve quickly.",
  ].join("\n");

  const webSearch = [
    "### Web and search",
    "",
    "Open a site in a new tab or run a web search when you want something beyond the page you are on.",
    "",
    "- Open a link, e.g. `Open example.com in a new tab`",
    "- Search the web, e.g. `Search the web for cheap flights to Lisbon`",
  ].join("\n");

  const generalQuestions = [
    "### General questions",
    "",
    "Ask quick factual or how-to questions that are not about the browser; Oasis answers in chat and may use the web when that helps.",
    "",
    "- Example: `Who is the president of Djibouti?`",
    "- Example: `What is the square root of 256?`",
  ].join("\n");

  const summarize = [
    "### Summarization",
    "",
    "Ask for a concise readout of the page you are on (or a tab you point at).",
    "",
    "- Example: `Summarize this page`",
  ].join("\n");

  const navigation = [
    "### Navigation",
    "",
    "Work with tabs and windows: list what is open, open new windows, move or reload tabs, pin, mute, and similar moves without digging through menus.",
    "",
    "- List or switch tabs, e.g. `What tabs do I have open?`",
    "- New windows, e.g. `Open a new window`",
  ].join("\n");

  const organization = [
    "### Organization",
    "",
    "Group tabs, split the view, and arrange how you work across tabs and panes.",
    "",
    "- Tab groups, e.g. `Create a tab group called Research`",
    "- Smart tab groups, e.g. `Group all tabs related to LLM research` or `Organize my open tabs by topic`",
    "- Split view shows two tabs side by side; you can choose which tabs. Try: `split view`",
  ].join("\n");

  const memory = [
    "### Memory and history",
    "",
    "Search across open tabs, tab groups, browsing history, and saved memory. For keyword history lookup, try `search history for agents`. For conceptual recall, ask `what did I read about AI safety`. For recent visits, try `search history`.",
    "",
    "- Cross-source recall, e.g. `Find anything about budgets across my tabs and history`",
    "- Keyword history search, e.g. `search history for agents`",
    "- If there are many matches, Oasis asks for a site, date, or extra keyword to narrow down",
    "- Semantic history recall, e.g. `what did I read about taxes last month`",
  ].join("\n");

  const supportAndFeedback = [
    SUPPORT_AND_FEEDBACK_HEADING,
    "",
    "The first link opens Kahana for the full command list and roadmap. The second is the feedback form for broad suggestions. Thumbs on assistant replies feed training so we can grow what Oasis handles in step with real use.",
    "",
    `- ${kahanaMd}`,
    `- ${feedbackMd}`,
  ].join("\n");

  return [
    intro,
    webSearch,
    generalQuestions,
    summarize,
    navigation,
    organization,
    memory,
    supportAndFeedback,
  ].join("\n\n");
}
