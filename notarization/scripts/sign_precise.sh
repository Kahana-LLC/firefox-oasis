#!/bin/bash

# Oasis Browser Precise Signing Script
# Follows exact order from SIGNING_ORDER.md

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

echo -e "${BLUE}🔐 Oasis Browser Precise Signing Script${NC}"
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
    local phase="$3"
    
    if [ -f "$file" ] || [ -d "$file" ]; then
        echo -e "${BLUE}🔏 Phase $phase: $description${NC}"
        codesign --force --sign "$CERTIFICATE" \
            --options runtime --timestamp \
            "$file"
        echo -e "${GREEN}✅ Signed: $description${NC}"
    else
        echo -e "${YELLOW}⚠️  Skipped: $description (not found)${NC}"
    fi
}

echo -e "${BLUE}🚀 Starting precise signing process...${NC}"
echo ""

# Phase 1: Deepest Nested Components First
echo -e "${YELLOW}📋 Phase 1: Deepest Nested Components${NC}"
sign_file "$APP_PATH/Contents/MacOS/callback_app.app/Contents/MacOS/TestAUSHelper" "TestAUSHelper" "1.1"
sign_file "$APP_PATH/Contents/MacOS/callback_app.app" "Callback App Bundle" "1.2"

echo ""

# Phase 2: MacOS Executables (sign all individual files first)
echo -e "${YELLOW}📋 Phase 2: MacOS Executables${NC}"
sign_file "$APP_PATH/Contents/MacOS/certutil" "CertUtil" "2.1"
sign_file "$APP_PATH/Contents/MacOS/http3server" "HTTP3 Server" "2.2"
sign_file "$APP_PATH/Contents/MacOS/xpcshell" "XPCShell" "2.3"
sign_file "$APP_PATH/Contents/MacOS/pk12util" "PK12Util" "2.4"
sign_file "$APP_PATH/Contents/MacOS/ssltunnel" "SSL Tunnel" "2.5"
sign_file "$APP_PATH/Contents/MacOS/firefox" "Main Firefox Launcher (CRITICAL)" "2.6"

echo ""

# Phase 3: Test Libraries (MacOS)
echo -e "${YELLOW}📋 Phase 3: Test Libraries (MacOS)${NC}"
sign_file "$APP_PATH/Contents/MacOS/gtest/libxul_broken_buildid.dylib" "libxul_broken_buildid.dylib" "3.1"
sign_file "$APP_PATH/Contents/MacOS/gtest/libxul_correct_buildid.dylib" "libxul_correct_buildid.dylib" "3.2"
sign_file "$APP_PATH/Contents/MacOS/gtest/libxul_missing_buildid.dylib" "libxul_missing_buildid.dylib" "3.3"

echo ""

# Phase 4: Resources Executables
echo -e "${YELLOW}📋 Phase 4: Resources Executables${NC}"
sign_file "$APP_PATH/Contents/Resources/BadCertAndPinningServer" "BadCertAndPinningServer" "4.1"
sign_file "$APP_PATH/Contents/Resources/ChannelPrefs" "ChannelPrefs" "4.2"
sign_file "$APP_PATH/Contents/Resources/crashreporter" "CrashReporter" "4.3"
sign_file "$APP_PATH/Contents/Resources/DelegatedCredentialsServer" "DelegatedCredentialsServer" "4.4"
sign_file "$APP_PATH/Contents/Resources/EncryptedClientHelloServer" "EncryptedClientHelloServer" "4.5"
sign_file "$APP_PATH/Contents/Resources/FaultyServer" "FaultyServer" "4.6"
sign_file "$APP_PATH/Contents/Resources/firefox" "Firefox (Resources)" "4.7"
sign_file "$APP_PATH/Contents/Resources/firefox-bin" "Firefox Binary" "4.8"
sign_file "$APP_PATH/Contents/Resources/GenerateOCSPResponse" "GenerateOCSPResponse" "4.9"
sign_file "$APP_PATH/Contents/Resources/logalloc-replay" "LogAlloc Replay" "4.10"
sign_file "$APP_PATH/Contents/Resources/nsinstall" "NSInstall" "4.11"
sign_file "$APP_PATH/Contents/Resources/OCSPStaplingServer" "OCSPStaplingServer" "4.12"
sign_file "$APP_PATH/Contents/Resources/org.mozilla.updater" "Org Mozilla Updater" "4.13"
sign_file "$APP_PATH/Contents/Resources/plugin-container" "Plugin Container" "4.14"
sign_file "$APP_PATH/Contents/Resources/SanctionsTestServer" "SanctionsTestServer" "4.15"
sign_file "$APP_PATH/Contents/Resources/signmar" "SignMar" "4.16"
sign_file "$APP_PATH/Contents/Resources/UpdateSettings" "UpdateSettings" "4.17"
sign_file "$APP_PATH/Contents/Resources/zucchini" "Zucchini" "4.18"
sign_file "$APP_PATH/Contents/Resources/zucchini-gtest" "Zucchini GTest" "4.19"

echo ""

# Phase 5: Resources Libraries
echo -e "${YELLOW}📋 Phase 5: Resources Libraries${NC}"
sign_file "$APP_PATH/Contents/Resources/gmp-fake/1.0/libfake.dylib" "libfake.dylib" "5.1"
sign_file "$APP_PATH/Contents/Resources/gmp-fakeopenh264/1.0/libfakeopenh264.dylib" "libfakeopenh264.dylib" "5.2"
sign_file "$APP_PATH/Contents/Resources/libfreebl3.dylib" "libfreebl3.dylib" "5.3"
sign_file "$APP_PATH/Contents/Resources/libgkcodecs.dylib" "libgkcodecs.dylib" "5.4"
sign_file "$APP_PATH/Contents/Resources/liblgpllibs.dylib" "liblgpllibs.dylib" "5.5"
sign_file "$APP_PATH/Contents/Resources/libmozavcodec.dylib" "libmozavcodec.dylib" "5.6"
sign_file "$APP_PATH/Contents/Resources/libmozavutil.dylib" "libmozavutil.dylib" "5.7"
sign_file "$APP_PATH/Contents/Resources/libmozglue.dylib" "libmozglue.dylib" "5.8"
sign_file "$APP_PATH/Contents/Resources/libmozinference.dylib" "libmozinference.dylib" "5.9"
sign_file "$APP_PATH/Contents/Resources/libnss3.dylib" "libnss3.dylib" "5.10"
sign_file "$APP_PATH/Contents/Resources/libonnxruntime.dylib" "libonnxruntime.dylib" "5.11"
sign_file "$APP_PATH/Contents/Resources/libsoftokn3.dylib" "libsoftokn3.dylib" "5.12"

echo ""

# Phase 6: Final App Bundle
echo -e "${YELLOW}📋 Phase 6: Final App Bundle (with entitlements)${NC}"
echo -e "${BLUE}🔏 Signing main app bundle with entitlements...${NC}"
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
