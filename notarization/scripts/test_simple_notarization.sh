#!/bin/bash

# Test Simple Notarization - Create a minimal test app
# This creates a simple test app to verify notarization works

set -e

# Configuration
APP_NAME="Oasis Browser Test"
APP_VERSION="1.0.0"
TEST_APP_PATH="Oasis-Test-Simple.app"

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

echo -e "${GREEN}🧪 Testing Simple Notarization with Minimal App...${NC}"

# Clean up any existing test app
rm -rf "$TEST_APP_PATH"

# Create a minimal test app structure
echo -e "${YELLOW}📋 Creating minimal test app structure...${NC}"
mkdir -p "$TEST_APP_PATH/Contents/MacOS"
mkdir -p "$TEST_APP_PATH/Contents/Resources"

# Create a simple Info.plist
cat > "$TEST_APP_PATH/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>oasis-test</string>
    <key>CFBundleIdentifier</key>
    <string>com.oasis.browser.test</string>
    <key>CFBundleName</key>
    <string>Oasis Browser Test</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleSignature</key>
    <string>????</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.15</string>
</dict>
</plist>
EOF

# Create a simple executable (just a shell script that opens Firefox)
cat > "$TEST_APP_PATH/Contents/MacOS/oasis-test" << 'EOF'
#!/bin/bash
# Simple test executable that opens the real Firefox
echo "Oasis Browser Test App"
echo "This is a test app to verify notarization works."
echo "Opening the real Oasis Browser..."

# Try to open the real Oasis Browser if it exists
if [ -d "/Applications/Oasis Browser.app" ]; then
    open "/Applications/Oasis Browser.app"
elif [ -d "obj-aarch64-apple-darwin24.6.0/dist/Oasis.app" ]; then
    open "obj-aarch64-apple-darwin24.6.0/dist/Oasis.app"
else
    echo "Oasis Browser not found. This is just a test app."
    osascript -e 'display dialog "This is a test app to verify notarization works. The real Oasis Browser is not installed." buttons {"OK"} default button "OK"'
fi
EOF

# Make the executable
chmod +x "$TEST_APP_PATH/Contents/MacOS/oasis-test"

# Sign the executable
echo -e "${YELLOW}🔏 Signing test executable...${NC}"
codesign --force --sign "$DEVELOPER_ID" "$TEST_APP_PATH/Contents/MacOS/oasis-test"

# Sign the app bundle
echo -e "${YELLOW}🔏 Signing test app bundle...${NC}"
codesign --force --sign "$DEVELOPER_ID" --options runtime --entitlements "entitlements.plist" "$TEST_APP_PATH"

# Verify the signature
echo -e "${YELLOW}🔍 Verifying signature...${NC}"
codesign --verify --verbose "$TEST_APP_PATH"

# Test with spctl
echo -e "${YELLOW}🔍 Testing with spctl...${NC}"
spctl --assess --verbose "$TEST_APP_PATH" || echo -e "${YELLOW}⚠️ spctl warnings (may be normal)${NC}"

echo -e "${GREEN}✅ Simple test app signing completed!${NC}"

# Create a ZIP file for notarization
echo -e "${YELLOW}📦 Creating ZIP file for notarization...${NC}"
ZIP_PATH="${APP_NAME}-${APP_VERSION}-simple-test.zip"
rm -f "$ZIP_PATH"
ditto -c -k --keepParent "$TEST_APP_PATH" "$ZIP_PATH"

echo -e "${YELLOW}📊 ZIP file created: $ZIP_PATH${NC}"
echo -e "${YELLOW}📊 Size: $(du -h "$ZIP_PATH" | cut -f1)${NC}"

# Test the app
echo -e "${YELLOW}🧪 Testing the app...${NC}"
open "$TEST_APP_PATH"

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
    
    # Test the notarized app
    echo -e "${YELLOW}🧪 Testing notarized app...${NC}"
    open "$TEST_APP_PATH"
    
else
    echo -e "${YELLOW}⏭️ Skipping notarization for now${NC}"
fi

echo -e "${GREEN}🎉 Simple notarization test completed!${NC}"
echo -e "${BLUE}💡 If this works, we know notarization is possible and the issue is with Firefox's complexity${NC}"
