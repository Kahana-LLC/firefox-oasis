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

### Branding icons on macOS

Oasis icons (Dock, in-browser, DMG) are generated from a hand-off PNG or from **`browser/branding/custom/kahana_logo.svg`**. Prefer dropping a master at **`browser/branding/custom/app-icon-source.png`** (1024×1024 or larger square RGBA, e.g. 2059×2059). After changing icon art, rebuild branding assets on macOS (requires Xcode command line tools: `iconutil`, `xcrun actool`, and ImageMagick):

```bash
./browser/branding/custom/build_branding_icons.sh
./browser/branding/custom/verify_branding_icons.sh
```

This updates `firefox.icns`, `Assets.car`, `document.icns`, `disk.icns`, `background.png`, tab/about PNGs, and `macos/Assets.xcassets/AppIcon.appiconset/`. The DMG background composites `browser/base/content/assistant/images/empty-state-bg.png` with install copy on a white 1440×880 canvas (macOS system sans headline, sloth at bottom, drag arrow aligned to icon positions in `dmg_layout_common.sh`; sloth art uses trimmed ink width; icon X positions use a tighter cluster (`DMG_LAYOUT_ICON_CLUSTER_PAD=16` added to sloth ink width via `DMG_LAYOUT_FEATURE_ART_WIDTH` in `build/dmg-cluster-width.env`; arrow uses `ARROW_Y_BG_OFFSET=-32`, `ARROW_X_OFFSET=-76`, `ARROW_TIP_CLEARANCE=104`, `ARROW_GAP_PAD=10`, stroke `#777777` at width 3). After `make_dmg`, run `finalize_dmg_layout.sh` on the built `.dmg` so Finder writes a `dsstore` bound to the real **Oasis** volume (requires Automation permission for Finder). Commit regenerated `background.png`, `dsstore`, and `build/dmg-cluster-width.env` before release builds.

Do **not** copy `browser/branding/unofficial/Assets.car` into custom branding; that restores the purple unofficial Firefox Dock icon.

**Before creating a release tag** (oasis-canary / oasis-release check out `refs/tags/vX.Y.Z.N`):

1. Commit `background.png`, `dsstore`, and `browser/branding/custom/build/dmg-cluster-width.env` (the env file is required by CI verify; tags before `v1.0.0.10` do not include it).
2. On a clean checkout of the tag commit, run `./browser/branding/custom/verify_branding_icons.sh` and confirm it passes.

| Artifact | Used for |
|----------|----------|
| `Assets.car` | Dock / Finder / DMG app icon (primary on macOS 11+) |
| `firefox.icns` | Legacy bundle icon |
| `document.icns` | File-type icons in Info.plist |
| `disk.icns` | DMG volume icon |
| `background.png`, `dsstore`, `build/dmg-cluster-width.env` | DMG installer window layout |
| `default*.png`, `content/about-logo*` | Tabs, about:newtab, browser.jar |

### DMG installer window (local test)

After branding assets and a successful `./mach build`:

```bash
OBJDIR=obj-aarch64-apple-darwin25.3.0   # use your object directory name

./browser/branding/custom/build_branding_icons.sh
./browser/branding/custom/verify_branding_icons.sh

make -C "${OBJDIR}/browser/installer" stage-package

MOZ_PKG_DIR=$(make -s -C "${OBJDIR}/browser/installer" echo-variable-MOZ_PKG_DIR)
PACKAGE=$(make -s -C "${OBJDIR}/browser/installer" echo-variable-PACKAGE)

./mach python -m mozbuild.action.make_dmg \
  --dsstore browser/branding/custom/dsstore \
  --background browser/branding/custom/background.png \
  --icon browser/branding/custom/disk.icns \
  --volume-name Oasis \
  "${OBJDIR}/dist/${MOZ_PKG_DIR}" \
  "${OBJDIR}/dist/${PACKAGE}"

./browser/branding/custom/finalize_dmg_layout.sh "${OBJDIR}/dist/${PACKAGE}" "${OBJDIR}/dist/${MOZ_PKG_DIR}"
./browser/branding/custom/verify_dmg_layout.sh "${OBJDIR}/dist/${PACKAGE}"
open "${OBJDIR}/dist/${PACKAGE}"
```

Confirm the opened DMG (volume name **Oasis**, not OasisCap9) shows a white background with black headline text, sloth art at the bottom, icons at y≈300 with no overlapping text, the `Oasis.app` icon matches current branding, and drag-install works.

Re-run **finalize** whenever you change `background.png` or icon positions (`dmg_layout_common.sh` constants). Finalize captures Finder layout via a shadow mount, then **repacks** the DMG with `make_dmg` so the layout is visible when users open the file (shadow-only edits are not persisted otherwise). `capture_dmg_dsstore.sh` remains a fallback for generating `dsstore` from `stage-package` only. Grant Terminal or Cursor permission to control Finder if finalize fails.

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
- **Missing or wrong Dock icon**: Run `./browser/branding/custom/build_branding_icons.sh` (see branding section above).
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
./browser/branding/custom/verify_branding_icons.sh
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
