
// @ts-ignore
import { Services } from "resource://gre/modules/Services.sys.mjs";

const PREF_BRANCH = "browser.assistant.tags.";
const PREF_TAGS = PREF_BRANCH + "store";

class TagsService {
  private _tagStore: Map<string, string[]> | null = null;

  private async _getStore() {
    if (this._tagStore) {
      return this._tagStore;
    }

    await Services.prefs.ready();
    const prefValue = Services.prefs.getCharPref(PREF_TAGS, "{}");
    this._tagStore = new Map(Object.entries(JSON.parse(prefValue)));
    return this._tagStore;
  }

  private async _saveStore() {
    if (this._tagStore) {
      const json = JSON.stringify(Object.fromEntries(this._tagStore));
      Services.prefs.setCharPref(PREF_TAGS, json);
    }
  }

  async addTagsToUrl({ url, tags }: { url: string; tags: string[] }) {
    const store = await this._getStore();
    const existingTags = store.get(url) || [];
    const newTags = [...new Set([...existingTags, ...tags])];
    store.set(url, newTags);
    await this._saveStore();
  }

  async getTagsForUrl({ url }: { url: string }) {
    const store = await this._getStore();
    return store.get(url) || [];
  }

  async getAllTags() {
    const store = await this._getStore();
    const allTags = new Set<string>();
    for (const tags of store.values()) {
      for (const tag of tags) {
        allTags.add(tag);
      }
    }
    return [...allTags];
  }
}

export const tagsService = new TagsService();
