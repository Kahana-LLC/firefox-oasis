// Renders hubs like a start page and wires basic actions.
import { hubs } from "chrome://browser/content/assistant/assistant.bundle.js";

const grid = document.getElementById("grid");
const nameInput = document.getElementById("newHubName");
const createBtn = document.getElementById("createHub");

function el(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of children) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  return n;
}

function urlLabel(u, t) {
  try { return t || new URL(u).host; } catch { return t || u; }
}

function render() {
  grid.textContent = "";
  const all = hubs.getAll(); // [{name, items:[]}]
  if (!all.length) {
    grid.appendChild(el("div", { class: "card" }, [
      el("h2", {}, ["No hubs yet"]),
      el("div", {}, ["Use the Assistant or the box above to create a hub."]),
    ]));
    return;
  }
  for (const { name, items } of all) {
    const urls = el("div", { class: "urls" });
    for (const it of items.slice(0, 8)) {
      urls.appendChild(el("div", {}, [urlLabel(it.url, it.title)]));
    }
    const open = el("button", { onclick: () => { hubs.openHub(name, "tabs"); } }, ["Open all"]);
    const openWin = el("button", { onclick: () => { hubs.openHub(name, "window"); } }, ["Open in window"]);
    const del = el("button", {
      onclick: () => { if (confirm(`Delete hub "${name}"?`)) { hubs.delete(name, { closeTabs: false }); render(); } }
    }, ["Delete"]);
    const header = el("h2", {}, [
      name,
      el("span", { class: "count" }, [`${items.length}`]),
    ]);
    grid.appendChild(el("div", { class: "card" }, [
      header, urls,
      el("div", { class: "row" }, [open, openWin, del]),
    ]));
  }
}

createBtn.addEventListener("click", () => {
  const n = nameInput.value.trim();
  if (!n) return;
  hubs.create(n, { include: "none" });
  nameInput.value = "";
  render();
});
nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") createBtn.click();
});

window.addEventListener("load", () => render());
