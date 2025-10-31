#!/bin/bash

# Simple Oasis Browser DMG Creation Script
# This script creates a distributable DMG for the Oasis Browser

set -e

# Configuration
APP_NAME="Oasis Browser"
APP_VERSION="1.2.0"
BUILD_DIR="obj-aarch64-apple-darwin24.6.0/dist"
APP_PATH="$BUILD_DIR/Oasis.app"
DMG_NAME="Oasis-Browser-${APP_VERSION}-$(date +%Y%m%d)"
DMG_PATH="${DMG_NAME}.dmg"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Creating Oasis Browser DMG...${NC}"

# Check if the app exists
if [ ! -d "$APP_PATH" ]; then
    echo -e "${RED}❌ Error: $APP_PATH not found!${NC}"
    echo "Please build the browser first with: ./mach build"
    exit 1
fi

# Check if hdiutil is available
if ! command -v hdiutil &> /dev/null; then
    echo -e "${RED}❌ Error: hdiutil not found!${NC}"
    echo "This script requires macOS with hdiutil."
    exit 1
fi

# Clean up any existing DMG files
echo -e "${YELLOW}🧹 Cleaning up existing DMG files...${NC}"
rm -f "$DMG_PATH"

# Create a temporary directory for DMG contents
TEMP_DIR=$(mktemp -d)
echo -e "${YELLOW}📁 Created temporary directory: $TEMP_DIR${NC}"

# Copy the app to the temporary directory
echo -e "${YELLOW}📋 Copying Oasis Browser to temporary directory...${NC}"
cp -R "$APP_PATH" "$TEMP_DIR/"

# Create a symbolic link to Applications folder
echo -e "${YELLOW}🔗 Creating Applications folder link...${NC}"
ln -s /Applications "$TEMP_DIR/Applications"

# Create a simple README file
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

Version: $APP_VERSION
Build Date: $(date)

For support or questions, please contact the development team.
EOF

# Create the DMG directly (no AppleScript customization)
echo -e "${YELLOW}💾 Creating DMG...${NC}"
hdiutil create -srcfolder "$TEMP_DIR" -volname "Oasis Browser" -fs HFS+ -format UDZO -imagekey zlib-level=9 -o "$DMG_PATH"

# Clean up
echo -e "${YELLOW}🧹 Cleaning up temporary files...${NC}"
rm -rf "$TEMP_DIR"

# Get DMG size
DMG_SIZE=$(du -h "$DMG_PATH" | cut -f1)

echo -e "${GREEN}✅ Success! DMG created: $DMG_PATH${NC}"
echo -e "${GREEN}📦 Size: $DMG_SIZE${NC}"
echo -e "${GREEN}🎉 Your teammate can now download and install Oasis Browser!${NC}"

# Open the DMG to test
echo -e "${YELLOW}🔍 Opening DMG for verification...${NC}"
open "$DMG_PATH"
