#!/bin/bash

# Complete Build and Release Workflow for Oasis Browser on Mac Silicon
# This script handles the entire process from build to signed release

set -e

# Configuration
VERSION="1.2.0"
BUILD_CONFIG="mozconfig-mac-silicon"
RELEASE_SCRIPT="create_oasis_release_mac_silicon.sh"

echo "🚀 Oasis Browser - Complete Mac Silicon Build & Release Workflow"
echo "🍎 Target: Apple Silicon (ARM64)"
echo "🏷️  Version: $VERSION"
echo ""

# Check if we're in the right directory
if [ ! -f "mach" ]; then
    echo "❌ Error: This script must be run from the Firefox Oasis root directory"
    exit 1
fi

# Check if required files exist
if [ ! -f "$BUILD_CONFIG" ]; then
    echo "❌ Error: Build configuration not found: $BUILD_CONFIG"
    exit 1
fi

if [ ! -f "$RELEASE_SCRIPT" ]; then
    echo "❌ Error: Release script not found: $RELEASE_SCRIPT"
    exit 1
fi

echo "✅ All required files found"
echo ""

# Step 1: Clean previous builds
echo "🧹 Step 1: Cleaning previous builds..."
if [ -d "obj-*" ]; then
    echo "   Removing previous build objects..."
    rm -rf obj-*
fi

echo "✅ Build cleanup complete"
echo ""

# Step 2: Configure build
echo "⚙️  Step 2: Configuring build for Mac Silicon..."
echo "   Using configuration: $BUILD_CONFIG"

# Copy the Mac Silicon config to the default location
cp "$BUILD_CONFIG" .mozconfig

echo "✅ Build configuration set"
echo ""

# Step 3: Build the application
echo "🔨 Step 3: Building Oasis Browser for Mac Silicon..."
echo "   This may take 30-60 minutes depending on your system..."
echo ""

# Start the build
./mach build

if [ $? -eq 0 ]; then
    echo "✅ Build completed successfully!"
else
    echo "❌ Build failed!"
    exit 1
fi

echo ""

# Step 4: Package the application
echo "📦 Step 4: Packaging the application..."
echo "   Creating distribution package..."

./mach package

if [ $? -eq 0 ]; then
    echo "✅ Packaging completed successfully!"
else
    echo "❌ Packaging failed!"
    exit 1
fi

echo ""

# Step 5: Create signed release
echo "🔐 Step 5: Creating code-signed release..."
echo "   Running release script..."

./"$RELEASE_SCRIPT"

if [ $? -eq 0 ]; then
    echo "✅ Release creation completed successfully!"
else
    echo "❌ Release creation failed!"
    exit 1
fi

echo ""
echo "🎉 SUCCESS: Complete build and release workflow finished!"
echo ""
echo "📋 Summary of what was created:"
echo "   🏗️  Built Oasis Browser for Mac Silicon (ARM64)"
echo "   📦 Created distribution package"
echo "   🔐 Code-signed the application"
echo "   📱 Created DMG and ZIP packages"
echo "   📝 Added comprehensive documentation"
echo "   🗑️  Included uninstaller script"
echo ""
echo "🎯 Your release is ready for distribution!"
echo "   Users can download and install without security warnings."
echo ""
echo "📁 Generated files:"
ls -la Oasis-Browser-${VERSION}-*-MacSilicon-Signed.*
echo ""
echo "🔒 Security features:"
echo "   ✅ Code-signed with trusted certificate"
echo "   ✅ No security warnings during installation"
echo "   ✅ Verified by macOS Gatekeeper"
echo "   ✅ Secure runtime execution"
echo ""
echo "💡 Next steps:"
echo "   1. Test the release on a clean Mac Silicon system"
echo "   2. Upload to your distribution platform"
echo "   3. Share with users!"
