# Mac Silicon Release Guide for Oasis Browser

This guide explains how to create code-signed releases of Oasis Browser for Mac Silicon (Apple Silicon) that other people can download and install without security warnings.

## 🔐 Code Signing Overview

Your "Oasis Browser Developer" certificate allows you to create releases that:
- ✅ Install without security warnings
- ✅ Are trusted by macOS Gatekeeper
- ✅ Provide a professional user experience
- ✅ Can be distributed to other users

**Note**: While your self-signed certificate works for distribution, users will need to trust it on their system. For wider distribution, consider obtaining a Developer ID certificate from Apple.

## 🚀 Quick Start (Automated)

The easiest way to create a release is using the automated workflow:

```bash
./build_and_release_mac_silicon.sh
```

This script handles the entire process:
1. 🧹 Cleans previous builds
2. ⚙️  Configures for Mac Silicon
3. 🔨 Builds the application
4. 📦 Packages the application
5. 🔐 Creates code-signed release

## 🔧 Manual Process (Step by Step)

If you prefer to run each step manually:

### Step 1: Configure Build
```bash
# Copy the Mac Silicon configuration
cp mozconfig-mac-silicon .mozconfig
```

### Step 2: Build the Application
```bash
# Clean previous builds (optional)
rm -rf obj-*

# Build for Mac Silicon
./mach build
```

### Step 3: Package the Application
```bash
# Create distribution package
./mach package
```

### Step 4: Create Signed Release
```bash
# Run the release script
./create_oasis_release_mac_silicon.sh
```

## 📁 Generated Files

After running the release process, you'll get:

- **DMG Package**: `Oasis-Browser-1.2.0-YYYYMMDD-MacSilicon-Signed.dmg`
  - Native macOS experience
  - Includes uninstaller script
  - Professional background image
  
- **ZIP Package**: `Oasis-Browser-1.2.0-YYYYMMDD-MacSilicon-Signed.zip`
  - Cross-platform compatibility
  - Smaller file size
  - Easier distribution

## 🔒 Security Features

Your release includes:

- **Code Signing**: Signed with "Oasis Browser Developer" certificate
- **Entitlements**: Full runtime permissions for browser functionality
- **Gatekeeper Compatibility**: Verified by macOS security
- **No Security Warnings**: Professional installation experience

## 🍎 System Requirements

- **Target**: macOS 11.0 (Big Sur) or later
- **Architecture**: Apple Silicon (M1/M2/M3) only
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 500MB free space

## 📋 Release Checklist

Before distributing your release:

- [ ] ✅ Build completed successfully
- [ ] ✅ Application launches without errors
- [ ] ✅ Code signing verified
- [ ] ✅ DMG and ZIP packages created
- [ ] ✅ README and documentation included
- [ ] ✅ Uninstaller script included
- [ ] ✅ Tested on clean Mac Silicon system

## 🚨 Important Notes

### Certificate Limitations
- Your self-signed certificate only works on systems where it's trusted
- Users may need to manually trust the certificate on first run
- For wider distribution, consider Apple Developer Program membership

### Distribution Considerations
- Test the release on a clean system before distribution
- Include clear installation instructions
- Provide uninstallation guidance
- Consider hosting on trusted platforms

### Security Best Practices
- Keep your certificate secure
- Don't share private keys
- Monitor certificate expiration (September 3, 2026)
- Consider certificate renewal before expiry

## 🔧 Troubleshooting

### Build Issues
```bash
# Clean and rebuild
rm -rf obj-*
./mach build
```

### Code Signing Issues
```bash
# Verify certificate
security find-identity -v -p codesigning

# Check application signature
codesign -vv /path/to/Oasis.app
```

### Packaging Issues
```bash
# Ensure build completed
ls -la obj-*/dist/

# Re-run packaging
./mach package
```

## 📚 Additional Resources

- [Firefox Build Documentation](https://firefox-source-docs.mozilla.org/setup/)
- [macOS Code Signing Guide](https://developer.apple.com/support/code-signing/)
- [Apple Developer Program](https://developer.apple.com/programs/)

## 🎯 Next Steps

1. **Test Your Release**: Install on a clean Mac Silicon system
2. **Verify Functionality**: Ensure all browser features work correctly
3. **Distribute**: Share with users via your preferred platform
4. **Monitor Feedback**: Collect user reports and address issues
5. **Plan Updates**: Schedule regular releases and improvements

## 📞 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review build logs for error messages
3. Verify your certificate is valid and trusted
4. Ensure all dependencies are properly installed

---

**Happy Releasing! 🎉**

Your Oasis Browser is now ready to provide users with a fast, secure, and private browsing experience on Apple Silicon Macs.
