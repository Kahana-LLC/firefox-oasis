# 🍎 Apple Notarization Success Guide
## Complete Documentation of Learnings and Best Practices

**Project**: Oasis Browser (Firefox-based)  
**Date**: September 15, 2025  
**Status**: ✅ Successfully Notarized  

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [Root Cause Analysis](#root-cause-analysis)
3. [Technical Solutions](#technical-solutions)
4. [Step-by-Step Process](#step-by-step-process)
5. [Common Pitfalls](#common-pitfalls)
6. [Tools and Scripts](#tools-and-scripts)
7. [Verification Checklist](#verification-checklist)
8. [Distribution Options](#distribution-options)
9. [Lessons Learned](#lessons-learned)
10. [Future Recommendations](#future-recommendations)

---

## 🎯 Executive Summary

### The Challenge
Firefox-based applications face unique notarization challenges due to their complex build system that continues to modify files after signing, invalidating signatures and causing notarization failures.

### The Solution
We developed a comprehensive post-build signing approach that:
- Resolves symbolic links by copying actual files into the app bundle
- Removes problematic build artifacts (`.mkdir.done` files)
- Creates a self-contained, properly signed application
- Uses `rcodesign` for robust signing with Developer ID certificates

### The Result
✅ **Successfully notarized** Oasis Browser with Apple's notarization service  
✅ **Universal binary** supporting both Intel and Apple Silicon Macs  
✅ **Zero security warnings** for end users  
✅ **Professional distribution** ready for team deployment  

---

## 🔍 Root Cause Analysis

### Primary Issue: Post-Signing File Modifications

Firefox's build system creates several problems for notarization:

1. **Symbolic Links**: Thousands of symlinks pointing outside the app bundle
2. **Build Artifacts**: `.mkdir.done` files created after signing
3. **File Modifications**: Any changes after signing invalidate the signature
4. **Universal Binaries**: Complex handling of multi-architecture binaries

### Why This Causes Notarization Failure

Apple's notarization service validates:
- Code signatures are valid and unmodified
- All files within the bundle are properly signed
- No external dependencies or broken symlinks
- Hardened runtime is properly configured

When Firefox's build system modifies files after signing, it breaks these requirements.

---

## 🛠 Technical Solutions

### Solution 1: Symbolic Link Resolution

**Problem**: 6,707+ symbolic links pointing outside the app bundle
```bash
# Find and resolve all symlinks
find "$APP_PATH" -type l | while read link; do
    target=$(readlink "$link")
    rm "$link"
    cp -R "$target" "$link"
done
```

**Result**: Self-contained app bundle with no external dependencies

### Solution 2: Build Artifact Cleanup

**Problem**: `.mkdir.done` files created after signing
```bash
# Remove all build artifacts
find "$APP_PATH" -name "*.done" -o -name ".mkdir.done" | xargs rm -f
```

**Result**: Clean app bundle without build system artifacts

### Solution 3: Post-Build Signing with rcodesign

**Problem**: Apple's `codesign` tool limitations with complex Firefox builds
```bash
# Use rcodesign for robust signing
rcodesign sign \
    --for-notarization \
    --p12-file "$P12_FILE" \
    --p12-password "$P12_PASSWORD" \
    --code-signature-flags runtime \
    --entitlements-xml-file "$ENTITLEMENTS_FILE" \
    "$APP_PATH"
```

**Result**: Properly signed application ready for notarization

---

## 📝 Step-by-Step Process

### Phase 1: Environment Setup

1. **Install rcodesign**
   ```bash
   cargo install apple-codesign
   ```

2. **Prepare Developer ID Certificate**
   - Export `.p12` file from Keychain Access
   - Include both certificate and private key
   - Set a secure password

3. **Create Entitlements File**
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
       <key>com.apple.security.cs.allow-jit</key>
       <true/>
       <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
       <true/>
       <key>com.apple.security.cs.disable-executable-page-protection</key>
       <true/>
       <key>com.apple.security.cs.disable-library-validation</key>
       <true/>
   </dict>
   </plist>
   ```

### Phase 2: App Preparation

1. **Copy Original Build**
   ```bash
   cp -R "obj-aarch64-apple-darwin24.6.0/dist/Oasis.app" "Oasis-Browser-Final.app"
   ```

2. **Resolve Symbolic Links**
   - Find all symlinks: `find "$APP_PATH" -type l`
   - Replace with actual files: `cp -R "$target" "$link"`

3. **Clean Build Artifacts**
   - Remove `.mkdir.done` files
   - Remove any other build system artifacts

4. **Handle Problematic Binaries**
   - Remove standalone `org.mozilla.updater` (use bundled version)
   - Ensure all binaries have proper Info.plist files

### Phase 3: Signing

1. **Sign with rcodesign**
   ```bash
   rcodesign sign \
       --for-notarization \
       --p12-file "developer_id.p12" \
       --p12-password "$PASSWORD" \
       --code-signature-flags runtime \
       --entitlements-xml-file "entitlements.plist" \
       "Oasis-Browser-Final.app"
   ```

2. **Verify Signatures**
   ```bash
   codesign -vvv --deep --strict "Oasis-Browser-Final.app"
   ```

### Phase 4: Notarization

1. **Create Zip File**
   ```bash
   zip -r "Oasis-Browser-Final.zip" "Oasis-Browser-Final.app"
   ```

2. **Submit for Notarization**
   ```bash
   xcrun notarytool submit "Oasis-Browser-Final.zip" \
       --apple-id "your-email@example.com" \
       --team-id "YOUR_TEAM_ID" \
       --password "$APP_SPECIFIC_PASSWORD" \
       --wait
   ```

3. **Check Results**
   ```bash
   xcrun notarytool log "$SUBMISSION_ID" \
       --apple-id "your-email@example.com" \
       --team-id "YOUR_TEAM_ID" \
       --password "$APP_SPECIFIC_PASSWORD"
   ```

---

## ⚠️ Common Pitfalls

### 1. Certificate Issues
- **Problem**: Using `.cer` files instead of `.p12` files
- **Solution**: Export complete certificate with private key as `.p12`

### 2. Symbolic Links
- **Problem**: Symlinks pointing outside app bundle
- **Solution**: Copy actual files into bundle, remove symlinks

### 3. Build Artifacts
- **Problem**: `.mkdir.done` files created after signing
- **Solution**: Remove all build artifacts before signing

### 4. Universal Binaries
- **Problem**: Standalone universal binaries without proper Info.plist
- **Solution**: Use bundled versions or create proper Info.plist files

### 5. Post-Signing Modifications
- **Problem**: Any file changes after signing invalidate signatures
- **Solution**: Ensure all modifications happen before signing

---

## 🔧 Tools and Scripts

### Core Script: `resolve_symlinks_and_sign.sh`

This comprehensive script handles the entire process:

```bash
#!/bin/bash
# Comprehensive Script to Prepare and Sign Oasis Browser for Notarization
# This script copies the original Firefox build, resolves symbolic links,
# removes problematic build artifacts, and then signs the app using rcodesign.

set -e

# Configuration
ORIGINAL_APP_PATH="obj-aarch64-apple-darwin24.6.0/dist/Oasis.app"
FINAL_APP_NAME="Oasis-Browser-Final.app"
P12_FILE="developer_id.p12"
ENTITLEMENTS_FILE="./entitlements.plist"

# Step 1: Clean up previous test app if it exists
if [ -d "$FINAL_APP_NAME" ]; then
    echo "🧹 Cleaning up previous $FINAL_APP_NAME..."
    rm -rf "$FINAL_APP_NAME"
fi

# Step 2: Copy the original app to a new location
echo "📁 Copying original app to $FINAL_APP_NAME..."
cp -R "$ORIGINAL_APP_PATH" "$FINAL_APP_NAME"

# Step 3: Resolve symbolic links by copying the actual files
echo "🔗 Resolving symbolic links..."
symlinks_found=0
while IFS= read -r link; do
    if [ -L "$link" ]; then
        target=$(readlink "$link")
        echo "🔗 Resolving: $link -> $target"
        rm "$link"
        cp -R "$target" "$link"
        symlinks_found=$((symlinks_found + 1))
    fi
done < <(find "$FINAL_APP_NAME" -type l)
echo "✅ Resolved $symlinks_found symbolic links"

# Step 4: Remove problematic build artifacts
echo "🧹 Cleaning problematic build artifacts..."
artifacts=$(find "$FINAL_APP_NAME" -name "*.done" -o -name ".mkdir.done" 2>/dev/null)
num_artifacts=$(echo "$artifacts" | wc -l | tr -d ' ')
if [ "$num_artifacts" -gt 0 ]; then
    echo "📊 Found $num_artifacts build artifacts"
    echo "$artifacts" | xargs rm -f || true
    echo "✅ All build artifacts removed!"
fi

# Step 5: Sign the app with rcodesign
echo "🔏 Signing app with rcodesign..."
echo "Enter password for $P12_FILE:"
read -s P12_PASSWORD
rcodesign sign \
    --for-notarization \
    --p12-file "$P12_FILE" \
    --p12-password "$P12_PASSWORD" \
    --code-signature-flags runtime \
    --entitlements-xml-file "$ENTITLEMENTS_FILE" \
    "$FINAL_APP_NAME"

# Step 6: Verify the signature
echo "🔍 Verifying signature..."
codesign_output=$(codesign -dvv "$FINAL_APP_NAME" 2>&1)
echo "$codesign_output" | grep -E "(Authority|TeamIdentifier|Hardened Runtime|Signature)"

# Check for file modification errors
modified_files=$(codesign --verify --deep --strict --verbose=2 "$FINAL_APP_NAME" 2>&1 | grep "modified" | wc -l | tr -d ' ')
if [ "$modified_files" -eq 0 ]; then
    echo "✅ No file modification errors"
    echo "🎉 SUCCESS! App is ready for notarization"
else
    echo "❌ Found $modified_files files with modification errors"
    exit 1
fi
```

### Verification Script: `pre_notarization_test.sh`

Comprehensive testing before submission:

```bash
#!/bin/bash
# Comprehensive Pre-Notarization Test Script
# This script performs a series of checks on a signed macOS application

# Function to check for file modifications after signing
check_file_modifications() {
    local app_path="$1"
    local codesign_output=$(codesign --verify --deep --strict --verbose=2 "$app_path" 2>&1 || true)
    local modified_files=$(echo "$codesign_output" | grep "modified" | wc -l | tr -d ' ')
    
    if [ "$modified_files" -eq 0 ]; then
        echo "✅ No file modification errors detected"
        return 0
    else
        echo "❌ Found $modified_files files with modification errors"
        return 1
    fi
}

# Function to verify signature integrity
verify_signature_integrity() {
    local app_path="$1"
    if codesign -vvv --deep --strict "$app_path" >/dev/null 2>&1; then
        echo "✅ Signature verification passed"
        return 0
    else
        echo "❌ Signature verification failed"
        return 1
    fi
}

# Function to check certificate chain
check_certificate_chain() {
    local app_path="$1"
    local codesign_output=$(codesign -dvv "$app_path" 2>&1)
    
    if echo "$codesign_output" | grep -q "Developer ID Application"; then
        echo "✅ Developer ID Application certificate found"
    else
        echo "❌ Developer ID Application certificate not found"
        return 1
    fi
    
    if echo "$codesign_output" | grep -q "TeamIdentifier="; then
        echo "✅ Team identifier correctly set"
    else
        echo "❌ Team identifier not set"
        return 1
    fi
    
    return 0
}

# Function to check hardened runtime
check_hardened_runtime() {
    local app_path="$1"
    local codesign_output=$(codesign -dvv "$app_path" 2>&1)
    
    if echo "$codesign_output" | grep -q "Hardened Runtime"; then
        echo "✅ Hardened runtime enabled"
        return 0
    else
        echo "❌ Hardened runtime not enabled"
        return 1
    fi
}
```

---

## ✅ Verification Checklist

### Pre-Signing Checklist
- [ ] Original Firefox build is complete
- [ ] Developer ID certificate is properly exported as `.p12`
- [ ] Entitlements file is configured correctly
- [ ] `rcodesign` is installed and working

### Post-Signing Checklist
- [ ] All symbolic links resolved (0 symlinks remaining)
- [ ] All build artifacts removed (0 `.mkdir.done` files)
- [ ] Signature verification passes: `codesign -vvv --deep --strict`
- [ ] No file modification errors detected
- [ ] Developer ID Application certificate in authority chain
- [ ] Team identifier correctly set
- [ ] Hardened runtime enabled
- [ ] All nested bundles properly signed

### Pre-Notarization Checklist
- [ ] App bundle is self-contained (no external dependencies)
- [ ] Zip file created successfully
- [ ] App-specific password is available
- [ ] Apple ID and Team ID are correct

### Post-Notarization Checklist
- [ ] Notarization status is "Accepted"
- [ ] No critical validation errors in logs
- [ ] DMG created for distribution (optional)
- [ ] Distribution instructions provided to team

---

## 📦 Distribution Options

### Option 1: ZIP File
- **File**: `Oasis-Browser-Final-Clean.zip`
- **Size**: ~239MB
- **Pros**: Simple, direct
- **Cons**: Requires manual extraction

### Option 2: DMG File (Recommended)
- **File**: `Oasis-Browser-Professional.dmg`
- **Size**: ~290MB
- **Pros**: Professional, drag-and-drop installation
- **Cons**: Slightly larger file size

### Installation Instructions for End Users

#### ZIP Distribution:
```bash
unzip Oasis-Browser-Final-Clean.zip
sudo mv Oasis-Browser-Final-Clean.app /Applications/
```

#### DMG Distribution:
1. Double-click the DMG file
2. Drag the app to the Applications folder
3. Eject the DMG when done

---

## 🎓 Lessons Learned

### Technical Insights

1. **Firefox Build System Complexity**: Firefox's build system is designed for flexibility, not notarization compliance. Post-build processing is essential.

2. **Symbolic Link Impact**: Even a single symlink pointing outside the bundle can cause notarization failure. Complete resolution is critical.

3. **Build Artifact Persistence**: Build artifacts like `.mkdir.done` files are created throughout the build process and must be completely removed.

4. **Universal Binary Handling**: Standalone universal binaries without proper Info.plist files cause validation issues. Use bundled versions when possible.

5. **rcodesign Advantages**: `rcodesign` provides better error handling and more robust signing than Apple's `codesign` tool for complex applications.

### Process Insights

1. **Iterative Approach**: Notarization issues often require multiple iterations to resolve completely.

2. **Comprehensive Testing**: Pre-notarization testing is essential to catch issues before submission.

3. **Detailed Logging**: Apple's notarization logs provide specific error details that are crucial for debugging.

4. **Certificate Management**: Proper certificate export and management is fundamental to success.

### Strategic Insights

1. **Post-Build Signing**: For complex applications like Firefox, post-build signing is more reliable than build-time signing.

2. **Self-Contained Bundles**: Creating completely self-contained app bundles eliminates many notarization issues.

3. **Automation Benefits**: Automated scripts reduce human error and ensure consistent results.

---

## 🚀 Future Recommendations

### Short-Term Improvements

1. **Automated CI/CD Integration**: Integrate the notarization process into the build pipeline
2. **Enhanced Error Handling**: Add more robust error handling to scripts
3. **Performance Optimization**: Optimize the symlink resolution process for faster execution

### Long-Term Considerations

1. **Build System Modifications**: Consider modifying the Firefox build system to be notarization-friendly
2. **Alternative Signing Approaches**: Explore other signing tools and approaches
3. **Documentation Maintenance**: Keep this guide updated as Apple's requirements evolve

### Monitoring and Maintenance

1. **Regular Testing**: Test notarization process with each Firefox update
2. **Certificate Renewal**: Monitor certificate expiration and renewal requirements
3. **Apple Policy Changes**: Stay informed about changes to Apple's notarization requirements

---

## 📚 Additional Resources

### Apple Documentation
- [Notarizing macOS Software Before Distribution](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Resolving Common Notarization Issues](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution/resolving_common_notarization_issues)

### Tools and Utilities
- [rcodesign](https://github.com/indygreg/apple-platform-rs) - Rust-based code signing tool
- [xcrun notarytool](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution) - Apple's notarization tool

### Community Resources
- [Mozilla's Firefox Notarization Process](https://firefox-source-docs.mozilla.org/build/buildsystem/notarization.html)
- [Apple Developer Forums](https://developer.apple.com/forums/) - Community support for notarization issues

---

## 📝 Conclusion

Successfully notarizing Firefox-based applications requires a deep understanding of both Apple's security requirements and Firefox's complex build system. The key to success is creating a completely self-contained, properly signed application bundle that meets all of Apple's validation criteria.

This guide documents the complete process we developed to achieve successful notarization, including the technical solutions, tools, and best practices that made it possible. By following this approach, other developers can avoid the common pitfalls and achieve notarization success for their own Firefox-based applications.

**Remember**: Notarization is not just about signing—it's about creating a secure, self-contained application that meets Apple's high standards for macOS software distribution.

---

*This document was created based on the successful notarization of Oasis Browser on September 15, 2025. It represents the culmination of extensive research, testing, and problem-solving to achieve Apple notarization compliance.*
