# Oasis Assistant UI (Preact Migration)

The Oasis Assistant UI has been migrated from vanilla JavaScript to Preact to improve maintainability, reactivity, and design flexibility.

## Architecture

The UI is built as a standalone Preact application that is bundled and injected into a privileged Firefox XHTML container.

### Directory Structure

- `browser/base/content/assistant/ui-preact/`: The Preact project root.
  - `src/index.tsx`: Entry point for the Preact app.
  - `src/App.tsx`: Main application component, handles chat state, view switching, and resize events.
  - `src/components/Header.tsx`: Redesigned header with Sloth mascot, Beta badge, and window controls.
  - `src/components/Auth.tsx`: In-app Sign In / Sign Up component using Supabase wrappers.
  - `src/App.css`: UI styles (aligned with Figma design tokens).
  - `dist/`: Output directory for the bundled assets.
- `browser/base/content/assistant/assistant.ui.js`: Acts as a **Shim/Loader**. It initializes privileged services (Bridge, Auth, Mixpanel) and injects the Preact bundle/CSS.
- `browser/base/content/assistant/assistant.xhtml`: The host container providing the mounting point `#assistant-preact-root`.

## Build Process

To apply changes to the UI, follow this two-step process:

1. **Build the Preact Bundle:**
   ```bash
   cd browser/base/content/assistant/ui-preact
   npm run build
   ```

2. **Rebuild the Browser Resources:**
   ```bash
   ./mach build browser
   ```

## Key Integration Points

- **Authentication:** 
  - Integrated via `window.supabaseAuth` wrapper methods (`signInWithEmail`, `signUp`).
  - Listeners in `App.tsx` react to auth state changes to automatically switch views.
- **Assistant Stream:** Communication with the backend via `window.runAssistantStream(prompt, onChunk, type)`.
- **Window Controls & Resizing:** 
  - **Dragging:** Handled via `oasisOverlayDragStart` message from `Header.tsx`.
  - **Resizing:** `App.tsx` contains a bottom-right resize handle that sends `oasisOverlayResizeStart`.
  - **Messages:** Events include `oasisOverlayMinimize`, `oasisOverlayExpand`, `oasisOverlayClose`, and `oasisOverlayExitFullscreen`.
- **Jar Manifest:** `browser/base/jar.mn` includes the files in `dist/` for packaging.

## UI Design (Figma Aligned)

- **Header:** Features the Sloth icon, "Oasis AI" title, and "Beta" badge.
- **Input Area:** A white card-style container with a "Feedback?" text link, refresh context, voice input, and a circular send button.
- **Layout:** Uses flexbox for a robust full-height container, removing the previous floating-fixed limitations.

## Future Development

- **Components:** Add dedicated components for message types (e.g., Tab lists, Hub summaries).
- **Theming:** Expand CSS variables in `App.css` for more comprehensive dark mode support.
- **Context:** Implement the refresh logic to update the LLM context based on active tabs.