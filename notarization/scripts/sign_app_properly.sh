#!/bin/bash

# Proper Oasis Browser Code Signing Script
# This script properly signs all nested app bundles and components

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
APPLE_ID="adamkershner@rocketmail.com"
TEAM_ID="NV6BDYHYA5"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔐 Starting Proper Code Signing Process...${NC}"

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

# Function to sign a single file
sign_file() {
    local file="$1"
    echo -e "${BLUE}🔏 Signing: $(basename "$file")${NC}"
    codesign --force --verify --verbose --sign "$DEVELOPER_ID" "$file" 2>/dev/null || true
}

# Function to sign all .app bundles recursively
sign_app_bundles() {
    local dir="$1"
    echo -e "${YELLOW}📱 Signing app bundles in: $dir${NC}"
    
    # Find and sign all .app bundles (excluding the main one and invalid ones)
    find "$dir" -name "*.app" -not -path "*/Oasis-Signed.app" -not -name ".app" | while read -r app_bundle; do
        echo -e "${BLUE}📱 Signing app bundle: $(basename "$app_bundle")${NC}"
        
        # Sign all dylibs in the app bundle first
        find "$app_bundle" -name "*.dylib" | while read -r dylib; do
            sign_file "$dylib"
        done
        
        # Sign all executables in the app bundle
        find "$app_bundle" -type f -perm +111 -not -name "*.dylib" -not -name "*.so" | while read -r exe; do
            if file "$exe" | grep -q "Mach-O"; then
                sign_file "$exe"
            fi
        done
        
        # Sign the app bundle itself
        codesign --force --verify --verbose --sign "$DEVELOPER_ID" "$app_bundle"
    done
}

# Function to sign all dylibs and executables
sign_libraries_and_executables() {
    local dir="$1"
    echo -e "${YELLOW}📚 Signing libraries and executables in: $dir${NC}"
    
    # Sign all dylibs
    find "$dir" -name "*.dylib" | while read -r dylib; do
        sign_file "$dylib"
    done
    
    # Sign all executables
    find "$dir" -type f -perm +111 -not -name "*.dylib" -not -name "*.so" -not -name "*.app" | while read -r exe; do
        if file "$exe" | grep -q "Mach-O"; then
            sign_file "$exe"
        fi
    done
}

# Start signing process
echo -e "${YELLOW}🔏 Starting comprehensive signing process...${NC}"

# 1. Sign all app bundles first (nested ones)
sign_app_bundles "$SIGNED_APP_PATH"

# 2. Sign all libraries and executables in the main app
sign_libraries_and_executables "$SIGNED_APP_PATH/Contents/Frameworks"
sign_libraries_and_executables "$SIGNED_APP_PATH/Contents/MacOS"

# 3. Sign the main app bundle
echo -e "${YELLOW}🔏 Signing main Oasis Browser app bundle...${NC}"
codesign --force --verify --verbose --sign "$DEVELOPER_ID" --options runtime --entitlements "entitlements.plist" "$SIGNED_APP_PATH"

# Verify the signature
echo -e "${YELLOW}🔍 Verifying signature...${NC}"
codesign --verify --verbose "$SIGNED_APP_PATH"
spctl --assess --verbose "$SIGNED_APP_PATH"

echo -e "${GREEN}✅ Code signing completed successfully!${NC}"

# Create a ZIP file for notarization
echo -e "${YELLOW}📦 Creating ZIP file for notarization...${NC}"
ZIP_PATH="${APP_NAME}-${APP_VERSION}-for-notarization.zip"
rm -f "$ZIP_PATH"
ditto -c -k --keepParent "$SIGNED_APP_PATH" "$ZIP_PATH"

# Submit for notarization
echo -e "${YELLOW}🚀 Submitting for notarization...${NC}"
echo -e "${BLUE}This may take 5-15 minutes...${NC}"

# Get the app-specific password
echo -e "${YELLOW}Please enter your app-specific password when prompted:${NC}"
xcrun notarytool submit "$ZIP_PATH" \
    --apple-id "$APPLE_ID" \
    --team-id "$TEAM_ID" \
    --password "$(osascript -e 'text returned of (display dialog "Enter your app-specific password:" with title "App-Specific Password" default answer "" with hidden answer)')" \
    --wait

echo -e "${GREEN}✅ Notarization completed successfully!${NC}"

# Staple the notarization to the app
echo -e "${YELLOW}📌 Stapling notarization to app...${NC}"
xcrun stapler staple "$SIGNED_APP_PATH"

# Verify notarization
echo -e "${YELLOW}🔍 Verifying notarization...${NC}"
xcrun stapler validate "$SIGNED_APP_PATH"
spctl --assess --type execute --verbose "$SIGNED_APP_PATH"

echo -e "${GREEN}✅ Notarization stapled successfully!${NC}"

# Create a new DMG with the signed and notarized app
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
- Code signed and notarized by Apple

Version: $APP_VERSION
Build Date: $(date)
Status: Code Signed & Notarized ✅

For support or questions, please contact the development team.
EOF

# Create the DMG
echo -e "${YELLOW}💾 Creating signed DMG...${NC}"
hdiutil create -srcfolder "$TEMP_DIR" -volname "Oasis Browser" -fs HFS+ -format UDZO -imagekey zlib-level=9 -o "$DMG_PATH"

# Clean up
echo -e "${YELLOW}🧹 Cleaning up temporary files...${NC}"
rm -rf "$TEMP_DIR"
rm -f "$ZIP_PATH"

# Get DMG size
DMG_SIZE=$(du -h "$DMG_PATH" | cut -f1)

echo -e "${GREEN}🎉 SUCCESS! Signed and notarized DMG created!${NC}"
echo -e "${GREEN}📦 File: $DMG_PATH${NC}"
echo -e "${GREEN}📊 Size: $DMG_SIZE${NC}"
echo -e "${GREEN}🔐 Status: Code Signed & Notarized by Apple${NC}"
echo -e "${GREEN}✅ Your teammate can now install this without security warnings!${NC}"

# Open the DMG to test
echo -e "${YELLOW}🔍 Opening DMG for verification...${NC}"
open "$DMG_PATH"
