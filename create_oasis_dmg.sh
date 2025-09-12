#!/bin/bash

# Oasis Browser DMG Creation Script
# This script creates a distributable DMG for the Oasis Browser

set -e

# Configuration
APP_NAME="Oasis Browser"
APP_VERSION="1.2.0"
BUILD_DIR="obj-aarch64-apple-darwin24.6.0/dist"
APP_PATH="$BUILD_DIR/Oasis.app"
DMG_NAME="Oasis-Browser-${APP_VERSION}-$(date +%Y%m%d)"
DMG_PATH="${DMG_NAME}.dmg"
TEMP_DMG="temp_${DMG_NAME}.dmg"
VOLUME_NAME="Oasis Browser"

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
rm -f "$DMG_PATH" "$TEMP_DMG"

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

# Create the DMG
echo -e "${YELLOW}💾 Creating DMG...${NC}"
hdiutil create -srcfolder "$TEMP_DIR" -volname "$VOLUME_NAME" -fs HFS+ -fsargs "-c c=64,a=16,e=16" -format UDRW -size 1g "$TEMP_DMG"

# Mount the DMG
echo -e "${YELLOW}🔌 Mounting DMG for customization...${NC}"
MOUNT_DIR=$(hdiutil attach -readwrite -noverify -noautoopen "$TEMP_DMG" | egrep '^/dev/' | sed 1q | awk '{print $3}')

# Wait a moment for the mount to complete
sleep 2

# Set the volume icon (if we had one)
# echo -e "${YELLOW}🎨 Setting volume icon...${NC}"
# cp "path/to/icon.icns" "$MOUNT_DIR/.VolumeIcon.icns"
# SetFile -c icnC "$MOUNT_DIR/.VolumeIcon.icns"
# SetFile -a C "$MOUNT_DIR"

# Set the background (optional)
# echo -e "${YELLOW}🖼️ Setting background...${NC}"
# mkdir -p "$MOUNT_DIR/.background"
# cp "path/to/background.png" "$MOUNT_DIR/.background/"

# Configure the view options
echo -e "${YELLOW}⚙️ Configuring DMG view...${NC}"
echo '
   tell application "Finder"
     tell disk "'$VOLUME_NAME'"
           open
           set current view of container window to icon view
           set toolbar visible of container window to false
           set statusbar visible of container window to false
           set the bounds of container window to {400, 100, 900, 450}
           set theViewOptions to the icon view options of container window
           set arrangement of theViewOptions to not arranged
           set icon size of theViewOptions to 128
           # set background picture of theViewOptions to file ".background:background.png"
           try
               make new alias file at container window to POSIX file "/Applications" with properties {name:"Applications"}
           on error
               -- Applications alias already exists, skip
           end try
           set position of item "Oasis Browser.app" of container window to {150, 200}
           set position of item "Applications" of container window to {350, 200}
           set position of item "README.txt" of container window to {550, 200}
           close
           open
           update without registering applications
           delay 5
           close
     end tell
   end tell
' | osascript

# Unmount the DMG
echo -e "${YELLOW}🔓 Unmounting DMG...${NC}"
hdiutil detach "$MOUNT_DIR"

# Convert to final compressed DMG
echo -e "${YELLOW}🗜️ Compressing DMG...${NC}"
hdiutil convert "$TEMP_DMG" -format UDZO -imagekey zlib-level=9 -o "$DMG_PATH"

# Clean up
echo -e "${YELLOW}🧹 Cleaning up temporary files...${NC}"
rm -f "$TEMP_DMG"
rm -rf "$TEMP_DIR"

# Get DMG size
DMG_SIZE=$(du -h "$DMG_PATH" | cut -f1)

echo -e "${GREEN}✅ Success! DMG created: $DMG_PATH${NC}"
echo -e "${GREEN}📦 Size: $DMG_SIZE${NC}"
echo -e "${GREEN}🎉 Your teammate can now download and install Oasis Browser!${NC}"

# Optional: Open the DMG to test
echo -e "${YELLOW}🔍 Opening DMG for verification...${NC}"
open "$DMG_PATH"
