# Oasis Browser v1.1.0 Release - Technical Learnings & Fixes

## Overview
This document summarizes the critical issues discovered in the initial Oasis Browser release and the comprehensive fixes applied for v1.1.0. These learnings are essential for future releases and should be referenced when building new versions.

## Critical Issues Identified (Pre-v1.1.0)

### 1. XPCOM Component Loading Failure
**Problem**: Application failed to launch with "Couldn't load XPCOM" error
**Root Cause**: Missing core XPCOM libraries (`libxpcom.dylib`, `xpcomglue.dylib`) and incomplete component packaging
**Impact**: Application completely non-functional

### 2. Broken Symlinks to Development Paths
**Problem**: 15 out of 16 component files were broken symlinks pointing to development paths
**Example**: `/Users/adamkershnenr/Documents/firefox-oasis/obj-x86_64-apple-darwin22.6.0/dist/bin/components/...`
**Root Cause**: Using `mach build` alone without `mach package` for distribution
**Impact**: Application not self-contained, fails on other systems

### 3. Incomplete Application Bundle
**Problem**: Missing `omni.ja` file and other essential distribution components
**Root Cause**: Incorrect build configuration and packaging process
**Impact**: Application not suitable for distribution

## Technical Fixes Applied (v1.1.0)

### 1. Build Configuration Fixes (`mozconfig-release`)

#### Essential Configuration Options
```bash
# CRITICAL: Must include for proper browser packaging
ac_add_options --enable-application=browser

# Custom branding
ac_add_options --with-branding=browser/branding/custom

# Release optimizations
ac_add_options --enable-release
ac_add_options --disable-debug
ac_add_options --enable-optimize

# Distribution settings
ac_add_options --disable-crashreporter
ac_add_options --enable-update-channel=release

# Prevent development path dependencies
export MOZ_INCLUDE_SOURCE_INFO=
export MOZ_DISABLE_SOURCE_INFO=1
```

#### Invalid Options Removed
- `--enable-package` (not available in current build system)
- `--enable-install-strip` (not available in current build system)
- `--enable-component-package` (not available in current build system)
- `--disable-source-paths` (not available in current build system)

### 2. Packaging Process Fix

#### Before (Broken)
```bash
./mach build  # Only creates development build
```

#### After (Fixed)
```bash
./mach build     # Build the application
./mach package   # CRITICAL: Create distribution package
```

**Key Insight**: `mach package` is essential for creating a self-contained distribution. It:
- Packages all components into `omni.ja`
- Creates proper symlinks
- Generates a DMG with the correct structure
- Makes the application portable

### 3. Branding Asset Requirements

#### Required Files for `mach package`
The packaging process requires these files in `browser/branding/custom/`:
- `dsstore` (can be empty)
- `background.png` (can be empty)
- `disk.icns` (can be empty)

**Solution**: Created dummy files to satisfy packaging requirements.

### 4. Enhanced Packaging Script

#### Key Improvements in `create_oasis_package_v1.1.0.sh`
1. **Uses `mach package` output**: Sources from `firefox-144.0a1.en-US.mac.dmg`
2. **Enhanced branding**: Professional background and icons
3. **Comprehensive documentation**: Detailed README with installation/uninstallation
4. **Automated uninstaller**: User-friendly removal script
5. **Multiple formats**: Both DMG and ZIP distribution

## Build Process for Future Releases

### Step 1: Clean Build Environment
```bash
./mach clobber
```

### Step 2: Configure Release Build
```bash
export MOZCONFIG=mozconfig-release
./mach configure
```

### Step 3: Build Application
```bash
./mach build
```

### Step 4: Create Distribution Package
```bash
./mach package  # CRITICAL STEP
```

### Step 5: Create User-Friendly Packages
```bash
./create_oasis_package_v1.1.0.sh
```

## Verification Checklist

### Pre-Release Testing
- [ ] Application launches without XPCOM errors
- [ ] No broken symlinks in `Oasis.app/Contents/MacOS/`
- [ ] `omni.ja` file present in `Oasis.app/Contents/Resources/`
- [ ] Application runs on clean system (no development dependencies)
- [ ] DMG mounts and installs correctly
- [ ] ZIP extracts and runs correctly
- [ ] Uninstaller script functions properly

### File Structure Verification
```bash
# Check for omni.ja (essential for self-contained app)
ls -la "Oasis.app/Contents/Resources/omni.ja"

# Check for XPCOM libraries
ls -la "Oasis.app/Contents/MacOS/libxpcom.dylib"
ls -la "Oasis.app/Contents/MacOS/xpcomglue.dylib"

# Verify no broken symlinks
find "Oasis.app" -type l -exec test ! -e {} \; -print
```

## Common Pitfalls to Avoid

### 1. Skipping `mach package`
**Mistake**: Using only `mach build` for distribution
**Result**: Broken symlinks and missing components
**Solution**: Always run `mach package` after `mach build`

### 2. Invalid Build Options
**Mistake**: Using options not available in current Mozilla build system
**Result**: Build configuration errors
**Solution**: Test all `ac_add_options` before committing

### 3. Missing Branding Assets
**Mistake**: Not providing required branding files
**Result**: `mach package` fails
**Solution**: Create dummy files if not needed

### 4. Development Path Dependencies
**Mistake**: Not preventing source info inclusion
**Result**: Application tied to development environment
**Solution**: Use `MOZ_INCLUDE_SOURCE_INFO=` and `MOZ_DISABLE_SOURCE_INFO=1`

## File Changes Summary

### Modified Files
- `mozconfig-release`: Fixed build configuration
- `build_release_v1.1.0.sh`: Enhanced build script with verification
- `create_oasis_package_v1.1.0.sh`: Improved packaging with uninstaller

### New Files
- `browser/branding/custom/dsstore`: Dummy file for packaging
- `browser/branding/custom/background.png`: Dummy file for packaging
- `browser/branding/custom/disk.icns`: Dummy file for packaging
- `RELEASE_PLAN_v1.1.0.md`: Release planning document
- `RELEASE_LEARNINGS_v1.1.0.md`: This document

### Generated Files (Not Committed)
- `Oasis-Browser-1.1.0-20250824-FIXED.dmg`: Distribution package
- `Oasis-Browser-1.1.0-20250824-FIXED.zip`: Distribution package

## Future Release Considerations

### Version Management
- Update version numbers in all scripts and configurations
- Consider automated version bumping
- Maintain changelog for each release

### Testing Strategy
- Test on multiple macOS versions
- Verify installation/uninstallation process
- Test application functionality thoroughly

### Distribution
- Consider code signing for macOS Gatekeeper compatibility
- Implement automated build and packaging pipeline
- Create release notes for each version

## Resources and References

### Mozilla Build Documentation
- [Mozilla Build System](https://firefox-source-docs.mozilla.org/setup/)
- [mach command reference](https://firefox-source-docs.mozilla.org/setup/mach_basics.html)
- [mozconfig options](https://firefox-source-docs.mozilla.org/setup/configuring_build_options.html)

### Key Commands Reference
```bash
# Build system
./mach clobber          # Clean build
./mach configure        # Configure build
./mach build           # Build application
./mach package         # Create distribution package

# Package management
hdiutil attach         # Mount DMG
hdiutil detach         # Unmount DMG
```

---

**Document Version**: 1.0  
**Created**: August 24, 2024  
**Last Updated**: August 24, 2024  
**Related Release**: Oasis Browser v1.1.0 FIXED
