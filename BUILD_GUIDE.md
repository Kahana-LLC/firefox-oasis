# Firefox Oasis Browser Build Guide

This guide explains how to build the Firefox Oasis browser with the AI assistant feature enabled.

## Prerequisites

- macOS (tested on macOS 24.6.0)
- Node.js and npm installed
- Python 3
- Git
- Sufficient disk space (Firefox builds require several GB)

## Overview

Building the Firefox Oasis browser involves two main steps:

1. **Building the AI Assistant Bundle** - Compiles TypeScript code into a JavaScript bundle
2. **Building the Firefox Browser** - Compiles the entire browser with your customizations

## Step 1: Build the AI Assistant Bundle

The AI assistant is a separate TypeScript/JavaScript project that needs to be built before building the browser.

### Navigate to the Assistant Build Directory

```bash
cd browser/base/content/assistant/build
```

### Install Dependencies

```bash
npm install
```

This installs the required dependencies including:
- esbuild (for bundling)
- TypeScript
- AWS SDK dependencies
- LangChain dependencies
- Supabase client

**Important**: If you see platform-specific errors (e.g., Windows binaries on macOS), delete `node_modules` and run `npm install` again. The build system will install the correct binaries for your platform.

### Build the Assistant Bundle

```bash
npm run build
```

This runs `node esbuild.config.mjs` which:
- Compiles TypeScript files in `src/`
- Bundles all dependencies
- Outputs `assistant.bundle.js` in the parent directory (`browser/base/content/assistant/`)

You should see output like:
```
../assistant.bundle.js  1.9mb ⚠️
⚡ Done in 66ms
```

### Troubleshooting Assistant Build

- **Platform mismatch error**: If you get errors about wrong platform binaries, delete `node_modules` and run `npm install` again
- **Missing script error**: Make sure you're in the `build` subdirectory, not the `assistant` directory

## Step 2: Build the Firefox Browser

### Navigate to Firefox Root Directory

```bash
cd /path/to/firefox-oasis
```

### Important: Branding Asset Fix

Before building, ensure the branding asset file exists:

```bash
# If it doesn't exist, copy it from another branding directory
cp browser/branding/unofficial/Assets.car browser/branding/custom/Assets.car
```

This file is required for the macOS build. Without it, the build will fail with:
```
cp: /path/to/browser/branding/custom/Assets.car: No such file or directory
```

### Run the Build

```bash
./mach build
```

**Note**: Always run `mach` commands from the Firefox root directory. Do not run them from subdirectories.

The build process will:
- Configure the build system
- Compile C++, Rust, and JavaScript code
- Link libraries
- Package the browser

### Build Time and Resources

- **Time**: Expect 10-20 minutes depending on your hardware
- **CPU**: Uses parallel jobs based on available cores and memory
- **Warnings**: You may see compiler warnings (e.g., deprecated API warnings on macOS). These are typically safe to ignore.

### Successful Build Output

You should see:
```
Your build was successful!
To view a profile of the build, run |mach resource-usage|
To take your build for a test drive, run: |mach run|
```

### Troubleshooting Browser Build

- **Permission errors with mach**: Remove stale lock files:
  ```bash
  rm -f ~/.mozbuild/srcdirs/firefox-oasis-*/_virtualenvs/mach.lock
  ```
- **Missing Assets.car**: See "Branding Asset Fix" above
- **Build failures**: Check the error output. Common issues include:
  - Missing dependencies
  - Platform-specific build issues
  - Disk space issues

## Step 3: Access the AI Assistant

After successfully building the browser, launch it:

```bash
./mach run
```

### Opening the Assistant Sidebar

The AI assistant is integrated as a sidebar panel. You can open it in three ways:

#### Method 1: Toolbar Button
1. Look for the "Oasis Assistant" button in the browser toolbar
2. If not visible, right-click the toolbar → Customize Toolbar → drag the Assistant button to your toolbar
3. Click the button to toggle the sidebar

#### Method 2: View Menu
1. Go to **View** → **Sidebar** → **Oasis Assistant**
2. The sidebar will open on the left side of the browser

#### Method 3: Keyboard Shortcut
- If configured, use the keyboard shortcut for `viewOasisAssistantSidebar`

