// Simple Hubs page that uses the chrome-exposed gOasisGroups API (from your bootstrap).
(function () {
  function api() {
    // gOasisGroups is exposed by your chrome bootstrap (window.top).
    return (window.top && window.top.gOasisGroups) || null;
  }

  async function renderOpen() {
    const a = api(); if (!a) return;
    const tbody = document.getElementById("groups");
    tbody.textContent = "";
    const groups = await a.listOpenGroups().catch(() => []);
    for (const g of groups) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${g.id}</td>
        <td>${g.title || "(untitled)"}</td>
        <td>${g.color || ""}</td>
        <td>${g.collapsed ? "collapsed" : "open"}</td>
        <td>
          <button data-act="select" data-id="${g.id}">Focus</button>
          <button data-act="rename" data-id="${g.id}">Rename</button>
          <button data-act="delete" data-id="${g.id}">Delete</button>
        </td>`;
      tbody.appendChild(tr);
    }
  }

  async function renderSaved() {
    const a = api(); if (!a) return;
    const tbody = document.getElementById("saved");
    tbody.textContent = "";
    const saved = await a.listSavedGroups().catch(() => []);
    for (const g of saved) {
      const count = (g.tabs && g.tabs.length) || 0;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${g.id}</td>
        <td>${g.name || "(untitled)"}</td>
        <td>${count}</td>
        <td><button data-act="restore" data-saved="${g.id}">Restore</button></td>`;
      tbody.appendChild(tr);
    }
  }

  async function doAction(evt) {
    const btn = evt.target.closest("button"); if (!btn) return;
    const act = btn.getAttribute("data-act");
    const a = api(); if (!a) return;

    try {
      if (act === "select") {
        const id = Number(btn.getAttribute("data-id"));
        await a.selectGroup(id);
      } else if (act === "rename") {
        const id = Number(btn.getAttribute("data-id"));
        const title = prompt("New group title:");
        if (title != null) await a.renameGroup({ groupId: id, title });
      } else if (act === "delete") {
        const id = Number(btn.getAttribute("data-id"));
        const closeTabs = confirm("Close tabs in this group? (Cancel = ungroup instead)");
        await a.deleteGroup({ groupId: id, closeTabs });
      } else if (act === "restore") {
        const savedId = btn.getAttribute("data-saved");
        await a.restoreSavedGroup(savedId);
      }
    } catch (e) {
      console.error(e);
      alert("Action failed: " + (e?.message || e));
    } finally {
      await renderOpen();
      await renderSaved();
    }
  }

  async function init() {
    document.getElementById("refresh").addEventListener("click", async () => {
      await renderOpen(); await renderSaved();
    });
    document.addEventListener("click", doAction);
    await renderOpen();
    await renderSaved();
  }

  window.addEventListener("DOMContentLoaded", init);
})();
