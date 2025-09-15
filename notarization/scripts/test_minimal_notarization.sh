#!/bin/bash

# Test Minimal Notarization
# This script tests notarization with a simplified approach

set -e

# Configuration
APP_NAME="Oasis Browser"
APP_VERSION="1.2.0"
BUILD_DIR="obj-aarch64-apple-darwin24.6.0/dist"
APP_PATH="$BUILD_DIR/Oasis.app"
TEST_APP_PATH="$BUILD_DIR/Oasis-Test.app"

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

echo -e "${GREEN}🧪 Testing Minimal Notarization...${NC}"

# Check if the app exists
if [ ! -d "$APP_PATH" ]; then
    echo -e "${RED}❌ Error: $APP_PATH not found!${NC}"
    exit 1
fi

# Clean up any existing test app
rm -rf "$TEST_APP_PATH"

# Create a minimal test app
echo -e "${YELLOW}📋 Creating minimal test app...${NC}"
cp -R "$APP_PATH" "$TEST_APP_PATH"

# Remove all nested app bundles and problematic files
echo -e "${YELLOW}🧹 Removing problematic components...${NC}"
rm -rf "$TEST_APP_PATH/Contents/MacOS"/*.app
rm -rf "$TEST_APP_PATH/Contents/MacOS/gtest"
rm -rf "$TEST_APP_PATH/Contents/Frameworks"
find "$TEST_APP_PATH" -name "*.done" -delete
find "$TEST_APP_PATH" -name "*.build" -delete
find "$TEST_APP_PATH" -name "moz.build" -delete
find "$TEST_APP_PATH" -name ".mkdir.done" -delete

# Keep only essential files
echo -e "${YELLOW}📦 Keeping only essential files...${NC}"
cd "$TEST_APP_PATH/Contents/MacOS"
# Keep only the main executable and essential dylibs
ls | grep -v -E "(firefox|libfreebl3|liblgpllibs|libmozglue|libnss3|libsoftokn3|XUL)" | xargs rm -rf
cd - > /dev/null

# Sign the minimal app
echo -e "${YELLOW}🔏 Signing minimal app...${NC}"

# Sign dylibs first
find "$TEST_APP_PATH" -name "*.dylib" | while read -r dylib; do
    echo -e "${BLUE}🔏 Signing: $(basename "$dylib")${NC}"
    codesign --force --sign "$DEVELOPER_ID" "$dylib"
done

# Sign executables
find "$TEST_APP_PATH" -type f -perm +111 -not -name "*.dylib" | while read -r exe; do
    if file "$exe" | grep -q "Mach-O"; then
        echo -e "${BLUE}🔏 Signing: $(basename "$exe")${NC}"
        codesign --force --sign "$DEVELOPER_ID" "$exe"
    fi
done

# Sign the main app bundle
echo -e "${YELLOW}🔏 Signing main app bundle...${NC}"
codesign --force --sign "$DEVELOPER_ID" --options runtime --entitlements "entitlements.plist" "$TEST_APP_PATH"

# Verify the signature
echo -e "${YELLOW}🔍 Verifying signature...${NC}"
codesign --verify --verbose "$TEST_APP_PATH"

# Test with spctl
echo -e "${YELLOW}🔍 Testing with spctl...${NC}"
spctl --assess --verbose "$TEST_APP_PATH" || echo -e "${YELLOW}⚠️ spctl warnings (may be normal)${NC}"

echo -e "${GREEN}✅ Minimal app signing completed!${NC}"

# Create a ZIP file for notarization
echo -e "${YELLOW}📦 Creating ZIP file for notarization...${NC}"
ZIP_PATH="${APP_NAME}-${APP_VERSION}-minimal-test.zip"
rm -f "$ZIP_PATH"
ditto -c -k --keepParent "$TEST_APP_PATH" "$ZIP_PATH"

echo -e "${YELLOW}📊 ZIP file created: $ZIP_PATH${NC}"
echo -e "${YELLOW}📊 Size: $(du -h "$ZIP_PATH" | cut -f1)${NC}"

# Check if we should proceed with notarization
echo -e "${YELLOW}🤔 Do you want to proceed with notarization? (y/n)${NC}"
read -r response
if [[ "$response" =~ ^[Yy]$ ]]; then
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
    xcrun stapler staple "$TEST_APP_PATH"
    
    # Verify notarization
    echo -e "${YELLOW}🔍 Verifying notarization...${NC}"
    xcrun stapler validate "$TEST_APP_PATH"
    spctl --assess --type execute --verbose "$TEST_APP_PATH"
    
    echo -e "${GREEN}✅ Notarization stapled successfully!${NC}"
else
    echo -e "${YELLOW}⏭️ Skipping notarization for now${NC}"
fi

echo -e "${GREEN}🎉 Minimal notarization test completed!${NC}"
