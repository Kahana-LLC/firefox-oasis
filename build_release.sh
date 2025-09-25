#!/bin/bash

# Build Firefox Oasis in release mode for distribution
# This prevents the "Failed to get path to repo dir" crash

set -e

echo "🚀 Building Firefox Oasis in RELEASE mode for distribution..."

# Check if we're in the right directory
if [ ! -f "./mach" ]; then
    echo "❌ Error: ./mach not found. Please run this script from the Firefox source directory."
    exit 1
fi

# Clean previous build
echo "🧹 Cleaning previous build..."
./mach clobber

# Configure for release build
echo "⚙️  Configuring release build..."
export MOZCONFIG=mozconfig-release
./mach configure

# Build in release mode
echo "🔨 Building Firefox Oasis (release mode)..."
./mach build

echo ""
echo "✅ Release build completed successfully!"
echo "📦 This build should NOT have the repository path crash issue"
echo ""
echo "🎯 Next steps:"
echo "   1. Test the build: ./mach run"
echo "   2. Create packages: ./create_oasis_package.sh"
echo "   3. Distribute to users"
echo ""
echo "💡 This release build:"
echo "   - Disables development debugging features"
echo "   - Removes source path dependencies"
echo "   - Optimizes for distribution"
echo "   - Prevents the 'Failed to get path to repo dir' crash"
