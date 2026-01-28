Preact prototype for Oasis assistant UI

Build:

```bash
cd browser/base/content/assistant/ui-preact
npm install
npm run build
```

This produces `../dist/assistant.ui.bundle.js` which should be included by the chrome so it runs in the privileged context (or load `assistant.bridge.js` before it).

Notes:
- Keep `assistant.bridge.js` loaded in chrome scope to expose `window.assistantBridge`.
- The bundle must avoid `eval`/`new Function` to satisfy chrome/CSP.
