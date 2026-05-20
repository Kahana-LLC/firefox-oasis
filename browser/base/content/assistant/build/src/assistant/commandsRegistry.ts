/**
 * Command registry — instantiates all commands and builds tool definitions.
 *
 * Creates instances of all 30+ Command classes and generates the
 * tool definitions (name + description + JSON arg schema) that are
 * sent to the remote LLM for routing decisions.
 *
 * COMMAND_ARG_SCHEMA defines the argument shape for each command.
 * These schemas are appended to each tool's description so the LLM
 * knows what arguments to extract from the user's message.
 */
import {
  AddSplitViewCommand,
  AddTabToBookmarkFolderCommand,
  AddTabToGroupCommand,
  BookmarkTabCommand,
  CloseDuplicateTabsCommand,
  CloseOtherTabsCommand,
  CloseTabCommand,
  CloseTabsToLeftCommand,
  CloseTabsToRightCommand,
  Command,
  ConfirmActionCommand,
  CopyTabUrlsCommand,
  CreateBookmarkFolderCommand,
  CreateTabGroupCommand,
  DeleteBookmarkFolderCommand,
  DeleteTabGroupCommand,
  DuplicateTabCommand,
  ListBookmarkFoldersCommand,
  ListTabGroupsCommand,
  ListTabsCommand,
  MoveTabToEndCommand,
  MoveTabToNewWindowCommand,
  MoveTabToStartCommand,
  NewTabToRightCommand,
  NewWindowCommand,
  OpenBookmarkFolderCommand,
  GetRecentSearchResultsCommand,
  OpenSearchResultCommand,
  OpenSendTabToDeviceCommand,
  OpenUrlCommand,
  PlayVideoCommand,
  OpenTabCommand,
  OpenTabNoteCommand,
  OrganizeWindowsCommand,
  OrganizeTabsCommand,
  PinTabCommand,
  ReloadTabCommand,
  RemoveSplitViewCommand,
  RemoveTabFromBookmarkFolderCommand,
  RemoveTabFromGroupCommand,
  RenameBookmarkFolderCommand,
  RenameTabGroupCommand,
  ReopenClosedTabCommand,
  ResolveAmbiguityCommand,
  SearchMemoryCommand,
  SearchHistorySemanticCommand,
  SelectAllTabsCommand,
  ShowSubscriptionCommand,
  ShowURLCommand,
  SplitTabsCommand,
  BuildResearchBriefCommand,
  RegenerateResearchBriefSectionCommand,
  SummarizePageCommand,
  ToggleMuteTabCommand,
  UnloadTabCommand,
  UnpinTabCommand,
  WebSearchCommand,
} from "../commands.js";
import { registerCommandExecutors } from "../services/commandExecutionRegistry.js";

export type AssistantCommandsRegistry = {
  commands: Command[];
  toolCommandNames: Set<string>;
  assistTools: Array<{ name: string; description: string }>;
};

const COMMAND_ARG_SCHEMA: Readonly<Record<string, string>> = {
  list_tabs: `{"scope?":"window|tab-group|bookmark-folder","name?":"string"}`,
  open_url: `{"url":"string"}`,
  web_search: `{"query":"string"}`,
  play_video: `{"query":"string"}`,
  open_tab: `{"url":"string"} (legacy alias; prefer open_url/web_search)`,
  close_tab: `{"index?":"number","confirmed?":"boolean"}`,
  move_tab_to_new_window: `{"index?":"number"}`,
  copy_tab_urls: `{}`,
  split_tabs: `{"indices":"number[]"}`,
  add_split_view: `{"indices?":"number[]","withIndex?":"number","withQuery?":"string"}`,
  remove_split_view: `{}`,
  create_bookmark_folder: `{"name":"string","include?":"none|current|all"}`,
  delete_bookmark_folder: `{"name":"string","confirmed?":"boolean"}`,
  list_bookmark_folders: `{}`,
  rename_bookmark_folder: `{"from":"string","to":"string"}`,
  add_tab_to_bookmark_folder: `{"name":"string","query?":"string","all?":"boolean"}`,
  remove_tab_from_bookmark_folder: `{"name":"string","query?":"string","all?":"boolean"}`,
  open_bookmark_folder: `{"name":"string","where?":"tabgroup|window"}`,
  list_tab_groups: `{}`,
  create_tab_group: `{"name":"string","indices?":"number[]","openUrl?":"string","confirmed?":"boolean"}`,
  delete_tab_group: `{"name":"string","confirmed?":"boolean"}`,
  add_tab_to_group: `{"name":"string","query?":"string","all?":"boolean","confirmed?":"boolean"}`,
  remove_tab_from_group: `{"index?":"number"}`,
  rename_tab_group: `{"from":"string","to":"string"}`,
  resolve_ambiguity: `{"target?":"bookmark-folder|tab-group|tab|cancel"}`,
  confirm_action: `{"confirmed":"boolean"}`,
  new_window: `{}`,
  new_tab_to_right: `{"index?":"number"}`,
  organize_windows: `{}`,
  organize_tabs: `{"mode?":"single_focus|multi_topic|research_vs_other","focus?":"string","name?":"string","scope?":"window|tab-group|tabs|ungrouped_only","use_active_tab_group?":"boolean","tab_queries?":"string[]","tab_indices?":"number[]","max_groups?":"number","max_tabs?":"number","exclude_indices?":"number[]","exclude_queries?":"string[]","use_snippets?":"boolean","preview_confirmed?":"boolean","confirmed?":"boolean"}`,
  show_url: `{"url":"string"}`,
  search_memory: `{"query":"string","folder?":"string","source?":"bookmark-folder"}`,
  get_recent_search_results: `{"limit?":"number"}`,
  open_search_result: `{"url?":"string","index?":"number","type?":"tab","bookmarkGuid?":"string"}`,
  summarize_page: `{"index?":"number","query?":"string (the user's page-grounded question or task)"}`,
  build_research_brief: `{"topic?":"string","infer_topic_from_content?":"boolean","scope?":"tab-group|window|tabs","name?":"string","use_active_tab_group?":"boolean","tab_queries?":"string[]","tab_indices?":"number[]","outline_hint?":"string","max_tabs?":"number","exclude_indices?":"number[]","exclude_queries?":"string[]","scope_confirmed?":"boolean","quota_mode?":"truncate|fewer_tabs"}`,
  regenerate_research_brief_section: `{"brief_id?":"string","section":"executiveSummary|outline|themes|sources|gapsAndContradictions"}`,
  show_subscription: `{}`,
  search_history: `{"query?":"string","mode?":"keyword|semantic|recent|auto","domain?":"string","since?":"string","extra?":"string","refined?":"boolean","skipRefinement?":"boolean"}`,
};

