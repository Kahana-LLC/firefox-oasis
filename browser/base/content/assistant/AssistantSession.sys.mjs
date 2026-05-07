/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-env mozilla/sys.mjs */

const MAX_TURNS = 12;
const CAP = MAX_TURNS * 2;

function contentOf(msg) {
  if (msg == null) {
    return "";
  }
  if (typeof msg === "string") {
    return msg;
  }
  const c = msg.content;
  if (typeof c === "string") {
    return c;
  }
  if (Array.isArray(c)) {
    return c
      .map(part => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object" && "text" in part) {
          return String(part.text ?? "");
        }
        return "";
      })
      .join("");
  }
  return String(c ?? "");
}

function normalizeTurn(msg, defaultType) {
  const text = contentOf(msg);
  let t = defaultType;
  if (msg && typeof msg === "object") {
    if (msg.type === "human" || msg.type === "ai") {
      t = msg.type;
    } else if (typeof msg._getType === "function") {
      const gt = msg._getType();
      if (gt === "human" || gt === "ai") {
        t = gt;
      }
    }
  }
  return { type: t, content: text };
}

function normalizePlainList(messages) {
  const list = Array.isArray(messages) ? messages : [];
  const out = [];
  for (const m of list) {
    const role =
      m && typeof m === "object" && (m.type === "ai" || m.type === "human")
        ? m.type
        : "human";
    out.push(normalizeTurn(m, role));
  }
  if (out.length > CAP) {
    out.splice(0, out.length - CAP);
  }
  return out;
}

export const AssistantSession = {
  _messages: [],

  get messages() {
    return [...this._messages];
  },

  addTurn(userMsg, aiMsg) {
    const human = normalizeTurn(userMsg, "human");
    const ai = normalizeTurn(aiMsg, "ai");
    this._messages.push(
      { type: "human", content: human.content },
      { type: "ai", content: ai.content }
    );

    if (this._messages.length > CAP) {
      this._messages.splice(0, this._messages.length - CAP);
    }

    this._notify();
  },

  setSession(messages) {
    this._messages = normalizePlainList(messages);
    this._notify();
  },

  clear() {
    this._messages = [];
    this._notify();
  },

  _notify() {
    try {
      if (Services.obs) {
        Services.obs.notifyObservers(null, "oasis-session-updated");
      }
    } catch (e) {
      console.error("AssistantSession: Failed to notify observers", e);
    }
  },
};
