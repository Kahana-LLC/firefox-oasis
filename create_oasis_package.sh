#!/bin/bash

# Create DMG and ZIP packages for Firefox Oasis build
# This script creates professional packages with proper branding

set -e

# Configuration
APP_NAME="Oasis"
BRAND_NAME="Oasis Browser"
VERSION="1.0.0"
BUILD_DATE=$(date +%Y%m%d)
DMG_NAME="Oasis-Browser-${VERSION}-${BUILD_DATE}.dmg"
ZIP_NAME="Oasis-Browser-${VERSION}-${BUILD_DATE}.zip"
APP_PATH="obj-x86_64-apple-darwin22.6.0/dist/Oasis.app"
TEMP_DIR="temp_oasis_dmg"
MOUNT_POINT="/Volumes/Oasis Browser"

echo "🚀 Creating packages for $BRAND_NAME v$VERSION..."

# Check if the app exists
if [ ! -d "$APP_PATH" ]; then
    echo "❌ Error: $APP_PATH not found!"
    echo "💡 Make sure the Oasis build has completed successfully."
    exit 1
fi

# Create temporary directory
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

# Copy the app to temp directory
echo "📦 Copying $BRAND_NAME to temporary directory..."
cp -R "$APP_PATH" "$TEMP_DIR/"

# Create Applications symlink
echo "🔗 Creating Applications symlink..."
ln -s /Applications "$TEMP_DIR/Applications"

# Create a background image for the DMG (optional)
echo "🎨 Creating DMG background..."
mkdir -p "$TEMP_DIR/.background"

# Create a simple background image with Oasis branding
cat > "$TEMP_DIR/.background/background.svg" << 'EOF'
<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="300" fill="#f8f9fa"/>
  <text x="200" y="150" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#333">
    Drag Oasis to Applications to install
  </text>
  <text x="200" y="180" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#666">
    Oasis Browser - A fast, reliable, and private web browser
  </text>
</svg>
EOF

# Create README file
echo "📝 Creating README file..."
cat > "$TEMP_DIR/README.txt" << 'EOF'
Oasis Browser

A fast, reliable, and private web browser based on Firefox.

Installation:
1. Extract this ZIP file or mount the DMG
2. Drag "Oasis.app" to your Applications folder
3. Launch Oasis Browser from Applications

Features:
- Fast and secure browsing
- Privacy-focused design
- Based on Firefox technology
- Custom Oasis branding

Build Date: $(date)
Version: 1.0.0

Note: This is a development build and may be unstable.
Use at your own risk.
EOF

# Create DMG
echo "🔨 Creating DMG file: $DMG_NAME"
hdiutil create -volname "$BRAND_NAME" -srcfolder "$TEMP_DIR" -ov -format UDZO "$DMG_NAME"

# Create ZIP file
echo "🗜️  Creating ZIP file: $ZIP_NAME"
cd "$TEMP_DIR"
zip -r "../$ZIP_NAME" . -x "*.DS_Store"
cd ..

# Clean up
echo "🧹 Cleaning up temporary files..."
rm -rf "$TEMP_DIR"

# Get package info
DMG_SIZE=$(du -h "$DMG_NAME" | cut -f1)
DMG_BYTES=$(stat -f%z "$DMG_NAME")
ZIP_SIZE=$(du -h "$ZIP_NAME" | cut -f1)
ZIP_BYTES=$(stat -f%z "$ZIP_NAME")

echo ""
echo "✅ Packages created successfully!"
echo "📦 DMG Package: $DMG_NAME"
echo "📏 DMG Size: $DMG_SIZE ($DMG_BYTES bytes)"
echo "📦 ZIP Package: $ZIP_NAME"
echo "📏 ZIP Size: $ZIP_SIZE ($ZIP_BYTES bytes)"
echo "🏷️  Version: $VERSION"
echo "📅 Build Date: $BUILD_DATE"
echo ""
echo "🎯 Distribution ready! Users can:"
echo "   DMG: Double-click to mount, then drag Oasis to Applications"
echo "   ZIP: Extract and drag Oasis.app to Applications"
echo ""
echo "💡 Package comparison:"
echo "   DMG: Native macOS experience, larger file size"
echo "   ZIP: Cross-platform, smaller file size, easier distribution"
echo ""
echo "🔧 Next steps:"
echo "   - Test both packages on a clean system"
echo "   - Create a code signing certificate for production"
echo "   - Set up automated builds and packaging"