### Assistant Interface

The assistant sidebar displays:
- **Authentication section** at the top with Sign In/Sign Up buttons
- **Chat log area** in the middle
- **Input field** at the bottom with:
  - Text input for questions
  - Send button
  - Stop button (during responses)
  - Clear Context button
  - Microphone button (for voice input)

### Using the Assistant

1. **Sign In**: Click "Sign In" and authenticate using:
   - Email/password
   - Google OAuth
2. **Ask Questions**: Type your question in the input field and press Enter or click Send
3. **Voice Input**: Click the microphone button to record voice input (requires authentication)
4. **Clear Context**: Click "Clear Context" to start a fresh conversation

## Architecture Overview

### File Structure

```
firefox-oasis/
├── browser/
│   ├── base/
│   │   ├── content/
│   │   │   └── assistant/
│   │   │       ├── assistant.xhtml        # Assistant UI
│   │   │       ├── assistant.bundle.js    # Compiled bundle (from build step)
│   │   │       ├── assistant.ui.js        # UI logic
│   │   │       ├── bootstrap.js            # Button integration
│   │   │       └── build/
│   │   │           ├── src/                 # TypeScript source
│   │   │           ├── package.json
│   │   │           └── esbuild.config.mjs
│   │   └── jar.mn                          # Resource registration
│   └── components/
│       └── sidebar/
│           └── browser-sidebar.js         # Sidebar registration
```

### Integration Points

1. **Sidebar Registration**: `browser/components/sidebar/browser-sidebar.js` registers the assistant as a sidebar panel
2. **Preference**: `browser.sidebar.oasis_assistant.enabled` (default: `true`) in `browser/app/profile/firefox.js`
3. **Toolbar Button**: `browser/base/content/navigator-toolbox.inc.xhtml` defines the assistant button
4. **Bootstrap**: `browser/base/content/assistant/bootstrap.js` wires the button to the sidebar controller

### Build Process Flow

```
1. Developer edits TypeScript in assistant/build/src/
2. Run npm run build → compiles to assistant.bundle.js
3. Run mach build → includes bundle in browser.jar
4. Run mach run → browser loads with assistant sidebar
```

## Common Issues and Solutions

### Issue: Assistant bundle not updating
**Solution**: Make sure you rebuild the bundle after code changes:
```bash
cd browser/base/content/assistant/build && npm run build
```

### Issue: Sidebar doesn't appear
**Solution**: 
1. Check that preference is enabled: `browser.sidebar.oasis_assistant.enabled` should be `true`
2. Check browser console for errors (Cmd+Shift+J on macOS)
3. Verify the sidebar is registered in `browser-sidebar.js`

### Issue: Assistant button doesn't work
**Solution**: 
1. Check that `bootstrap.js` is loaded in `browser.xhtml`
2. Check browser console for JavaScript errors
3. Try accessing via View menu instead

### Issue: Authentication doesn't work
**Solution**:
1. Check browser console for authentication errors
2. Verify Supabase configuration in `assistant/build/src/config/env.ts`
3. Check network connectivity to Supabase

## Development Workflow

For active development:

1. **Edit Assistant Code**:
   ```bash
   cd browser/base/content/assistant/build
   # Edit files in src/
   npm run build
   ```

2. **Test Changes**:
   ```bash
   cd /path/to/firefox-oasis
   ./mach run
   ```

3. **For Browser Code Changes**:
   ```bash
   # After editing browser code
   ./mach build
   ./mach run
   ```

## Quick Reference

```bash
# Full build workflow
cd browser/base/content/assistant/build
npm install
npm run build
cd /path/to/firefox-oasis
./mach build
./mach run

# Quick rebuild of assistant only
cd browser/base/content/assistant/build && npm run build

# Quick rebuild of browser (after code changes)
cd /path/to/firefox-oasis && ./mach build
```

## Additional Resources

- Firefox Build Documentation: https://firefox-source-docs.mozilla.org/setup/
- Assistant Source Code: `browser/base/content/assistant/build/src/`
- Sidebar System: `browser/components/sidebar/browser-sidebar.js`

---

**Last Updated**: Based on build process tested October 2024
**Tested On**: macOS 24.6.0, Firefox Oasis build system

