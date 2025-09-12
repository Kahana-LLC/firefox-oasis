# Oasis Browser Release Guide

## 🎯 Overview

This guide documents the complete process for building, signing, and packaging the Oasis Browser for distribution. The Oasis Browser is a custom Firefox variant with enhanced branding and privacy features.

## 📋 Prerequisites

### System Requirements
- **macOS**: 10.15+ (Catalina or later)
- **RAM**: 8GB minimum, 16GB recommended
- **Storage**: 20GB free space minimum
- **CPU**: Multi-core processor recommended

### Required Software
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Python 3
brew install python@3.11

# Install Mercurial (for source control)
brew install mercurial
```

### Apple Developer Account
- **Apple ID**: Required for code signing
- **Developer ID Application Certificate**: For code signing
- **App-Specific Password**: For notarization (optional)

## 🚀 Build Process

### 1. Repository Setup
```bash
# Clone the repository
git clone https://github.com/Kahana-LLC/firefox-oasis.git
cd firefox-oasis

# Check current branch
git branch --show-current
# Should be on: release-v1.2.0
```

### 2. Build Environment
```bash
# Bootstrap the build environment
./mach bootstrap --no-interactive

# Verify setup
./mach doctor
# Should show: "Your system is ready to build Firefox!"
```

### 3. Build the Browser
```bash
# Clean any previous builds (optional)
./mach clobber

# Configure for development
./mach configure

# Build Oasis Browser
./mach build
# This will take 30-60 minutes depending on your system
```

### 4. Test the Build
```bash
# Run the browser to test
./mach run

# Or run directly
open obj-aarch64-apple-darwin24.6.0/dist/Oasis.app
```

## 📦 Packaging Process

### 1. Create Unsigned DMG
```bash
# Make the script executable
chmod +x create_simple_dmg.sh

# Create unsigned DMG
./create_simple_dmg.sh
```

**Output**: `Oasis-Browser-1.2.0-YYYYMMDD.dmg`

### 2. Create Code-Signed DMG (Recommended)
```bash
# Make the script executable
chmod +x create_signed_dmg_only.sh

# Create code-signed DMG
./create_signed_dmg_only.sh
```

**Output**: `Oasis-Browser-1.2.0-Signed-YYYYMMDD.dmg`

## 🔐 Code Signing Setup

### 1. Verify Developer Certificate
```bash
# Check available certificates
security find-identity -v -p codesigning

# Should show: "Developer ID Application: Adam Richard Kershner (NV6BDYHYA5)"
```

### 2. Update Signing Configuration
Edit `create_signed_dmg_only.sh` and update:
- `DEVELOPER_ID`: Your Developer ID certificate name
- `APPLE_ID`: Your Apple ID email
- `TEAM_ID`: Your Apple Developer Team ID

### 3. Signing Process
The signing script will:
1. Create a copy of the app for signing
2. Remove problematic files that can't be signed
3. Sign all dylibs, executables, and app bundles
4. Sign the main app bundle
5. Create a DMG with the signed app

## 📁 File Structure

### Key Files Created
```
firefox-oasis/
├── create_simple_dmg.sh          # Creates unsigned DMG
├── create_signed_dmg_only.sh     # Creates code-signed DMG
├── entitlements.plist            # Code signing entitlements
├── RELEASE_GUIDE.md              # This guide
└── obj-aarch64-apple-darwin24.6.0/
    └── dist/
        ├── Oasis.app             # Built application
        └── Oasis-Signed.app      # Code-signed application
```

### DMG Contents
- **Oasis Browser.app**: The main application
- **Applications**: Symbolic link to Applications folder
- **README.txt**: Installation instructions

## 🎨 Branding Features

The Oasis Browser includes the following custom branding:
- **App Name**: "Oasis Browser" instead of Firefox
- **Custom Icons**: Oasis-specific app icons
- **Enhanced Privacy**: Privacy-focused features
- **Custom Branding**: Throughout the user interface

## 📋 Release Checklist

### Before Building
- [ ] Verify you're on the correct branch (`release-v1.2.0`)
- [ ] Ensure all branding changes are committed
- [ ] Clean any previous builds if needed

### Build Process
- [ ] Run `./mach bootstrap --no-interactive`
- [ ] Run `./mach configure`
- [ ] Run `./mach build`
- [ ] Test the build with `./mach run`

### Packaging
- [ ] Create unsigned DMG with `./create_simple_dmg.sh`
- [ ] Create signed DMG with `./create_signed_dmg_only.sh`
- [ ] Test both DMGs on a clean macOS system

### Distribution
- [ ] Verify DMG opens correctly
- [ ] Test installation process
- [ ] Verify app launches without errors
- [ ] Share DMG with team members

## 🔧 Troubleshooting

### Build Issues
```bash
# Clean and rebuild
./mach clobber
./mach configure
./mach build
```

### Signing Issues
```bash
# Check certificate
security find-identity -v -p codesigning

# Verify app structure
codesign --verify --verbose obj-aarch64-apple-darwin24.6.0/dist/Oasis-Signed.app
```

### DMG Issues
```bash
# Check DMG integrity
hdiutil verify Oasis-Browser-*.dmg

# Mount and test
hdiutil attach Oasis-Browser-*.dmg
```

## 📊 Release Information

### Current Release
- **Version**: 1.2.0
- **Build Date**: September 12, 2024
- **Branch**: release-v1.2.0
- **Status**: Code Signed ✅

### File Sizes
- **Unsigned DMG**: ~211MB
- **Signed DMG**: ~212MB
- **App Bundle**: ~200MB

## 🚀 Future Releases

### Version Updates
1. Update version numbers in scripts
2. Update branch name if needed
3. Follow the same build process
4. Test thoroughly before distribution

### Script Maintenance
- Update `DEVELOPER_ID` if certificate changes
- Update `APPLE_ID` if Apple ID changes
- Update `TEAM_ID` if team changes
- Test scripts on clean macOS system

## 📞 Support

### Getting Help
- **Documentation**: Check this guide first
- **Issues**: File bugs on GitHub Issues
- **Community**: Contact the development team

### Common Questions

**Q: Why is the app not notarized?**
A: The current build is code-signed but not notarized. This provides good security while avoiding the complexity of notarization. Users may see a one-time security warning.

**Q: Can I notarize the app?**
A: Yes, but it requires additional setup and may have issues with the complex Firefox build structure. The current code-signed version works well for most use cases.

**Q: How do I update the branding?**
A: Modify the branding files in the `browser/branding/` directory and rebuild.

## 🎉 Success!

You now have a complete, working Oasis Browser that can be distributed to team members. The code-signed DMG provides a professional installation experience with minimal security warnings.

---

**Last Updated**: September 12, 2024  
**Version**: 1.2.0  
**Status**: Production Ready ✅
