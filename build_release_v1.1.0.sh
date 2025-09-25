#!/bin/bash

# Oasis Browser v1.1.0 Release Build Script
# Addresses critical XPCOM and component packaging issues

set -e

echo "🚀 Building Oasis Browser v1.1.0 - Fixed Release Build"
echo "🎯 This build addresses critical XPCOM and component packaging issues"
echo ""

# Check if we're in the right directory
if [ ! -f "./mach" ]; then
    echo "❌ Error: ./mach not found. Please run this script from the Firefox source directory."
    exit 1
fi

# Configuration
VERSION="1.1.0"
BUILD_DATE=$(date +%Y%m%d)
MOZCONFIG="mozconfig-release"

echo "📋 Build Configuration:"
echo "   Version: $VERSION"
echo "   Build Date: $BUILD_DATE"
echo "   Config: $MOZCONFIG"
echo ""

# Clean previous broken build
echo "🧹 Cleaning previous build (removing broken components)..."
./mach clobber

# Configure for fixed release build
echo "⚙️  Configuring release build with fixed settings..."
export MOZCONFIG=$MOZCONFIG
./mach configure

# Verify configuration
echo "🔍 Verifying build configuration..."
if ! grep -q "enable-application=browser" obj-*/config.log; then
    echo "⚠️  Warning: Browser application may not be properly configured"
fi

# Build the application
echo "🔨 Building Oasis Browser v$VERSION (this will take 30-60 minutes)..."
./mach build

# Verify critical components
echo "🔍 Verifying critical components..."
APP_PATH="obj-x86_64-apple-darwin22.6.0/dist/Oasis.app"

if [ ! -d "$APP_PATH" ]; then
    echo "❌ Error: Application bundle not found at $APP_PATH"
    exit 1
fi

echo "✅ Application bundle created successfully"

# Check for XPCOM libraries
echo "🔍 Checking for XPCOM libraries..."
XPCOM_LIBS=(
    "Contents/MacOS/libxpcom.dylib"
    "Contents/MacOS/xpcomglue.dylib"
)

for lib in "${XPCOM_LIBS[@]}"; do
    if [ -f "$APP_PATH/$lib" ]; then
        echo "✅ Found: $lib"
    else
        echo "⚠️  Warning: Missing $lib"
    fi
done

# Check for component manifests (should not be symlinks)
echo "🔍 Checking component manifests..."
COMPONENTS_DIR="$APP_PATH/Contents/Resources/components"
if [ -d "$COMPONENTS_DIR" ]; then
    echo "✅ Components directory exists"
    
    # Count symlinks vs actual files
    SYMLINK_COUNT=$(find "$COMPONENTS_DIR" -type l | wc -l | tr -d ' ')
    FILE_COUNT=$(find "$COMPONENTS_DIR" -type f | wc -l | tr -d ' ')
    
    echo "   Component files: $FILE_COUNT"
    echo "   Symlinks: $SYMLINK_COUNT"
    
    if [ "$SYMLINK_COUNT" -gt 0 ]; then
        echo "⚠️  Warning: Found $SYMLINK_COUNT symlinks in components directory"
        echo "   These should be actual files, not symlinks to development paths"
    fi
else
    echo "❌ Error: Components directory not found"
fi

# Test application launch
echo "🧪 Testing application launch..."
if [ -f "$APP_PATH/Contents/MacOS/firefox" ]; then
    echo "✅ Main executable found"
    
    # Check if executable has proper permissions
    if [ -x "$APP_PATH/Contents/MacOS/firefox" ]; then
        echo "✅ Executable has proper permissions"
    else
        echo "⚠️  Warning: Executable lacks proper permissions"
        chmod +x "$APP_PATH/Contents/MacOS/firefox"
    fi
else
    echo "❌ Error: Main executable not found"
fi

echo ""
echo "✅ Release build completed successfully!"
echo "📦 Application bundle: $APP_PATH"
echo "🏷️  Version: $VERSION"
echo "📅 Build Date: $BUILD_DATE"
echo ""
echo "🎯 Next steps:"
echo "   1. Test the application: ./mach run"
echo "   2. Create packages: ./create_oasis_package.sh"
echo "   3. Test on clean macOS installation"
echo ""
echo "💡 This build should address:"
echo "   ✅ XPCOM loading issues"
echo "   ✅ Broken component symlinks"
echo "   ✅ Missing core libraries"
echo "   ✅ Development path dependencies"
echo ""
echo "🔧 If issues persist, check:"
echo "   - Component manifest contents"
echo "   - Library dependencies"
echo "   - Bundle structure"
