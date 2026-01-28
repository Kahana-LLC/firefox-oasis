const TOOL_LABELS: Record<string,string> = {
  // Assistant stream / generic
  runAssistantStream: 'Analyzing tabs',

  // Commands (from build/src/commands.ts)
  list_tabs: 'Listing tabs',
  new_window: 'Opening new window',
  organize_windows: 'Organizing windows',
  show_url: 'Opening URL',
  open_tab: 'Opening tab',
  close_tab: 'Closing tab',
  move_tab_to_new_window: 'Moving tab to new window',
  copy_tab_urls: 'Copying tab URLs',

  // Hub/bookmark related
  create_hub: 'Creating hub',
  delete_hub: 'Deleting hub',
  list_hubs: 'Listing hubs',
  rename_hub: 'Renaming hub',
  add_tab_to_hub: 'Adding tab to hub',
  remove_tab_from_hub: 'Removing tab from hub',
  open_hub: 'Opening hub',
  split_tabs: 'Splitting tabs',

  // Other helpers
  search_memory: 'Searching memory',
  show_subscription: 'Showing subscription',

  // UI/bridge actions
  openTab: 'Opening tab',
  createTabGroup: 'Creating tab group',
  addTabsToGroup: 'Adding tabs to group',
  syncTabs: 'Syncing tabs',
};

export default TOOL_LABELS;
