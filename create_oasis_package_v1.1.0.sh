#!/bin/bash

# Create DMG and ZIP packages for Firefox Oasis v1.1.0
# Enhanced packaging with uninstallation instructions and improved user experience

set -e

# Configuration
APP_NAME="Oasis"
BRAND_NAME="Oasis Browser"
VERSION="1.1.0"
BUILD_DATE=$(date +%Y%m%d)
DMG_NAME="Oasis-Browser-${VERSION}-${BUILD_DATE}.dmg"
ZIP_NAME="Oasis-Browser-${VERSION}-${BUILD_DATE}.zip"
APP_PATH="obj-x86_64-apple-darwin22.6.0/dist/Oasis.app"
TEMP_DIR="temp_oasis_dmg"
MOUNT_POINT="/Volumes/Oasis Browser"

echo "🚀 Creating packages for $BRAND_NAME v$VERSION (Fixed Release)"
echo "🎯 This version addresses critical XPCOM and component packaging issues"
echo ""

# Check if the app exists
if [ ! -d "$APP_PATH" ]; then
    echo "❌ Error: $APP_PATH not found!"
    echo "💡 Make sure the Oasis v1.1.0 build has completed successfully."
    echo "   Run: ./build_release_v1.1.0.sh"
    exit 1
fi

# Verify this is a fixed build (check for XPCOM libraries)
echo "🔍 Verifying fixed build components..."
XPCOM_LIBS=(
    "Contents/MacOS/libxpcom.dylib"
    "Contents/MacOS/xpcomglue.dylib"
)

for lib in "${XPCOM_LIBS[@]}"; do
    if [ ! -f "$APP_PATH/$lib" ]; then
        echo "❌ Error: Missing critical component: $lib"
        echo "💡 This appears to be a broken build. Please run the fixed build script."
        exit 1
    fi
done

# Check for broken symlinks in components
COMPONENTS_DIR="$APP_PATH/Contents/Resources/components"
if [ -d "$COMPONENTS_DIR" ]; then
    SYMLINK_COUNT=$(find "$COMPONENTS_DIR" -type l | wc -l | tr -d ' ')
    if [ "$SYMLINK_COUNT" -gt 5 ]; then
        echo "⚠️  Warning: Found $SYMLINK_COUNT symlinks in components directory"
        echo "   This may indicate a broken build with development path dependencies"
        echo "   Consider rebuilding with the fixed build script"
    fi
fi

echo "✅ Build verification passed - proceeding with packaging"
echo ""

# Create temporary directory
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

# Copy the app to temp directory
echo "📦 Copying $BRAND_NAME to temporary directory..."
cp -R "$APP_PATH" "$TEMP_DIR/"

# Create Applications symlink
echo "🔗 Creating Applications symlink..."
ln -s /Applications "$TEMP_DIR/Applications"

# Create a background image for the DMG
echo "🎨 Creating DMG background..."
mkdir -p "$TEMP_DIR/.background"

# Create an enhanced background image with Oasis branding
cat > "$TEMP_DIR/.background/background.svg" << 'EOF'
<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="300" fill="#f8f9fa"/>
  <text x="200" y="120" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#333">
    Oasis Browser v1.1.0
  </text>
  <text x="200" y="150" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#333">
    Drag to Applications to install
  </text>
  <text x="200" y="180" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#666">
    A fast, reliable, and private web browser
  </text>
  <text x="200" y="200" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#888">
    Based on Firefox technology
  </text>
  <text x="200" y="220" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#999">
    Fixed release - addresses critical build issues
  </text>
</svg>
EOF

# Create enhanced README file with uninstallation instructions
echo "📝 Creating enhanced README file..."
cat > "$TEMP_DIR/README.txt" << EOF
Oasis Browser v$VERSION

A fast, reliable, and private web browser based on Firefox technology.

## Installation
1. Extract this ZIP file or mount the DMG
2. Drag "Oasis.app" to your Applications folder
3. Launch Oasis Browser from Applications

## Uninstallation
To completely remove Oasis Browser:

### Method 1: Simple Removal
- Drag "Oasis.app" from Applications to Trash
- Empty the Trash

### Method 2: Complete Removal (includes user data)
- Drag "Oasis.app" from Applications to Trash
- Remove user data (optional):
  - ~/Library/Application Support/Oasis/
  - ~/Library/Caches/Oasis/
  - ~/Library/Preferences/org.mozilla.com.oasis.browser.plist
- Empty the Trash

