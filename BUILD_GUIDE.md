# Firefox Oasis Browser Build Guide

This guide explains how to build the Firefox Oasis browser with the AI assistant feature enabled.

## Prerequisites

- macOS (recent versions; Apple Silicon and Intel are both used in development)
- Node.js and npm installed
- Python 3
- Git
- Sufficient disk space (Firefox builds require several GB; object directories can be large)

## Overview

Building Oasis involves **three outputs** you should refresh when working on the assistant:

1. **`assistant.bundle.js`** — Core assistant logic (LangGraph, commands, services). Built from `browser/base/content/assistant/build`.
2. **`assistant.ui.bundle.js`** (and **`assistant.ui.bundle.css`**) — Preact sidebar UI. Built from `browser/base/content/assistant/ui-preact`.
3. **The browser** — Packaged via `./mach build` from the repository root.

Always run **`npm install` / `npm run build`** in both assistant projects when setting up a new clone or after deleting `node_modules`. Then run **`./mach build`** so packaged resources pick up the bundles.

## Step 1: Build the assistant core bundle

The main assistant is a TypeScript project bundled with esbuild.

### Navigate and install

```bash
cd browser/base/content/assistant/build
npm install
```

Dependencies include esbuild, TypeScript, AWS signing helpers, LangChain-related packages, and the Supabase client.

**Platform binaries**: If you see errors about the wrong platform (for example Windows esbuild on macOS), remove the folder and reinstall:

```bash
rm -rf node_modules
npm install
```

### Build

```bash
npm run build
```

This runs `node esbuild.config.mjs`, compiles `src/`, and writes **`../assistant.bundle.js`** (parent directory is `browser/base/content/assistant/`).

**Embedding assets (ORT WASM + local MiniLM weights)** are vendored under `browser/base/content/assistant/embedding-assets/` and packaged via `browser/base/jar.mn`. After upgrading `@huggingface/transformers`, run `npm run sync-embedding-assets` then `npm run build:embedding-worker`, and update `jar.mn` if the sync script adds or renames files.

You should see output similar to:

```
../assistant.bundle.js  2.5mb
Done in …ms
```

Exact size varies with features and dependencies.

## Step 2: Build the Preact assistant UI

The sidebar chat UI is a separate small npm package.

```bash
cd browser/base/content/assistant/ui-preact
npm install
npm run build
```

This produces **`../dist/assistant.ui.bundle.js`** and **`../dist/assistant.ui.bundle.css`**.

If you change only the core bundle and not the Preact app, you can skip this step. If you change React/Preact components, styles, or hooks under `ui-preact/src/`, you must run this build before `./mach build` (or before testing with a dev workflow that loads the updated files).

## Step 3: Build the Firefox browser

### Repository root

```bash
cd /path/to/firefox-oasis
```

Use your actual clone path instead of `/path/to/firefox-oasis`.

### Branding asset on macOS

Before a full browser build, ensure the custom branding asset exists:

```bash
# Only if the file is missing
cp browser/branding/unofficial/Assets.car browser/branding/custom/Assets.car
```

Without **`browser/branding/custom/Assets.car`**, macOS builds can fail during packaging steps that expect this file.

### Run the build

```bash
./mach build
```

Run all **`mach`** commands from the **repository root**, not from subdirectories.

The build configures the tree, compiles native and JS code, links, and packages the application. First-time or clean builds often take **on the order of 15–25 minutes** depending on CPU, disk, and whether the object directory was empty. Incremental rebuilds are usually much faster.

You should eventually see:

```
Your build was successful!
```

Compiler warnings are common; many are suppressed or benign. Fix errors that stop the build.

### Troubleshooting `./mach build`

- **Stale mach locks** (rare):
  ```bash
  rm -f ~/.mozbuild/srcdirs/firefox-oasis-*/_virtualenvs/mach.lock
  ```
- **Missing `Assets.car`**: See the branding step above.
- **Disk space**: Ensure enough free space for `obj-*` and `dist` outputs.

## Step 4: Run the browser

```bash
./mach run
```

### Opening the assistant

- Toolbar: **Oasis Assistant** (use **Customize Toolbar** if it is hidden).
- Menu: **View → Sidebar → Oasis Assistant** (exact labels may match your localization).

### Using the assistant

- Sign in if your deployment requires authentication for chat and voice APIs.
- Type a message and send, or use voice controls if enabled in your build.

**Voice input (composer mic)**: Recording is **push-to-talk**. Start with one tap on the microphone; **tap again** to stop, transcribe, and send. The UI should indicate when to tap again.

