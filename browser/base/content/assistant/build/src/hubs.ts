// Persistent (per-profile) "hub" manager using localStorage.
// - A "hub" is a named group of saved items (url/title/host).
// - We badge open tabs whose host matches any item in a hub.
// - Assistant commands call into this manager.

type FxTab = any;

function getChrome() {
  const topWin = (window.top as any);
  const gBrowser = topWin?.gBrowser;
  return { topWin, gBrowser };
}

type HubItem = { url: string; title?: string; host: string; addedAt: number };
type HubRecord = Record<string, HubItem[]>;

const STORE_KEY = "oasis.hubs.v1";

function readStore(): HubRecord {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") return obj as HubRecord;
  } catch {}
  return {};
}
function writeStore(obj: HubRecord) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(obj)); } catch {}
}
function hostOf(u: string): string {
  try { return new URL(u).host.toLowerCase(); } catch { return ""; }
}

export type CreateHubOpts = { include?: "none" | "current" | "all" };
export type DeleteHubOpts = { closeTabs?: boolean };

class HubManager {
  private data: HubRecord = readStore();
  private wired = false;

  private save() { writeStore(this.data); }

  private ensure(name: string) {
    const n = (name || "").trim();
    if (!n) throw new Error("Missing hub name");
    if (!this.data[n]) this.data[n] = [];
    return n;
  }

  list(): Array<{ name: string; count: number }> {
    return Object.entries(this.data).map(([name, items]) => ({ name, count: items.length }));
  }

  getAll(): Array<{ name: string; items: HubItem[] }> {
    return Object.entries(this.data).map(([name, items]) => ({ name, items: [...items] }));
  }

  create(name: string, opts?: CreateHubOpts) {
    name = (name || "").trim() || this.suggestName();
    this.ensure(name);
    const include = opts?.include || "none";
    const { gBrowser } = getChrome();

    if (gBrowser) {
      if (include === "current") {
        const tab = gBrowser.selectedTab;
        this.addTabInternal(name, tab);
      } else if (include === "all") {
        for (const t of Array.from(gBrowser.tabs)) this.addTabInternal(name, t);
      }
    }
    this.save(); this.updateAllTabMarkers();
    return { name, count: this.data[name].length };
  }

  delete(name: string, opts?: DeleteHubOpts) {
    name = (name || "").trim();
    const items = this.data[name] || [];
    if (!items.length) { delete this.data[name]; this.save(); this.updateAllTabMarkers(); return { name, removed: 0 }; }

    if (opts?.closeTabs) {
      const { gBrowser } = getChrome();
      if (gBrowser) {
        const hostSet = new Set(items.map(i => i.host));
        for (const t of Array.from(gBrowser.tabs)) {
          const u = t?.linkedBrowser?.currentURI?.spec || "";
          if (hostSet.has(hostOf(u))) { try { gBrowser.removeTab(t); } catch {} }
        }
      }
    }
    delete this.data[name];
    this.save(); this.updateAllTabMarkers();
    return { name, removed: items.length };
  }

  rename(oldName: string, newName: string) {
    oldName = (oldName || "").trim(); newName = (newName || "").trim();
    if (!oldName || !newName || !this.data[oldName]) return { ok: false };
    if (this.data[newName]) return { ok: false, msg: "Target exists" };
    this.data[newName] = this.data[oldName];
    delete this.data[oldName];
    this.save(); this.updateAllTabMarkers();
    return { ok: true };
  }

  addCurrentTab(name: string) {
    const { gBrowser } = getChrome();
    if (!gBrowser) return { ok: false, msg: "Browser UI unavailable" };
    this.addTabInternal(name, gBrowser.selectedTab);
    this.save(); this.updateAllTabMarkers();
    return { ok: true };
  }

  removeUrl(name: string, url: string) {
    name = (name || "").trim();
    if (!this.data[name]) return { ok: false };
    const before = this.data[name].length;
    this.data[name] = this.data[name].filter(i => i.url !== url);
    const removed = before - this.data[name].length;
    this.save(); this.updateAllTabMarkers();
    return { ok: removed > 0 };
  }

  openHub(name: string, where: "tabs" | "window" = "tabs") {
    name = (name || "").trim();
    const items = this.data[name] || [];
    const { topWin } = getChrome();
    if (!topWin?.openTrustedLinkIn) return { ok: false };
    if (where === "window") {
      const w = topWin.OpenBrowserWindow();
      setTimeout(() => {
        for (const it of items) (w as any).openTrustedLinkIn(it.url, "tab");
      }, 250);
    } else {
      for (const it of items) topWin.openTrustedLinkIn(it.url, "tab");
    }
    return { ok: true };
  }

  // ---- badges on tabs (first matched hub name; count if >1 hubs match) ----
  wireTabObservers() {
    if (this.wired) return;
    const { gBrowser } = getChrome();
    if (!gBrowser) return;
    const tb = gBrowser.tabContainer;
    const upd = () => this.updateAllTabMarkers();
    tb.addEventListener("TabOpen", upd);
    tb.addEventListener("TabAttrModified", upd);
    tb.addEventListener("TabSelect", upd);
    gBrowser.addTabsProgressListener({
      onLocationChange: (_b: any) => this.updateAllTabMarkers(),
    });
    this.wired = true;
  }

  updateAllTabMarkers() {
    const { gBrowser } = getChrome();
    if (!gBrowser) return;
    for (const t of Array.from(gBrowser.tabs)) this.updateMarkerForTab(t);
  }

  private updateMarkerForTab(tab: FxTab) {
    try {
      const u = tab?.linkedBrowser?.currentURI?.spec || "";
      const h = hostOf(u);
      if (!h) { tab.removeAttribute("oasis-hub"); tab.removeAttribute("oasis-hub-count"); return; }
      const names: string[] = [];
      for (const [name, items] of Object.entries(this.data)) {
        if (items.some(it => it.host === h)) names.push(name);
      }
      if (names.length) {
        tab.setAttribute("oasis-hub", names[0]);
        tab.setAttribute("oasis-hub-count", String(names.length));
      } else {
        tab.removeAttribute("oasis-hub"); tab.removeAttribute("oasis-hub-count");
      }
    } catch {}
  }

  private addTabInternal(name: string, tab: FxTab) {
    name = this.ensure(name);
    const url = tab?.linkedBrowser?.currentURI?.spec || "";
    if (!url) return;
    const title =
      tab?.label || tab?.linkedBrowser?.contentTitle || tab?.linkedBrowser?.currentURI?.spec || "";
    const h = hostOf(url);
    const items = this.data[name];
    if (!items.some(i => i.url === url)) items.push({ url, title, host: h, addedAt: Date.now() });
  }

  private suggestName(): string {
    const base = "Hub";
    let i = 1;
    while (this.data[`${base} ${i}`]) i++;
    return `${base} ${i}`;
  }
}

export const hubs = new HubManager();
// Make sure observers are live
hubs.wireTabObservers();