import {
  AddSplitViewCommand,
  AddTabToBookmarkFolderCommand,
  AddTabToGroupCommand,
  CloseTabCommand,
  Command,
  ConfirmActionCommand,
  CopyTabUrlsCommand,
  CreateBookmarkFolderCommand,
  CreateTabGroupCommand,
  DeleteBookmarkFolderCommand,
  DeleteTabGroupCommand,
  ListBookmarkFoldersCommand,
  ListTabGroupsCommand,
  ListTabsCommand,
  MoveTabToNewWindowCommand,
  NewWindowCommand,
  OpenBookmarkFolderCommand,
  OpenSearchResultCommand,
  OpenTabCommand,
  OrganizeWindowsCommand,
  RemoveSplitViewCommand,
  RemoveTabFromBookmarkFolderCommand,
  RemoveTabFromGroupCommand,
  RenameBookmarkFolderCommand,
  RenameTabGroupCommand,
  ResolveAmbiguityCommand,
  SearchMemoryCommand,
  ShowSubscriptionCommand,
  ShowURLCommand,
  SplitTabsCommand,
  SummarizePageCommand,
} from "../commands.js";

export type AssistantCommandsRegistry = {
  commands: Command[];
  toolCommandNames: Set<string>;
};

export function createAssistantCommandsRegistry(): AssistantCommandsRegistry {
  const commands: Command[] = [
    new ListTabsCommand(),
    new OpenTabCommand(),
    new CloseTabCommand(),
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
    new ShowURLCommand(),
    new SearchMemoryCommand(),
    new OpenSearchResultCommand(),
    new SummarizePageCommand(),
    new ShowSubscriptionCommand(),
  ];

  return {
    commands,
    toolCommandNames: new Set(commands.map(command => command.commandName)),
  };
}
