#!/bin/bash

# Oasis Browser Code Signing Script
# This script signs all components of the Oasis Browser app for notarization

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

echo -e "${BLUE}🔐 Oasis Browser Code Signing Script${NC}"
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
    
    if [ -f "$file" ] || [ -d "$file" ]; then
        echo -e "${BLUE}🔏 Signing: $description${NC}"
        codesign --force --sign "$CERTIFICATE" \
            --options runtime --timestamp \
            "$file"
        echo -e "${GREEN}✅ Signed: $description${NC}"
    else
        echo -e "${YELLOW}⚠️  Skipped: $description (not found)${NC}"
    fi
}

# Function to sign all files in a directory
sign_directory() {
    local dir="$1"
    local description="$2"
    
    if [ -d "$dir" ]; then
        echo -e "${BLUE}🔏 Signing all files in: $description${NC}"
        find "$dir" -type f -perm +111 -exec codesign --force --sign "$CERTIFICATE" \
            --options runtime --timestamp {} \;
        echo -e "${GREEN}✅ Signed all files in: $description${NC}"
    else
        echo -e "${YELLOW}⚠️  Skipped: $description (directory not found)${NC}"
    fi
}

echo -e "${BLUE}🚀 Starting signing process...${NC}"
echo ""

# Step 1: Sign individual executables in MacOS
echo -e "${YELLOW}📋 Step 1: Signing MacOS executables${NC}"
sign_file "$APP_PATH/Contents/MacOS/firefox" "Main Firefox executable"
sign_file "$APP_PATH/Contents/MacOS/http3server" "HTTP3 Server"
sign_file "$APP_PATH/Contents/MacOS/xpcshell" "XPCShell"
sign_file "$APP_PATH/Contents/MacOS/certutil" "CertUtil"
sign_file "$APP_PATH/Contents/MacOS/ssltunnel" "SSL Tunnel"
sign_file "$APP_PATH/Contents/MacOS/pk12util" "PK12Util"
sign_file "$APP_PATH/Contents/MacOS/crashhelper" "Crash Helper"
sign_file "$APP_PATH/Contents/MacOS/pingsender" "Ping Sender"
sign_file "$APP_PATH/Contents/MacOS/nmhproxy" "NMH Proxy"

echo ""

# Step 2: Sign nested app bundles first (deepest first)
echo -e "${YELLOW}📋 Step 2: Signing nested app bundles${NC}"

# Sign executables inside nested app bundles first
if [ -d "$APP_PATH/Contents/MacOS/callback_app.app" ]; then
    echo -e "${BLUE}🔏 Signing callback_app.app contents${NC}"
    find "$APP_PATH/Contents/MacOS/callback_app.app" -type f -perm +111 -exec codesign --force --sign "$CERTIFICATE" --options runtime --timestamp {} \;
    codesign --force --sign "$CERTIFICATE" --options runtime --timestamp "$APP_PATH/Contents/MacOS/callback_app.app"
    echo -e "${GREEN}✅ Signed callback_app.app${NC}"
fi

if [ -d "$APP_PATH/Contents/MacOS/crashreporter.app" ]; then
    echo -e "${BLUE}🔏 Signing crashreporter.app contents${NC}"
    find "$APP_PATH/Contents/MacOS/crashreporter.app" -type f -perm +111 -exec codesign --force --sign "$CERTIFICATE" --options runtime --timestamp {} \;
    codesign --force --sign "$CERTIFICATE" --options runtime --timestamp "$APP_PATH/Contents/MacOS/crashreporter.app"
    echo -e "${GREEN}✅ Signed crashreporter.app${NC}"
fi

if [ -d "$APP_PATH/Contents/MacOS/plugin-container.app" ]; then
    echo -e "${BLUE}🔏 Signing plugin-container.app contents${NC}"
    find "$APP_PATH/Contents/MacOS/plugin-container.app" -type f -perm +111 -exec codesign --force --sign "$CERTIFICATE" --options runtime --timestamp {} \;
    codesign --force --sign "$CERTIFICATE" --options runtime --timestamp "$APP_PATH/Contents/MacOS/plugin-container.app"
    echo -e "${GREEN}✅ Signed plugin-container.app${NC}"
fi

if [ -d "$APP_PATH/Contents/MacOS/updater.app" ]; then
    echo -e "${BLUE}🔏 Signing updater.app contents${NC}"
    find "$APP_PATH/Contents/MacOS/updater.app" -type f -perm +111 -exec codesign --force --sign "$CERTIFICATE" --options runtime --timestamp {} \;
    codesign --force --sign "$CERTIFICATE" --options runtime --timestamp "$APP_PATH/Contents/MacOS/updater.app"
    echo -e "${GREEN}✅ Signed updater.app${NC}"
fi

if [ -d "$APP_PATH/Contents/MacOS/media-plugin-helper.app" ]; then
    echo -e "${BLUE}🔏 Signing media-plugin-helper.app contents${NC}"
    find "$APP_PATH/Contents/MacOS/media-plugin-helper.app" -type f -perm +111 -exec codesign --force --sign "$CERTIFICATE" --options runtime --timestamp {} \;
    codesign --force --sign "$CERTIFICATE" --options runtime --timestamp "$APP_PATH/Contents/MacOS/media-plugin-helper.app"
    echo -e "${GREEN}✅ Signed media-plugin-helper.app${NC}"
fi

echo ""

# Step 3: Sign all executables in Resources
echo -e "${YELLOW}📋 Step 3: Signing Resources executables${NC}"
sign_directory "$APP_PATH/Contents/Resources" "Resources directory"

echo ""

# Step 4: Sign all .dylib files that aren't already signed
echo -e "${YELLOW}📋 Step 4: Signing remaining libraries${NC}"
find "$APP_PATH" -name "*.dylib" -exec sh -c '
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

# Step 5: Sign the main app bundle with entitlements
echo -e "${YELLOW}📋 Step 5: Signing main app bundle with entitlements${NC}"
echo -e "${BLUE}🔏 Signing main app bundle...${NC}"
codesign --force --deep --sign "$CERTIFICATE" \
    --options runtime --timestamp \
    --entitlements "$ENTITLEMENTS" \
    "$APP_PATH"

echo -e "${GREEN}✅ Signed main app bundle with entitlements${NC}"
echo ""

# Step 6: Verify signing
echo -e "${YELLOW}📋 Step 6: Verifying signatures${NC}"
echo -e "${BLUE}🔍 Verifying main app bundle...${NC}"

if codesign -vvv --deep --strict "$APP_PATH" 2>&1; then
    echo -e "${GREEN}✅ App bundle verification successful!${NC}"
else
    echo -e "${RED}❌ App bundle verification failed!${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 Code signing completed successfully!${NC}"
echo -e "${BLUE}📱 Your app is now ready for notarization.${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Create a zip file: ditto -c -k --keepParent \"$APP_PATH\" \"Oasis-Browser-$(date +%Y%m%d).zip\""
echo "2. Submit for notarization using notarytool"
echo "3. Staple the ticket after successful notarization"
