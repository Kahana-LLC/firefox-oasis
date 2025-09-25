# Cross-Platform Firefox Oasis Build Guide

## Overview
Building Firefox for multiple platforms requires platform-specific environments. Here are the recommended approaches:

## Option 1: Cloud CI/CD (Recommended)
Use GitHub Actions or similar CI/CD services that provide multiple platform runners:

### GitHub Actions Workflow
```yaml
name: Build Firefox Oasis
on: [push, release]

jobs:
  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build macOS
        run: ./build_release.sh

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Windows Build Environment
        run: |
          # Install Mozilla Build Tools
          # Configure Windows-specific mozconfig
      - name: Build Windows
        run: .\build_release.bat

  build-linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Linux Build Environment
        run: |
          sudo apt-get update
          sudo apt-get install build-essential
      - name: Build Linux
        run: ./build_release.sh
```

## Option 2: Docker Containers
Use Docker for Linux builds on any platform:

### Linux Build Container
```dockerfile
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    python3-pip \
    curl \
    git
WORKDIR /firefox-oasis
COPY . .
RUN ./mach bootstrap --no-interactive
RUN ./build_release.sh
```

## Option 3: Virtual Machines
- **Windows VM**: Use VirtualBox/VMware with Windows 10/11
- **Linux VM**: Use VirtualBox/VMware with Ubuntu 22.04
- **Each VM**: Install Mozilla build requirements

## Platform-Specific Configuration Files

### Windows: `mozconfig-release-windows`
```
# Windows-specific release build configuration
ac_add_options --enable-release
ac_add_options --disable-debug
ac_add_options --enable-optimize
ac_add_options --with-branding=browser/branding/custom
ac_add_options --disable-crashreporter
ac_add_options --disable-source-paths
ac_add_options --enable-update-channel=release
```

### Linux: `mozconfig-release-linux`
```
# Linux-specific release build configuration  
ac_add_options --enable-release
ac_add_options --disable-debug
ac_add_options --enable-optimize
ac_add_options --with-branding=browser/branding/custom
ac_add_options --disable-crashreporter
ac_add_options --disable-source-paths
ac_add_options --enable-update-channel=release
ac_add_options --enable-linker=lld
```

## Build Scripts for Each Platform

### Windows: `build_release.bat`
```batch
@echo off
echo Building Firefox Oasis for Windows...
set MOZCONFIG=mozconfig-release-windows
.\mach clobber
.\mach configure
.\mach build
echo Build complete!
```

### Linux: `build_release_linux.sh`
```bash
#!/bin/bash
echo "Building Firefox Oasis for Linux..."
export MOZCONFIG=mozconfig-release-linux
./mach clobber
./mach configure  
./mach build
echo "Build complete!"
```

## Distribution Packages by Platform

### macOS
- **DMG**: Native macOS installer format
- **PKG**: Alternative macOS package format
- **ZIP**: Universal archive format

### Windows  
- **MSI**: Windows Installer format
- **EXE**: Self-extracting installer
- **ZIP**: Universal archive format

### Linux
- **DEB**: Debian/Ubuntu package format
- **RPM**: Red Hat/Fedora package format  
- **TAR.XZ**: Universal Linux archive
- **AppImage**: Portable Linux application
- **Snap**: Universal Linux package
- **Flatpak**: Cross-distribution package

## Automated Distribution Pipeline

1. **Build**: CI/CD builds for all platforms
2. **Package**: Create platform-specific packages
3. **Sign**: Code signing for security (Windows/macOS)
4. **Upload**: Distribute via GitHub Releases or CDN
5. **Update**: Automatic update mechanism

## Getting Started

### Immediate Next Steps (macOS)
1. Complete current macOS build
2. Test and package for macOS distribution
3. Share with colleagues for testing

### Future Cross-Platform Steps
1. Set up GitHub Actions workflow
2. Create platform-specific configurations
3. Test builds on each platform
4. Implement automated packaging
5. Set up distribution infrastructure

## Cost Considerations

### Free Options
- **GitHub Actions**: 2000 minutes/month free
- **Docker Hub**: Free public repositories
- **VirtualBox**: Free virtualization

### Paid Options
- **GitHub Actions**: $0.008/minute for private repos
- **Cloud VMs**: $10-50/month per platform
- **Code Signing**: $200-400/year per platform

## Security & Signing

### Code Signing Requirements
- **macOS**: Apple Developer Certificate ($99/year)
- **Windows**: Code Signing Certificate ($200-400/year)  
- **Linux**: Optional, can use GPG signing (free)

Without code signing, users will see security warnings when installing.
