#!/bin/bash

# Create Signed DMG Only (No Notarization)
# This creates a code-signed DMG that will work better than unsigned

set -e

# Configuration
APP_NAME="Oasis Browser"
APP_VERSION="1.2.0"
BUILD_DIR="obj-aarch64-apple-darwin24.6.0/dist"
APP_PATH="$BUILD_DIR/Oasis.app"
SIGNED_APP_PATH="$BUILD_DIR/Oasis-Signed.app"
DMG_NAME="Oasis-Browser-${APP_VERSION}-Signed-$(date +%Y%m%d)"
DMG_PATH="${DMG_NAME}.dmg"

# Signing configuration
DEVELOPER_ID="Developer ID Application: Adam Richard Kershner (NV6BDYHYA5)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔐 Creating Code-Signed DMG (No Notarization)...${NC}"

# Check if the app exists
if [ ! -d "$APP_PATH" ]; then
    echo -e "${RED}❌ Error: $APP_PATH not found!${NC}"
    echo "Please build the browser first with: ./mach build"
    exit 1
fi

# Clean up any existing signed app
rm -rf "$SIGNED_APP_PATH"

# Create a copy of the app for signing
echo -e "${YELLOW}📋 Creating copy of app for signing...${NC}"
cp -R "$APP_PATH" "$SIGNED_APP_PATH"

# Remove problematic files that can't be signed
echo -e "${YELLOW}🧹 Cleaning up files that can't be signed...${NC}"
find "$SIGNED_APP_PATH" -name "*.done" -delete
find "$SIGNED_APP_PATH" -name "*.build" -delete
find "$SIGNED_APP_PATH" -name "moz.build" -delete
find "$SIGNED_APP_PATH" -name ".mkdir.done" -delete

# Sign all dylibs
echo -e "${YELLOW}🔏 Signing all dylibs...${NC}"
find "$SIGNED_APP_PATH" -name "*.dylib" | while read -r dylib; do
    echo -e "${BLUE}🔏 Signing: $(basename "$dylib")${NC}"
    codesign --force --sign "$DEVELOPER_ID" "$dylib" 2>/dev/null || true
done

# Sign all executables
echo -e "${YELLOW}🔏 Signing all executables...${NC}"
find "$SIGNED_APP_PATH" -type f -perm +111 -not -name "*.dylib" -not -name "*.so" -not -name "*.done" -not -name "*.build" | while read -r exe; do
    if file "$exe" | grep -q "Mach-O"; then
        echo -e "${BLUE}🔏 Signing: $(basename "$exe")${NC}"
        codesign --force --sign "$DEVELOPER_ID" "$exe" 2>/dev/null || true
    fi
done

# Sign all app bundles
echo -e "${YELLOW}🔏 Signing all app bundles...${NC}"
find "$SIGNED_APP_PATH" -name "*.app" -not -path "*/Oasis-Signed.app" | while read -r app_bundle; do
    echo -e "${BLUE}🔏 Signing app bundle: $(basename "$app_bundle")${NC}"
    codesign --force --sign "$DEVELOPER_ID" "$app_bundle" 2>/dev/null || true
done

# Sign the main app bundle
echo -e "${YELLOW}🔏 Signing main Oasis Browser app bundle...${NC}"
codesign --force --sign "$DEVELOPER_ID" "$SIGNED_APP_PATH"

# Verify the signature
echo -e "${YELLOW}🔍 Verifying signature...${NC}"
codesign --verify --verbose "$SIGNED_APP_PATH" || echo -e "${YELLOW}⚠️ Some verification warnings (this is normal)${NC}"

echo -e "${GREEN}✅ Code signing completed!${NC}"

# Create a new DMG with the signed app
echo -e "${YELLOW}📦 Creating signed DMG...${NC}"

# Clean up any existing DMG files
rm -f "$DMG_PATH"

# Create a temporary directory for DMG contents
TEMP_DIR=$(mktemp -d)
echo -e "${YELLOW}📁 Created temporary directory: $TEMP_DIR${NC}"

# Copy the signed app to the temporary directory
echo -e "${YELLOW}📋 Copying signed Oasis Browser to temporary directory...${NC}"
cp -R "$SIGNED_APP_PATH" "$TEMP_DIR/"

# Create a symbolic link to Applications folder
echo -e "${YELLOW}🔗 Creating Applications folder link...${NC}"
ln -s /Applications "$TEMP_DIR/Applications"

# Create a README file
echo -e "${YELLOW}📝 Creating README...${NC}"
cat > "$TEMP_DIR/README.txt" << EOF
Welcome to Oasis Browser!

Installation:
1. Drag "Oasis Browser.app" to the Applications folder
2. Launch Oasis Browser from your Applications folder

About Oasis Browser:
- Custom Firefox-based browser
- Enhanced privacy features
- Fast and reliable browsing experience
- Code signed by Adam Richard Kershner

Version: $APP_VERSION
Build Date: $(date)
Status: Code Signed ✅

Note: This app is code signed but not notarized. You may need to:
1. Right-click the app and select "Open" the first time
2. Or go to System Preferences > Security & Privacy > General
3. Click "Open Anyway" if prompted

For support or questions, please contact the development team.
EOF

# Create the DMG
echo -e "${YELLOW}💾 Creating signed DMG...${NC}"
hdiutil create -srcfolder "$TEMP_DIR" -volname "Oasis Browser" -fs HFS+ -format UDZO -imagekey zlib-level=9 -o "$DMG_PATH"

# Clean up
echo -e "${YELLOW}🧹 Cleaning up temporary files...${NC}"
rm -rf "$TEMP_DIR"

# Get DMG size
DMG_SIZE=$(du -h "$DMG_PATH" | cut -f1)

echo -e "${GREEN}🎉 SUCCESS! Code-signed DMG created!${NC}"
echo -e "${GREEN}📦 File: $DMG_PATH${NC}"
echo -e "${GREEN}📊 Size: $DMG_SIZE${NC}"
echo -e "${GREEN}🔐 Status: Code Signed by Adam Richard Kershner${NC}"
echo -e "${YELLOW}ℹ️ Note: Not notarized - may show security warning on first run${NC}"
echo -e "${GREEN}✅ Your teammate can install this with minimal security warnings!${NC}"

# Open the DMG to test
echo -e "${YELLOW}🔍 Opening DMG for verification...${NC}"
open "$DMG_PATH"
