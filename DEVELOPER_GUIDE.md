# Firefox Oasis Developer Guide

## 🚀 Getting Started with Firefox Oasis

Welcome to the Firefox Oasis project! This guide will help you get up and running with building, testing, and contributing to our custom Firefox browser variant.

## 📋 Table of Contents
- [What is Firefox Oasis?](#what-is-firefox-oasis)
- [Prerequisites](#prerequisites)
- [Repository Setup](#repository-setup)
- [Building Firefox Oasis](#building-firefox-oasis)
- [Running and Testing](#running-and-testing)
- [Release Packaging](#release-packaging)
- [Development Workflow](#development-workflow)
- [Recent Updates](#recent-updates)
- [Troubleshooting](#troubleshooting)

## 🎯 What is Firefox Oasis?

Firefox Oasis is a **custom Firefox browser variant** with:
- **Custom Branding**: "Oasis Browser" instead of Firefox
- **Privacy-Focused**: Enhanced privacy features
- **Fast & Reliable**: Based on Firefox's proven technology
- **Cross-Platform**: Available for macOS, Windows, and Linux
- **Open Source**: Built on Mozilla's Firefox source code

**Repository**: [https://github.com/Kahana-LLC/firefox-oasis](https://github.com/Kahana-LLC/firefox-oasis)

## ⚙️ Prerequisites

### System Requirements
- **macOS**: 10.15+ (Catalina or later)
- **Windows**: Windows 10/11 (64-bit)
- **Linux**: Ubuntu 20.04+ or equivalent
- **RAM**: 8GB minimum, 16GB recommended
- **Storage**: 20GB free space minimum
- **CPU**: Multi-core processor recommended

### Required Software

#### macOS
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

#### Windows
```bash
# Install Visual Studio Build Tools 2019 or later
# Download from: https://visualstudio.microsoft.com/downloads/

# Install Python 3.11+
# Download from: https://www.python.org/downloads/

# Install Git
# Download from: https://git-scm.com/download/win
```

#### Linux (Ubuntu/Debian)
```bash
# Update system
sudo apt update && sudo apt upgrade

# Install build dependencies
sudo apt install build-essential python3 python3-pip git mercurial

# Install additional dependencies
sudo apt install libgtk-3-dev libdbus-glib-1-dev libpulse-dev
```

## 📥 Repository Setup

### 1. Clone the Repository
```bash
# Clone the repository
git clone https://github.com/Kahana-LLC/firefox-oasis.git

# Navigate to the project directory
cd firefox-oasis

# Verify you're on the main branch
git branch
```

### 2. Initialize Build Environment
```bash
# Bootstrap the build environment
./mach bootstrap --no-interactive

# This will install all necessary dependencies and configure the build system
```

### 3. Verify Setup
```bash
# Check if everything is properly configured
./mach doctor

# This should show "Your system is ready to build Firefox!"
```

## 🔨 Building Firefox Oasis

### Development Build (Recommended for Development)
```bash
# Clean any previous builds
./mach clobber

# Configure for development
./mach configure

# Build Firefox Oasis
./mach build

# This will take 30-60 minutes depending on your system
```

### Release Build (For Distribution)
```bash
# Use the release configuration
export MOZCONFIG=mozconfig-release

# Clean and configure
./mach clobber
./mach configure

# Build release version
./mach build
```

### Build Configuration Files
- **Development**: Uses default `mozconfig` (debug symbols, development features)
- **Release**: Uses `mozconfig-release` (optimized, no debug symbols)

## 🏃‍♂️ Running and Testing

### Run the Browser
```bash
# Run the development build
./mach run

# Run with specific profile
./mach run --profile /path/to/profile

# Run in safe mode
./mach run --safe-mode
```

### Testing
```bash
# Run unit tests
./mach test

# Run specific test suite
./mach test browser/base/content/test/

# Run performance tests
./mach talos-test

# Run accessibility tests
./mach test accessible/
```

### Debugging
```bash
# Run with debugging enabled
./mach run --debug

# Attach debugger
./mach run --debugger=gdb  # Linux
./mach run --debugger=lldb # macOS
```

## 📦 Release Packaging

### Create Distribution Packages

#### macOS
```bash
# Build release version first
export MOZCONFIG=mozconfig-release
./mach clobber
./mach configure
./mach build

# Create packages
./create_oasis_package.sh

# This creates:
# - Oasis-Browser-1.0.0-YYYYMMDD.dmg
# - Oasis-Browser-1.0.0-YYYYMMDD.zip
```

#### Windows
```bash
# Use Windows build script
.\build_release.bat

# Create installer packages
# (Windows packaging scripts to be added)
```

#### Linux
```bash
# Use Linux build script
./build_release_linux.sh

# Create distribution packages
# (Linux packaging scripts to be added)
```

### Package Contents
- **DMG/ZIP**: macOS installer packages
- **MSI/EXE**: Windows installer packages  
- **DEB/RPM**: Linux package formats
- **AppImage**: Portable Linux application

## 🔄 Development Workflow

### 1. Create a Feature Branch
```bash
# Create and switch to a new branch
git checkout -b feature/your-feature-name

# Or create a branch from main
git checkout main
git pull origin main
git checkout -b feature/your-feature-name
```

### 2. Make Changes
```bash
# Edit files as needed
# Test your changes locally
./mach run

# Run tests to ensure nothing is broken
./mach test
```

### 3. Commit and Push
```bash
# Stage your changes
git add .

# Commit with descriptive message
git commit -m "Add feature: brief description"

# Push to your branch
git push origin feature/your-feature-name
```

### 4. Create Pull Request
- Go to [GitHub Repository](https://github.com/Kahana-LLC/firefox-oasis)
- Click "New Pull Request"
- Select your feature branch
- Add description and request review

### 5. Code Review Process
- All changes require review
- Address feedback and make updates
- Once approved, merge to main

## 📈 Recent Updates

### Latest Changes (as of current commit)
- **Custom Branding**: Complete Oasis Browser branding implementation
- **Release Configuration**: Optimized build configuration for distribution
- **Packaging Scripts**: Automated package creation for macOS
- **Cross-Platform Support**: Foundation for Windows and Linux builds

### Key Features Added
1. **Oasis Branding**: Custom logos, icons, and branding throughout the browser
2. **Release Builds**: Optimized builds for distribution
3. **Package Creation**: Automated DMG and ZIP creation for macOS
4. **Build Scripts**: Streamlined build process for developers

### Recent Commits
```
11106cc7b589 - Merge pull request #20 from Kahana-LLC/oasis-branding-release
8d1c8280a6ef - Merge pull request #19 from mozilla-firefox/main
01b25882dabe - Add Oasis Browser branding and release build configuration
```

## 🛠️ Troubleshooting

### Common Issues

#### Build Failures
```bash
# Clean everything and rebuild
./mach clobber
./mach configure
./mach build
```

#### Missing Dependencies
```bash
# Re-run bootstrap
./mach bootstrap --no-interactive

# Check system requirements
./mach doctor
```

#### Memory Issues
```bash
# Reduce parallel jobs
export MOZ_PARALLEL_BUILD=2
./mach build
```

#### Git Issues
```bash
# Reset to clean state
git reset --hard origin/main
git clean -fd
```

### Getting Help
- **Documentation**: Check [Firefox Source Docs](https://firefox-source-docs.mozilla.org/)
- **Issues**: File bugs on [Bugzilla](https://bugzilla.mozilla.org/)
- **Community**: Join [Matrix chat](https://chat.mozilla.org/#/room/#introduction:mozilla.org)
- **Repository Issues**: Use GitHub Issues for project-specific problems

## 🔗 Useful Resources

### Documentation
- [Firefox Source Docs](https://firefox-source-docs.mozilla.org/)
- [Contributing Guide](https://firefox-source-docs.mozilla.org/contributing/contribution_quickref.html)
- [Build Documentation](https://firefox-source-docs.mozilla.org/setup/)

### Tools
- **Bugzilla**: [bugzilla.mozilla.org](https://bugzilla.mozilla.org/)
- **Matrix Chat**: [chat.mozilla.org](https://chat.mozilla.org/)
- **Firefox Nightly**: [mozilla.org/firefox/channel/desktop/#nightly](https://www.mozilla.org/firefox/channel/desktop/#nightly)

### Development Tools
- **Mercurial**: Source control for Mozilla repositories
- **Mach**: Mozilla's build system
- **Mozconfig**: Build configuration files

## 🎉 Welcome to the Team!

You're now ready to contribute to Firefox Oasis! Remember to:
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md)
- Test your changes thoroughly
- Write clear commit messages
- Ask for help when needed

Happy coding! 🚀
