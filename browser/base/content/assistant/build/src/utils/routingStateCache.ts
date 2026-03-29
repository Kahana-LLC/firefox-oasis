/**
 * Routing state cache — live snapshot of tab groups and bookmark folders.
 *
 * Caches the normalized names of all tab groups and bookmark folders
 * from the browser. The deterministic resolvers use this to verify
 * that a target name like "Research" actually exists before routing.
 *
 * Listens for TabGroupCreate, TabGroupRemoved, and bookmark folder
 * change events. Auto-refreshes every 15 seconds. Supports instant
 * mutations (upsert/delete/rename) after command execution.
 */
import { bookmarkFolders } from "../bookmarkFolders.js";
import { getBrowserWindow } from "../types/runtime.js";
import {
  OASIS_EVENT_BOOKMARK_FOLDERS_CHANGED,
  type BookmarkFoldersChangedDetail,
} from "../../../shared/contracts.js";
import type {
  RoutingStateMutation,
  RoutingStateSnapshot,
} from "./routerTypes.js";
import { normalizeRouteName } from "./intentParser.js";
import { assistantLogger } from "./assistantLogger.js";

class RoutingStateCache {
  private folderNames = new Set<string>();
  private groupNames = new Set<string>();
  private dirty = true;
  private refreshing = false;
  private initialized = false;
  private lastRefresh = 0;
  private refreshTimer: number | null = null;
  private readonly refreshTtlMs = 15000;

  private normalizeEntityName(value: string): string | null {
    const normalized = normalizeRouteName(value || "");
    return normalized || null;
  }

  private markFresh(): void {
    this.dirty = false;
    this.lastRefresh = Date.now();
  }

  private refreshGroupsFromBrowser(reason: string): void {
    const nextGroups = new Set<string>();
    const topWin = getBrowserWindow();
    const gBrowser = topWin?.gBrowser;
    const groups = gBrowser?.getAllTabGroups
      ? gBrowser.getAllTabGroups()
      : gBrowser?.tabGroups || [];
    for (const group of Array.from(groups || [])) {
      const normalized = normalizeRouteName(group?.label || "");
      if (normalized) {
        nextGroups.add(normalized);
      }
    }
    this.groupNames = nextGroups;
    this.markFresh();
    assistantLogger.debug("routing-state", "Groups refreshed", {
      reason,
      groups: nextGroups.size,
    });
  }

  private replaceFolderNames(names: string[], reason: string): void {
    const nextFolders = new Set<string>();
    for (const name of names) {
      const normalized = this.normalizeEntityName(name);
      if (normalized) {
        nextFolders.add(normalized);
      }
    }
    this.folderNames = nextFolders;
    this.markFresh();
    assistantLogger.debug("routing-state", "Folders replaced", {
      reason,
      folders: nextFolders.size,
    });
  }

  ensureInitialized(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    const win = (globalThis as { window?: Window }).window;
    if (win?.addEventListener) {
      win.addEventListener(
        "TabGroupCreate",
        () => {
          try {
            this.refreshGroupsFromBrowser("tab-group-create-event");
          } catch (error) {
            assistantLogger.warn(
              "routing-state",
              "TabGroupCreate fast refresh failed",
              error
            );
            this.markDirty("tab-group-create");
          }
        },
        true
      );
      win.addEventListener(
        "TabGroupRemoved",
        () => {
          try {
            this.refreshGroupsFromBrowser("tab-group-removed-event");
          } catch (error) {
            assistantLogger.warn(
              "routing-state",
              "TabGroupRemoved fast refresh failed",
              error
            );
            this.markDirty("tab-group-removed");
          }
        },
        true
      );
      win.addEventListener(
        OASIS_EVENT_BOOKMARK_FOLDERS_CHANGED,
        (event: Event) => {
          const detail = (event as CustomEvent<BookmarkFoldersChangedDetail>).detail;
          if (Array.isArray(detail?.folderNames)) {
            this.replaceFolderNames(detail.folderNames, "bookmark-folders-event");
            return;
          }
          this.markDirty("bookmark-folders-event");
        }
      );
    }

    this.scheduleRefresh("init");
  }

  markDirty(reason: string): void {
    this.dirty = true;
    this.scheduleRefresh(reason);
  }

  applyMutation(mutation: RoutingStateMutation): void {
    this.ensureInitialized();

    if (mutation.kind === "dirty") {
      this.markDirty(mutation.reason);
      return;
    }

    const setRef = mutation.entity === "folder" ? this.folderNames : this.groupNames;

    if (mutation.kind === "upsert") {
      const normalized = this.normalizeEntityName(mutation.name);
      if (normalized) {
        setRef.add(normalized);
      }
    } else if (mutation.kind === "delete") {
      const normalized = this.normalizeEntityName(mutation.name);
      if (normalized) {
        setRef.delete(normalized);
      }
    } else if (mutation.kind === "rename") {
      const from = this.normalizeEntityName(mutation.from);
      const to = this.normalizeEntityName(mutation.to);
      if (from) {
        setRef.delete(from);
      }
      if (to) {
        setRef.add(to);
      }
    }

    this.markFresh();
    this.scheduleRefresh(`mutation-${mutation.kind}`);
    assistantLogger.debug("routing-state", "Mutation applied", {
      kind: mutation.kind,
      entity: mutation.entity,
    });
  }

  getSnapshotSync(): RoutingStateSnapshot {
    this.ensureInitialized();

    const now = Date.now();
    const stale =
      this.dirty || now - this.lastRefresh > this.refreshTtlMs || this.lastRefresh === 0;
    if (stale) {
      this.scheduleRefresh("snapshot-stale");
    }

    return {
      folderNames: new Set(this.folderNames),
      groupNames: new Set(this.groupNames),
      stale,
    };
  }

  private scheduleRefresh(reason: string): void {
    if (this.refreshTimer != null) {
      return;
    }
    const timerHost = (globalThis as { window?: Window }).window;
    if (!timerHost?.setTimeout) {
      return;
    }
    this.refreshTimer = timerHost.setTimeout(() => {
      this.refreshTimer = null;
      void this.refreshNow(reason);
    }, 120);
  }

  private async refreshNow(reason: string): Promise<void> {
    if (this.refreshing) {
      this.dirty = true;
      return;
    }

    this.refreshing = true;
    try {
      const nextFolders = new Set<string>();
      const folderSnapshot = await bookmarkFolders.getAllReadOnly();
      if (folderSnapshot.ok) {
        for (const folder of folderSnapshot.folders) {
          const normalized = normalizeRouteName(folder.name);
          if (normalized) {
            nextFolders.add(normalized);
          }
        }
      }

      const nextGroups = new Set<string>();
      this.refreshGroupsFromBrowser("full-refresh");
      for (const groupName of this.groupNames) {
        nextGroups.add(groupName);
      }

      this.folderNames = nextFolders;
      this.groupNames = nextGroups;
      this.markFresh();
      assistantLogger.debug("routing-state", "State refreshed", {
        reason,
        folders: nextFolders.size,
        groups: nextGroups.size,
      });
    } catch (e) {
      assistantLogger.warn("routing-state", "Refresh failed", e);
      this.dirty = true;
    } finally {
      this.refreshing = false;
    }
  }
}

export const routingStateCache = new RoutingStateCache();