### Method 3: Terminal Removal
\`\`\`bash
# Remove the application
rm -rf "/Applications/Oasis.app"

# Remove user data (optional)
rm -rf ~/Library/Application\\ Support/Oasis
rm -rf ~/Library/Caches/Oasis
rm -rf ~/Library/Preferences/org.mozilla.com.oasis.browser.plist
\`\`\`

## Features
- Fast and secure browsing
- Privacy-focused design
- Based on Firefox technology
- Custom Oasis branding
- Fixed XPCOM and component issues

## What's New in v$VERSION
- ✅ Fixed critical XPCOM loading issues
- ✅ Resolved broken component symlinks
- ✅ Self-contained application bundle
- ✅ Proper component packaging
- ✅ No development path dependencies

## System Requirements
- macOS 10.15 (Catalina) or later
- 4GB RAM minimum, 8GB recommended
- 500MB free disk space

Build Date: $(date)
Version: $VERSION

Note: This is a fixed release that addresses critical build issues
from previous versions. The application should now launch and function
properly on all compatible macOS systems.
EOF

# Create uninstall script
echo "🔧 Creating uninstall script..."
cat > "$TEMP_DIR/Uninstall Oasis Browser.command" << 'EOF'
#!/bin/bash

echo "🗑️  Oasis Browser Uninstaller"
echo "================================"
echo ""

# Check if Oasis is installed
if [ ! -d "/Applications/Oasis.app" ]; then
    echo "❌ Oasis Browser is not installed in /Applications"
    exit 1
fi

echo "📱 Found Oasis Browser installation"
echo ""

# Ask user about removing user data
echo "Do you want to remove user data (bookmarks, settings, etc.)? (y/n)"
read -r response

if [[ "$response" =~ ^[Yy]$ ]]; then
    echo "🗑️  Removing Oasis Browser and user data..."
    
    # Remove application
    rm -rf "/Applications/Oasis.app"
    
    # Remove user data
    rm -rf ~/Library/Application\ Support/Oasis
    rm -rf ~/Library/Caches/Oasis
    rm -rf ~/Library/Preferences/org.mozilla.com.oasis.browser.plist
    
    echo "✅ Oasis Browser and user data removed successfully"
else
    echo "🗑️  Removing Oasis Browser only..."
    
    # Remove application only
    rm -rf "/Applications/Oasis.app"
    
    echo "✅ Oasis Browser removed successfully"
    echo "💡 User data preserved in:"
    echo "   ~/Library/Application Support/Oasis/"
    echo "   ~/Library/Caches/Oasis/"
    echo "   ~/Library/Preferences/org.mozilla.com.oasis.browser.plist"
fi

echo ""
echo "🎉 Uninstallation complete!"
echo "Press any key to close this window..."
read -n 1
EOF

chmod +x "$TEMP_DIR/Uninstall Oasis Browser.command"

# Create DMG
echo "🔨 Creating DMG file: $DMG_NAME"
hdiutil create -volname "$BRAND_NAME" -srcfolder "$TEMP_DIR" -ov -format UDZO "$DMG_NAME"

# Create ZIP file
echo "🗜️  Creating ZIP file: $ZIP_NAME"
cd "$TEMP_DIR"
zip -r "../$ZIP_NAME" . -x "*.DS_Store"
cd ..

# Clean up
echo "🧹 Cleaning up temporary files..."
rm -rf "$TEMP_DIR"

# Get package info
DMG_SIZE=$(du -h "$DMG_NAME" | cut -f1)
DMG_BYTES=$(stat -f%z "$DMG_NAME")
ZIP_SIZE=$(du -h "$ZIP_NAME" | cut -f1)
ZIP_BYTES=$(stat -f%z "$ZIP_NAME")

echo ""
echo "✅ Packages created successfully!"
echo "📦 DMG Package: $DMG_NAME"
echo "📏 DMG Size: $DMG_SIZE ($DMG_BYTES bytes)"
echo "📦 ZIP Package: $ZIP_NAME"
echo "📏 ZIP Size: $ZIP_SIZE ($ZIP_BYTES bytes)"
echo "🏷️  Version: $VERSION"
echo "📅 Build Date: $BUILD_DATE"
echo ""
echo "🎯 Distribution ready! Users can:"
echo "   DMG: Double-click to mount, then drag Oasis to Applications"
echo "   ZIP: Extract and drag Oasis.app to Applications"
echo ""
echo "🗑️  Uninstallation options:"
echo "   - Use the included 'Uninstall Oasis Browser.command' script"
echo "   - Follow instructions in README.txt"
echo "   - Drag to Trash (simple removal)"
echo ""
echo "💡 Package comparison:"
echo "   DMG: Native macOS experience, includes uninstaller script"
echo "   ZIP: Cross-platform, smaller file size, easier distribution"
echo ""
echo "🔧 Next steps:"
echo "   - Test both packages on a clean system"
echo "   - Verify uninstallation process works"
echo "   - Create a code signing certificate for production"
echo "   - Set up automated builds and packaging"
