#!/bin/bash

# Script to convert kahana_logo.svg to all required icon formats
# This script generates:
# - New tab page logos (about-logo.png, about-logo@2x.png)
# - Tab icons (default16.png, default32.png, default48.png, default64.png, default128.png)
# - macOS dock icon (firefox.icns)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SVG_FILE="$SCRIPT_DIR/kahana_logo.svg"
OUTPUT_DIR="$SCRIPT_DIR"

# Check if SVG file exists
if [ ! -f "$SVG_FILE" ]; then
    echo "Error: $SVG_FILE not found!"
    exit 1
fi

# Check for required tools
if command -v rsvg-convert &> /dev/null; then
    CONVERT_CMD="rsvg-convert"
elif command -v magick &> /dev/null; then
    CONVERT_CMD="magick"
elif command -v convert &> /dev/null; then
    CONVERT_CMD="convert"
else
    echo "Error: Neither rsvg-convert nor ImageMagick found!"
    echo "Install with: brew install librsvg (for rsvg-convert) or brew install imagemagick (for magick)"
    exit 1
fi

echo "Converting kahana_logo.svg to required formats..."
echo "Using: $CONVERT_CMD"

# Function to convert SVG to PNG
convert_svg_to_png() {
    local size=$1
    local output=$2
    
    if [ "$CONVERT_CMD" = "rsvg-convert" ]; then
        rsvg-convert -w $size -h $size "$SVG_FILE" -o "$output"
    elif [ "$CONVERT_CMD" = "magick" ]; then
        magick "$SVG_FILE" -background none -resize "${size}x${size}" "$output"
    else
        convert "$SVG_FILE" -background none -resize "${size}x${size}" "$output"
    fi
}

# 1. New tab page logos
echo "Creating new tab page logos..."
convert_svg_to_png 64 "$OUTPUT_DIR/content/about-logo.png"
convert_svg_to_png 128 "$OUTPUT_DIR/content/about-logo@2x.png"
# Also create SVG version for new tab page
cp "$SVG_FILE" "$OUTPUT_DIR/content/about-logo.svg"

# 2. Tab icons (favicons)
echo "Creating tab icons..."
convert_svg_to_png 16 "$OUTPUT_DIR/default16.png"
convert_svg_to_png 32 "$OUTPUT_DIR/default32.png"
convert_svg_to_png 48 "$OUTPUT_DIR/default48.png"
convert_svg_to_png 64 "$OUTPUT_DIR/default64.png"
convert_svg_to_png 128 "$OUTPUT_DIR/default128.png"

# 3. macOS dock icon (.icns)
echo "Creating macOS dock icon..."
ICONSET_DIR="$OUTPUT_DIR/firefox.iconset"
rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"

# Create all required icon sizes for .icns
convert_svg_to_png 16 "$ICONSET_DIR/icon_16x16.png"
convert_svg_to_png 32 "$ICONSET_DIR/icon_16x16@2x.png"
convert_svg_to_png 32 "$ICONSET_DIR/icon_32x32.png"
convert_svg_to_png 64 "$ICONSET_DIR/icon_32x32@2x.png"
convert_svg_to_png 128 "$ICONSET_DIR/icon_128x128.png"
convert_svg_to_png 256 "$ICONSET_DIR/icon_128x128@2x.png"
convert_svg_to_png 256 "$ICONSET_DIR/icon_256x256.png"
convert_svg_to_png 512 "$ICONSET_DIR/icon_256x256@2x.png"
convert_svg_to_png 512 "$ICONSET_DIR/icon_512x512.png"
convert_svg_to_png 1024 "$ICONSET_DIR/icon_512x512@2x.png"

# Convert iconset to .icns
if command -v iconutil &> /dev/null; then
    iconutil -c icns "$ICONSET_DIR" -o "$OUTPUT_DIR/firefox.icns"
    rm -rf "$ICONSET_DIR"
    echo "Created firefox.icns successfully!"
else
    echo "Warning: iconutil not found. .icns file not created."
    echo "You can create it manually with: iconutil -c icns $ICONSET_DIR"
fi

# Also create private browsing logo variants
echo "Creating private browsing logos..."
convert_svg_to_png 64 "$OUTPUT_DIR/content/about-logo-private.png"
convert_svg_to_png 128 "$OUTPUT_DIR/content/about-logo-private@2x.png"

echo ""
echo "✓ All logo conversions complete!"
echo ""
echo "Generated files:"
echo "  - New tab page: content/about-logo.png, content/about-logo@2x.png, content/about-logo.svg"
echo "  - Tab icons: default16.png, default32.png, default48.png, default64.png, default128.png"
echo "  - Dock icon: firefox.icns"
echo "  - Private browsing: content/about-logo-private.png, content/about-logo-private@2x.png"