**Voice Agent** (full-screen voice mode, when present): Follow on-screen hints; you may tap the orb to finish a listening phase depending on your version.

## Clean build from scratch (optional)

Use this when you want a pristine dependency tree and object directory (for example before a release or after strange link or packaging errors).

```bash
# Assistant bundles — fresh node_modules
cd browser/base/content/assistant/build
rm -rf node_modules && npm install && npm run build

cd ../ui-preact
rm -rf node_modules && npm install && npm run build

# Browser — full object directory wipe, then build
cd /path/to/firefox-oasis
./mach --no-interactive clobber objdir --full
./mach build
```

A full clobber forces a complete recompile; allow significantly more time than an incremental `./mach build`.

## Architecture overview

### Layout (simplified)

```
firefox-oasis/
├── browser/base/content/assistant/
│   ├── assistant.bundle.js          # from build/ (esbuild)
│   ├── dist/
│   │   ├── assistant.ui.bundle.js   # from ui-preact (esbuild)
│   │   └── assistant.ui.bundle.css
│   ├── build/
│   │   ├── src/                     # assistant TypeScript
│   │   ├── package.json
│   │   └── esbuild.config.mjs
│   ├── ui-preact/
│   │   ├── src/                     # Preact UI
│   │   └── package.json
│   ├── assistant.xhtml
│   ├── assistant.ui.js
│   └── bootstrap.js
└── browser/components/sidebar/
    └── browser-sidebar.js           # sidebar registration
```

### Integration points

1. **Sidebar**: `browser/components/sidebar/browser-sidebar.js` registers the assistant panel.
2. **Preference**: `browser.sidebar.oasis_assistant.enabled` (default `true`) in `browser/app/profile/firefox.js`.
3. **Toolbar**: Assistant control in `browser/base/content/navigator-toolbox.inc.xhtml` (or equivalent in your branch).
4. **Bootstrap**: `browser/base/content/assistant/bootstrap.js` connects toolbar behavior to the sidebar.

### Build flow

```
Edit assistant/build/src → npm run build → assistant.bundle.js
Edit ui-preact/src       → npm run build → dist/assistant.ui.bundle.*
./mach build             → resources packaged into the browser
./mach run               → test
```

## Common issues

### Assistant UI or bundle does not reflect your edits

Rebuild the relevant npm project (`build` and/or `ui-preact`), then run `./mach build` so the packaged browser includes the new files.

### Sidebar missing or broken

- Confirm `browser.sidebar.oasis_assistant.enabled` is `true`.
- Open the **Browser Console** (e.g. **Tools → Browser Tools → Browser Console**) and check for load errors for `assistant.bundle.js` or `assistant.ui.bundle.js`.

### Authentication or API errors

- Check console and network for failed requests.
- Verify Supabase and proxy endpoints in your environment (for example `assistant/build/src/config/env.ts` and related config), without committing secrets.

## Development workflow (typical)

**Assistant backend / tools only**

```bash
cd browser/base/content/assistant/build
npm run build
cd /path/to/firefox-oasis
./mach build
./mach run
```

**Preact UI only**

```bash
cd browser/base/content/assistant/ui-preact
npm run build
cd /path/to/firefox-oasis
./mach build
./mach run
```

During rapid UI iteration, your team may use a workflow that reloads bundles without a full browser rebuild; for a **packaged** tree, `./mach build` is the reliable path.

**Chrome / browser files outside `assistant/`**

```bash
./mach build
./mach run
```

## Quick reference

```bash
# Full assistant artifacts + browser (from repo root)
cd browser/base/content/assistant/build && npm install && npm run build
cd ../ui-preact && npm install && npm run build
cd /path/to/firefox-oasis
test -f browser/branding/custom/Assets.car || cp browser/branding/unofficial/Assets.car browser/branding/custom/Assets.car
./mach build
./mach run
```

```bash
# Assistant core only
cd browser/base/content/assistant/build && npm run build
```

```bash
# Preact UI only
cd browser/base/content/assistant/ui-preact && npm run build
```

```bash
# Browser only (after other changes)
cd /path/to/firefox-oasis && ./mach build
```

## Additional resources

- Firefox build documentation: https://firefox-source-docs.mozilla.org/setup/
- Assistant TypeScript: `browser/base/content/assistant/build/src/`
- Preact UI: `browser/base/content/assistant/ui-preact/src/`
- Sidebar: `browser/components/sidebar/browser-sidebar.js`

---

**Last updated**: March 2026 (Preact build step, clean-build notes, voice UX hint).
