#!/bin/bash

# Oasis Browser Complete Signing Script
# Signs ALL individual files first, then bundles

set -e  # Exit on any error

# Configuration
APP_PATH="./obj-aarch64-apple-darwin24.6.0/dist/Oasis-Mozilla-Signed.app"
CERTIFICATE="Developer ID Application: Adam Richard Kershner (NV6BDYHYA5)"
ENTITLEMENTS="./entitlements.plist"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔐 Oasis Browser Complete Signing Script${NC}"
echo "================================================"

# Check if app exists
if [ ! -d "$APP_PATH" ]; then
    echo -e "${RED}❌ Error: App bundle not found at $APP_PATH${NC}"
    exit 1
fi

# Check if entitlements file exists
if [ ! -f "$ENTITLEMENTS" ]; then
    echo -e "${RED}❌ Error: Entitlements file not found at $ENTITLEMENTS${NC}"
    exit 1
fi

echo -e "${YELLOW}📱 App Path: $APP_PATH${NC}"
echo -e "${YELLOW}🔑 Certificate: $CERTIFICATE${NC}"
echo -e "${YELLOW}📄 Entitlements: $ENTITLEMENTS${NC}"
echo ""

# Function to sign a single file
sign_file() {
    local file="$1"
    local description="$2"
    
    if [ -f "$file" ]; then
        echo -e "${BLUE}🔏 Signing: $description${NC}"
        codesign --force --sign "$CERTIFICATE" \
            --options runtime --timestamp \
            "$file"
        echo -e "${GREEN}✅ Signed: $description${NC}"
    else
        echo -e "${YELLOW}⚠️  Skipped: $description (not found)${NC}"
    fi
}

echo -e "${BLUE}🚀 Starting complete signing process...${NC}"
echo ""

# Phase 1: Sign ALL individual executable files first
echo -e "${YELLOW}📋 Phase 1: Signing ALL individual executable files${NC}"

# Get all executable files and sign them
find "$APP_PATH" -type f -perm +111 -exec sh -c '
    file="$1"
    if ! codesign -dvv "$file" 2>&1 | grep -q "not signed"; then
        echo -e "${GREEN}✅ Already signed: $file${NC}"
    else
        echo -e "${BLUE}🔏 Signing: $file${NC}"
        codesign --force --sign "'"$CERTIFICATE"'" --options runtime --timestamp "$file"
        echo -e "${GREEN}✅ Signed: $file${NC}"
    fi
' _ {} \;

echo ""

# Phase 2: Sign app bundles (from deepest to shallowest)
echo -e "${YELLOW}📋 Phase 2: Signing app bundles${NC}"

# Sign nested app bundles first
if [ -d "$APP_PATH/Contents/MacOS/callback_app.app" ]; then
    echo -e "${BLUE}🔏 Signing callback_app.app bundle${NC}"
    codesign --force --sign "$CERTIFICATE" --options runtime --timestamp "$APP_PATH/Contents/MacOS/callback_app.app"
    echo -e "${GREEN}✅ Signed callback_app.app bundle${NC}"
fi

if [ -d "$APP_PATH/Contents/MacOS/crashreporter.app" ]; then
    echo -e "${BLUE}🔏 Signing crashreporter.app bundle${NC}"
    codesign --force --sign "$CERTIFICATE" --options runtime --timestamp "$APP_PATH/Contents/MacOS/crashreporter.app"
    echo -e "${GREEN}✅ Signed crashreporter.app bundle${NC}"
fi

if [ -d "$APP_PATH/Contents/MacOS/plugin-container.app" ]; then
    echo -e "${BLUE}🔏 Signing plugin-container.app bundle${NC}"
    codesign --force --sign "$CERTIFICATE" --options runtime --timestamp "$APP_PATH/Contents/MacOS/plugin-container.app"
    echo -e "${GREEN}✅ Signed plugin-container.app bundle${NC}"
fi

if [ -d "$APP_PATH/Contents/MacOS/updater.app" ]; then
    echo -e "${BLUE}🔏 Signing updater.app bundle${NC}"
    codesign --force --sign "$CERTIFICATE" --options runtime --timestamp "$APP_PATH/Contents/MacOS/updater.app"
    echo -e "${GREEN}✅ Signed updater.app bundle${NC}"
fi

if [ -d "$APP_PATH/Contents/MacOS/media-plugin-helper.app" ]; then
    echo -e "${BLUE}🔏 Signing media-plugin-helper.app bundle${NC}"
    codesign --force --sign "$CERTIFICATE" --options runtime --timestamp "$APP_PATH/Contents/MacOS/media-plugin-helper.app"
    echo -e "${GREEN}✅ Signed media-plugin-helper.app bundle${NC}"
fi

echo ""

# Phase 3: Sign the main app bundle with entitlements
echo -e "${YELLOW}📋 Phase 3: Signing main app bundle with entitlements${NC}"
echo -e "${BLUE}🔏 Signing main app bundle...${NC}"
codesign --force --deep --sign "$CERTIFICATE" \
    --options runtime --timestamp \
    --entitlements "$ENTITLEMENTS" \
    "$APP_PATH"

echo -e "${GREEN}✅ Signed main app bundle with entitlements${NC}"
echo ""

# Final Verification
echo -e "${YELLOW}📋 Final Verification${NC}"
echo -e "${BLUE}🔍 Verifying complete app bundle...${NC}"

if codesign -vvv --deep --strict "$APP_PATH" 2>&1; then
    echo -e "${GREEN}✅ App bundle verification successful!${NC}"
    echo ""
    echo -e "${GREEN}🎉 Code signing completed successfully!${NC}"
    echo -e "${BLUE}📱 Your app is now ready for notarization.${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. Create a zip file: ditto -c -k --keepParent \"$APP_PATH\" \"Oasis-Browser-$(date +%Y%m%d).zip\""
    echo "2. Submit for notarization using notarytool"
    echo "3. Staple the ticket after successful notarization"
else
    echo -e "${RED}❌ App bundle verification failed!${NC}"
    echo -e "${YELLOW}Check the output above for specific errors.${NC}"
    exit 1
fi
