#!/bin/bash
# Firefox Oasis Release Script
# Creates a signed and notarized release for distribution

set -e  # Exit on any error

# Configuration - UPDATE THESE VALUES
APP_NAME="Oasis-Browser"
VERSION="1.0.1"  # Release version matching branch
APPLE_ID="adamkershner@rocketmail.com"  # Your Apple ID email
APP_PASSWORD="vgle-lxgg-cyda-czlm"  # App-specific password (already provided)
TEAM_ID="NV6BDYHYA5"  # From certificate
P12_PASSWORD="kzwqlKtl6n!"  # Password for P12 certificate export

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Firefox Oasis Release Process...${NC}"

# Verify we're on the correct branch
CURRENT_BRANCH=$(git branch --show-current)
EXPECTED_BRANCH="release-1.0.1"
if [ "$CURRENT_BRANCH" != "$EXPECTED_BRANCH" ]; then
    echo -e "${YELLOW}⚠️  Warning: Current branch is '${CURRENT_BRANCH}', expected '${EXPECTED_BRANCH}'${NC}"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check required values
if [ -z "$APPLE_ID" ]; then
    echo -e "${RED}❌ Error: APPLE_ID is required. Please edit this script and set your Apple ID email.${NC}"
    exit 1
fi

if [ -z "$P12_PASSWORD" ]; then
    echo -e "${RED}❌ Error: P12_PASSWORD is required. Please edit this script and set the password for exporting the certificate.${NC}"
    exit 1
fi

# Phase 1: Export Certificate (if needed)
if [ ! -f "developer_id.p12" ]; then
    echo -e "${YELLOW}📜 Exporting certificate to P12 file...${NC}"
    CERT_NAME="Developer ID Application: Adam Richard Kershner (NV6BDYHYA5)"
    security export -k ~/Library/Keychains/login.keychain-db \
        -t identities \
        -f pkcs12 \
        -P "$P12_PASSWORD" \
        -o developer_id.p12 \
        "$CERT_NAME"
    
    if [ $? -eq 0 ]; then
        chmod 600 developer_id.p12
        echo -e "${GREEN}✅ Certificate exported${NC}"
    else
        echo -e "${RED}❌ Failed to export certificate${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Certificate file already exists${NC}"
fi

# Create password file
echo "$P12_PASSWORD" > p12_password.txt
chmod 600 p12_password.txt

# Phase 2: Build and Package
echo -e "${YELLOW}📦 Building Firefox (this may take 15-20 minutes)...${NC}"
echo -e "${YELLOW}   Step 2.1: Cleaning build environment...${NC}"
./mach clobber

echo -e "${YELLOW}   Step 2.2: Configuring build (using mozconfig-release)...${NC}"
export MOZCONFIG=mozconfig-release
./mach configure

echo -e "${YELLOW}   Step 2.3: Building Firefox...${NC}"
./mach build

echo -e "${YELLOW}   Step 2.4: Creating package...${NC}"
./mach build package

echo -e "${GREEN}✅ Build complete${NC}"

# Phase 3: Extract App
echo -e "${YELLOW}📂 Extracting app from DMG...${NC}"
# Determine build directory based on architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    BUILD_DIR="obj-aarch64-apple-darwin*"
else
    BUILD_DIR="obj-x86_64-apple-darwin*"
fi

DMG_PATH=$(find ${BUILD_DIR}/dist -name "firefox-*.dmg" | head -1)

if [ -z "$DMG_PATH" ]; then
    echo -e "${RED}❌ Error: Could not find DMG file in ${BUILD_DIR}/dist${NC}"
    exit 1
fi

echo -e "${GREEN}   Found DMG: ${DMG_PATH}${NC}"

# Mount DMG
hdiutil attach "$DMG_PATH" -readonly -noverify -noautoopen > /dev/null 2>&1
MOUNT_POINT="/Volumes/Oasis"

# Copy app
if [ -d "${APP_NAME}-Packaged.app" ]; then
    rm -rf "${APP_NAME}-Packaged.app"
fi
cp -R "$MOUNT_POINT/Oasis.app" "./${APP_NAME}-Packaged.app"

# Unmount DMG
hdiutil detach "$MOUNT_POINT" > /dev/null 2>&1 || true

echo -e "${GREEN}✅ App extracted${NC}"

# Phase 4: Sign
echo -e "${YELLOW}🔐 Signing application...${NC}"
./mach macos-sign \
    --use_rcodesign \
    --rcodesign-p12-file developer_id.p12 \
    --rcodesign-p12-password-file p12_password.txt \
    --entitlements developer \
    --app-path "${APP_NAME}-Packaged.app" \
    --channel release

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Application signed${NC}"
else
    echo -e "${RED}❌ Signing failed${NC}"
    exit 1
fi

# Phase 5: Create ZIP for Notarization
echo -e "${YELLOW}📋 Creating ZIP for notarization...${NC}"
ZIP_FILE="${APP_NAME}-Signed.zip"
if [ -f "$ZIP_FILE" ]; then
    rm "$ZIP_FILE"
fi
ditto -c -k --keepParent "${APP_NAME}-Packaged.app" "$ZIP_FILE"
echo -e "${GREEN}✅ ZIP created: $ZIP_FILE${NC}"

# Phase 6: Submit for Notarization
echo -e "${YELLOW}📤 Submitting for notarization...${NC}"
xcrun notarytool submit "$ZIP_FILE" \
    --apple-id "$APPLE_ID" \
    --password "$APP_PASSWORD" \
    --team-id "$TEAM_ID" \
    --wait

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Notarization successful${NC}"
else
    echo -e "${RED}❌ Notarization failed${NC}"
    exit 1
fi

# Phase 7: Staple
echo -e "${YELLOW}📎 Stapling notarization...${NC}"
xcrun stapler staple "${APP_NAME}-Packaged.app"
xcrun stapler validate "${APP_NAME}-Packaged.app"
echo -e "${GREEN}✅ Notarization stapled${NC}"

# Phase 8: Create Distribution DMG
echo -e "${YELLOW}📦 Creating distribution DMG...${NC}"
DMG_OUTPUT="${APP_NAME}-v${VERSION}-Distribution.dmg"
if [ -f "$DMG_OUTPUT" ]; then
    rm "$DMG_OUTPUT"
fi

hdiutil create -srcfolder "${APP_NAME}-Packaged.app" \
    -volname "${APP_NAME} v${VERSION}" \
    -format UDZO \
    -imagekey zlib-level=9 \
    -o "$DMG_OUTPUT"

echo -e "${GREEN}✅ Distribution DMG created: $DMG_OUTPUT${NC}"

# Phase 9: Verify
echo -e "${YELLOW}🔍 Verifying final app...${NC}"
codesign --verify --deep --strict --verbose=2 "${APP_NAME}-Packaged.app"
spctl --assess --verbose "${APP_NAME}-Packaged.app"

echo -e "${GREEN}✅ Verification complete${NC}"

# Cleanup sensitive files
echo -e "${YELLOW}🧹 Cleaning up sensitive files...${NC}"
rm -f p12_password.txt

echo -e "${GREEN}🎉 Release process complete!${NC}"
echo -e "${GREEN}📦 Distribution DMG: $DMG_OUTPUT${NC}"
