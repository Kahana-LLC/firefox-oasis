# Oasis Browser Branding Issue Analysis Report

## Executive Summary

The Oasis Browser release packages are missing the custom branding (logo and wordmark) on the new tab page, despite the branding files being correctly included in the build. This report analyzes the root causes and provides recommendations for resolution.

## Issue Description

**Problem**: The new tab page in the release version displays generic Google branding instead of the custom Oasis logo and wordmark.

**Expected Behavior**: The new tab page should display:
- Oasis logo (custom SVG with ocean/sunset design)
- "Oasis" wordmark text
- Custom branding throughout the browser interface

**Actual Behavior**: The new tab page shows:
- Generic Google search interface
- No Oasis logo or wordmark
- Standard Firefox-like appearance

## Investigation Findings

### 1. Branding Files Analysis ✅

**Status**: Branding files are correctly included in the release package

**Evidence**:
- `about-logo.svg` contains the custom Oasis logo (ocean/sunset design)
- `about-wordmark.svg` contains "Oasis" text
- `firefox-wordmark.svg` also contains "Oasis" text
- All files are present in `/Volumes/Oasis Browser 4/Oasis.app/Contents/Resources/chrome/browser/content/branding/`

**File Contents Verified**:
```svg
<!-- about-logo.svg - Custom Oasis logo with ocean/sunset design -->
<svg width="512" height="512" viewBox="0 0 512 512">
  <!-- Custom gradient and wave design -->
</svg>

<!-- about-wordmark.svg - Oasis text -->
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="56">
  <text x="10" y="35" font-family="Arial, sans-serif" font-size="32" font-weight="bold">Oasis</text>
</svg>
```

### 2. New Tab Page Configuration Analysis ✅

**Status**: New tab page is correctly configured to use Activity Stream

**Evidence**:
- New tab page uses `resource://newtab/prerendered/activity-stream.html`
- Activity Stream includes Logo component (`browser/extensions/newtab/content-src/components/Logo/Logo.jsx`)
- Logo component references `chrome://branding/content/` URLs

**Logo Component Code**:
```jsx
function Logo() {
  return (
    <h1 className="logo-and-wordmark-wrapper">
      <div className="logo-and-wordmark" role="img" data-l10n-id="newtab-logo-and-wordmark">
        <div className="logo" />
        <div className="wordmark" />
      </div>
    </h1>
  );
}
```

**CSS References**:
```scss
.logo {
  background: image-set(
    url('chrome://branding/content/about-logo.png'), 
    url('chrome://branding/content/about-logo@2x.png') 2x
  ) no-repeat center;
}

.wordmark {
  background: url('chrome://branding/content/firefox-wordmark.svg') no-repeat center center;
}
```

### 3. Chrome Protocol Handler Analysis ❌

**Status**: **ROOT CAUSE IDENTIFIED** - Chrome protocol handler issue

**Problem**: The new tab page is trying to load branding from `chrome://branding/content/` URLs, but these URLs are not resolving to the correct branding files in the release package.

**Evidence**:
- Logo component CSS references `chrome://branding/content/about-logo.png`
- Logo component CSS references `chrome://branding/content/firefox-wordmark.svg`
- These URLs should resolve to the branding files in the chrome directory
- The chrome directory exists but the protocol handler may not be properly configured

### 4. Development vs Release Comparison ❌

**Status**: Development build works correctly, release build does not

**Evidence**:
- Development build (via `./mach run`) shows correct Oasis branding
- Release build (from DMG) shows generic branding
- Same branding files are present in both builds
- Issue is specific to the packaged release

## Root Cause Analysis

### Primary Cause: Chrome Protocol Handler Configuration

The issue is that the `chrome://branding/content/` URLs are not properly resolving to the branding files in the release package. This could be due to:

1. **Missing chrome.manifest entries**: The chrome.manifest file may not properly register the branding content
2. **Incorrect chrome protocol handler**: The chrome protocol handler may not be finding the branding files
3. **Path resolution issues**: The relative paths in the chrome protocol may not resolve correctly in the packaged app

### Secondary Causes

1. **Build vs Package Discrepancy**: The build process creates the files correctly, but the packaging process may not preserve the chrome protocol configuration
2. **Code Signing Impact**: The code signing process may have affected the chrome protocol handler configuration
3. **Resource Loading Order**: The branding resources may not be loaded in the correct order during app startup

## Technical Details

### File Structure Analysis

**Build Directory** (Working):
```
obj-aarch64-apple-darwin/dist/Oasis.app/Contents/Resources/
├── chrome/
│   └── browser/
│       └── content/
│           └── branding/
│               ├── about-logo.svg ✅
│               ├── about-wordmark.svg ✅
│               └── firefox-wordmark.svg ✅
└── chrome.manifest ✅
```

**Release Package** (Not Working):
```
/Volumes/Oasis Browser 4/Oasis.app/Contents/Resources/
├── chrome/
│   └── browser/
│       └── content/
│           └── branding/
│               ├── about-logo.svg ✅
│               ├── about-wordmark.svg ✅
│               └── firefox-wordmark.svg ✅
└── chrome.manifest ✅
```

**Issue**: Files are present but `chrome://branding/content/` URLs don't resolve.

## Recommendations

### Immediate Actions

1. **Verify chrome.manifest**: Check if the chrome.manifest file properly registers the branding content
2. **Test chrome:// URLs**: Manually test if `chrome://branding/content/about-logo.svg` loads in the release
3. **Check protocol handler**: Verify the chrome protocol handler is working in the release package

### Long-term Solutions

1. **Fix chrome protocol configuration**: Ensure the chrome protocol handler is properly configured in the release package
2. **Update release script**: Modify the release script to preserve chrome protocol configuration
3. **Add verification step**: Add a step to verify branding URLs work before creating the final package

### Testing Strategy

1. **Manual URL testing**: Test `chrome://branding/content/about-logo.svg` in the release browser
2. **Console debugging**: Check browser console for 404 errors on branding resources
3. **Network tab**: Use browser dev tools to see if branding resources are being requested

## Next Steps

1. **Investigate chrome.manifest**: Check the chrome.manifest file in the release package
2. **Test chrome:// URLs**: Manually verify if branding URLs work in the release
3. **Fix protocol handler**: Resolve the chrome protocol handler configuration issue
4. **Create new release**: Build a new release with the fix
5. **Verify branding**: Test that the new release shows correct Oasis branding

## Conclusion

The branding issue is caused by the chrome protocol handler not properly resolving `chrome://branding/content/` URLs in the release package. While the branding files are correctly included, the browser cannot access them through the expected URLs. This is a configuration issue rather than a missing file issue, and should be resolvable by fixing the chrome protocol handler configuration in the release package.
