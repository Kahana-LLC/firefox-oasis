const TOOL_LABELS: Record<string, string> = {
  // Commands (from build/src/commands.ts)
  list_tabs: "Listing tabs",
  new_window: "Opening new window",
  organize_windows: "Organizing windows",
  show_url: "Opening URL",
  open_tab: "Opening tab",
  close_tab: "Closing tab",
  move_tab_to_new_window: "Moving tab to new window",
  copy_tab_urls: "Copying tab URLs",

  // Bookmark Folders (formerly Hubs)
  create_bookmark_folder: "Creating folder",
  delete_bookmark_folder: "Deleting folder",
  list_bookmark_folders: "Listing folders",
  rename_bookmark_folder: "Renaming folder",
  add_tab_to_bookmark_folder: "Adding tab to folder",
  remove_tab_from_bookmark_folder: "Removing tab from folder",
  open_bookmark_folder: "Opening folder",
  split_tabs: "Splitting tabs",

  // Tab Groups
  list_tab_groups: "Listing groups",
  create_tab_group: "Creating group",
  delete_tab_group: "Deleting group",
  add_tab_to_group: "Adding tab to group",
  remove_tab_from_group: "Removing from group",
  rename_tab_group: "Renaming group",

  // Other helpers
  search_memory: "Searching memory",
  open_search_result: "Opening result",
  summarize_page: "Reading page",
  show_subscription: "Showing subscription",
  confirm_action: "Confirming action",

  // UI/bridge actions
  openTab: "Opening tab",
  createTabGroup: "Creating tab group",
  addTabsToGroup: "Adding tabs to group",
  syncTabs: "Syncing tabs",
};

export default TOOL_LABELS;