function toAssistToolDescription(command: Command): string {
  const schema = COMMAND_ARG_SCHEMA[command.commandName];
  if (!schema) {
    return command.description;
  }
  return `${command.description} Args JSON: ${schema}`;
}

export function createAssistantCommandsRegistry(): AssistantCommandsRegistry {
  const commands: Command[] = [
    new ListTabsCommand(),
    new OpenUrlCommand(),
    new WebSearchCommand(),
    new PlayVideoCommand(),
    new OpenTabCommand(),
    new CloseTabCommand(),
    new ReloadTabCommand(),
    new ToggleMuteTabCommand(),
    new PinTabCommand(),
    new UnpinTabCommand(),
    new UnloadTabCommand(),
    new NewTabToRightCommand(),
    new DuplicateTabCommand(),
    new BookmarkTabCommand(),
    new MoveTabToStartCommand(),
    new MoveTabToEndCommand(),
    new SelectAllTabsCommand(),
    new CloseDuplicateTabsCommand(),
    new CloseTabsToRightCommand(),
    new CloseTabsToLeftCommand(),
    new CloseOtherTabsCommand(),
    new ReopenClosedTabCommand(),
    new OpenSendTabToDeviceCommand(),
    new OpenTabNoteCommand(),
    new MoveTabToNewWindowCommand(),
    new CopyTabUrlsCommand(),
    new SplitTabsCommand(),
    new AddSplitViewCommand(),
    new RemoveSplitViewCommand(),
    new CreateBookmarkFolderCommand(),
    new DeleteBookmarkFolderCommand(),
    new ListBookmarkFoldersCommand(),
    new RenameBookmarkFolderCommand(),
    new AddTabToBookmarkFolderCommand(),
    new RemoveTabFromBookmarkFolderCommand(),
    new OpenBookmarkFolderCommand(),
    new ListTabGroupsCommand(),
    new CreateTabGroupCommand(),
    new DeleteTabGroupCommand(),
    new AddTabToGroupCommand(),
    new RemoveTabFromGroupCommand(),
    new RenameTabGroupCommand(),
    new ResolveAmbiguityCommand(),
    new ConfirmActionCommand(),
    new NewWindowCommand(),
    new OrganizeWindowsCommand(),
    new OrganizeTabsCommand(),
    new ShowURLCommand(),
    new SearchMemoryCommand(),
    new GetRecentSearchResultsCommand(),
    new OpenSearchResultCommand(),
    new SummarizePageCommand(),
    new BuildResearchBriefCommand(),
    new RegenerateResearchBriefSectionCommand(),
    new ShowSubscriptionCommand(),
    // Semantic history search (local embeddings + vector DB)
    new SearchHistorySemanticCommand(),
  ];
  registerCommandExecutors(commands);

  return {
    commands,
    toolCommandNames: new Set(commands.map(command => command.commandName)),
    assistTools: commands.map(command => ({
      name: command.commandName,
      description: toAssistToolDescription(command),
    })),
  };
}
