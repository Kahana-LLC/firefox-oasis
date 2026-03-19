# Oasis Welcome - Custom Onboarding

This is a custom onboarding experience for Firefox Oasis, separate from the default Firefox `about:welcome` page.

## Overview

The Oasis Welcome component provides a modern, streamlined onboarding flow that introduces users to Oasis-specific features:

- **AI Assistant Built-In** - Personal AI companion for writing, research, and coding
- **Privacy First** - Enhanced tracking protection and encrypted browsing
- **Seamless Collaboration** - Real-time sharing of tabs, notes, and projects

## Architecture

```
oasiswelcome/
├── content/                    # Front-end assets
│   ├── oasiswelcome.html      # Main onboarding page
│   ├── oasiswelcome.css       # Styling (light/dark mode support)
│   └── oasiswelcome.js        # Page logic and navigation
├── actors/                     # JSWindowActors for IPC
│   ├── OasisWelcomeChild.sys.mjs   # Content process actor
│   └── OasisWelcomeParent.sys.mjs  # Parent process actor
├── modules/                    # Backend modules
│   └── OasisWelcomeManager.sys.mjs # Manager for showing welcome page
└── assets/                     # Images and icons (future)
```

## How It Works

### 1. First Run Detection

The `OasisWelcomeManager` checks if the user has completed onboarding:

```javascript
shouldShowWelcome() {
  return this.isEnabled && !this.didCompleteOnboarding;
}
```

Controlled by prefs:
- `browser.oasis.welcome.enabled` - Enable/disable the feature
- `browser.oasis.welcome.didSee` - Has user seen the welcome page
- `browser.oasis.welcome.completed` - Has user completed onboarding

### 2. Display on Startup

When Firefox Oasis starts for the first time:

1. `BrowserGlue._onFirstWindowLoaded()` is called
2. Calls `OasisWelcomeManager.maybeShowWelcomeOnStartup(window)`
3. Opens `chrome://browser/content/oasiswelcome/oasiswelcome.html`

### 3. Multi-Page Flow

The onboarding consists of 3 pages:

**Page 1: Welcome & Features**
- Oasis logo and branding
- 3 feature cards (AI, Privacy, Collaboration)
- "Get Started" and "Skip" buttons

**Page 2: Customization** (placeholder)
- Setup preferences
- Customize experience

**Page 3: Complete** (placeholder)
- Completion message
- "Start Browsing" button

### 4. Communication

Uses JSWindowActor pattern:

```
Content Process          Parent Process
├─ OasisWelcomeChild ←→ OasisWelcomeParent
│  (Page scripts)        (Set preferences)
│
├─ SET_OASIS_WELCOME_SEEN
├─ SET_OASIS_ONBOARDING_COMPLETE
└─ OASIS_TELEMETRY
```

## Styling

The CSS supports:
- ✅ Light and dark mode (via `prefers-color-scheme`)
- ✅ Responsive design (mobile, tablet, desktop)
- ✅ Smooth animations and transitions
- ✅ Modern card-based layout

## Customization

### Adding New Pages

1. Add a new page div in `oasiswelcome.html`:
```html
<div class="oasis-welcome-page" id="page-4">
  <!-- Your content -->
</div>
```

2. Update `OasisWelcome.totalPages` in `oasiswelcome.js`

3. Add navigation logic if needed

### Modifying Features

Edit the feature cards in `oasiswelcome.html`:

```html
<div class="oasis-feature-card">
  <div class="oasis-feature-icon"><!-- SVG icon --></div>
  <h3 class="oasis-feature-title">Your Title</h3>
  <p class="oasis-feature-description">Your description</p>
</div>
```

### Changing Preferences

Add/modify preferences in `firefox.js`:

```javascript
pref("browser.oasis.welcome.yourPref", defaultValue);
```

## Testing

To test the onboarding:

1. Build Firefox Oasis:
   ```bash
   ./mach build
   ```

2. Run with a fresh profile:
   ```bash
   ./mach run --temp-profile
   ```

3. The Oasis welcome page should open automatically

To reset and test again:
```javascript
// In Browser Console (Ctrl+Shift+J)
Services.prefs.setBoolPref("browser.oasis.welcome.completed", false);
```

## Future Enhancements

Potential improvements:

- [ ] Add more onboarding steps
- [ ] Implement Page 2 (customization options)
- [ ] Add keyboard navigation (arrow keys)
- [ ] Include video tutorials
- [ ] Add telemetry integration
- [ ] Support for localization (l10n)
- [ ] A/B testing framework
- [ ] Import from other browsers wizard
- [ ] AI assistant introduction/setup

## References

- Design: [Figma - Kahana Oasis Browser](https://www.figma.com/design/kjU4tTKz1emsVY7L0ng6qG/Kahana-Oasis-Browser?node-id=3333-128&m=dev)
- Architecture based on Firefox's `aboutwelcome` component
- Uses JSWindowActor API for content/parent communication
