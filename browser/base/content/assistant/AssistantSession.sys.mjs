/* eslint-env mozilla/sys.mjs */

const MAX_TURNS = 12;

export const AssistantSession = {
  _messages: [],

  get messages() {
    return [...this._messages];
  },

  addTurn(userMsg, aiMsg) {
    // We expect raw objects or LangChain message objects. 
    // We store them as simple objects to avoid instance issues across realms,
    // or we just store what is passed if we trust the consumer.
    // Ideally, store simple objects: { type: 'human'|'ai', content: '...' }
    // But the consumer (assistant.ts) expects LangChain objects.
    // Since this is a singleton, objects stored here stay alive.
    
    this._messages.push(userMsg);
    this._messages.push(aiMsg);

    const cap = MAX_TURNS * 2;
    if (this._messages.length > cap) {
      this._messages.splice(0, this._messages.length - cap);
    }

    this._notify();
  },

  setSession(messages) {
    this._messages = [...messages];
    this._notify();
  },

  clear() {
    this._messages = [];
    this._notify();
  },

  _notify() {
    try {
      if (Services.obs) {
        Services.obs.notifyObservers(null, "oasis-session-updated", null);
      }
    } catch (e) {
      console.error("AssistantSession: Failed to notify observers", e);
    }
  }
};
