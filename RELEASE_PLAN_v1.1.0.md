# Oasis Browser v1.1.0 Release Plan

## 🎯 Release Goal
**Fix the critical build issues** that make the current Oasis Browser completely non-functional and create a working, self-contained application bundle.

## 🚨 Critical Issues to Fix

### 1. Broken Development Symlinks
**Problem**: 15 out of 16 component manifests are broken symlinks pointing to development paths
**Solution**: Build all components into the `.app` bundle with actual content

### 2. Missing XPCOM Libraries
**Problem**: Core XPCOM libraries (`libxpcom.dylib`, `xpcomglue.dylib`) are missing
**Solution**: Ensure proper build configuration includes all XPCOM components

### 3. Incomplete Application Bundle
**Problem**: Missing essential browser components and dependencies
**Solution**: Create self-contained bundle with all required components

## 📋 Release Tasks

### Phase 1: Build Configuration Fixes
- [ ] **Update `mozconfig-release`** with proper application packaging settings
- [ ] **Add `--enable-application=browser`** to build configuration
- [ ] **Ensure all components are built** into the application bundle
- [ ] **Remove development path dependencies**

### Phase 2: Component Packaging
- [ ] **Verify XPCOM libraries** are included in the bundle
- [ ] **Package component manifests** with actual content (not symlinks)
- [ ] **Include all browser engine components**
- [ ] **Ensure self-contained bundle** with no external dependencies

### Phase 3: Testing and Validation
- [ ] **Test on clean macOS installation**
- [ ] **Verify application launches** without "Couldn't load XPCOM" error
- [ ] **Test browser functionality** (navigation, tabs, settings, etc.)
- [ ] **Validate all components load correctly**

### Phase 4: Packaging and Distribution
- [ ] **Update packaging scripts** for the fixed build
- [ ] **Create proper DMG/ZIP packages**
- [ ] **Add uninstallation instructions**
- [ ] **Update documentation**

## 🔧 Technical Implementation

### Updated Build Configuration
```bash
# Enhanced mozconfig-release for v1.1.0
ac_add_options --enable-application=browser
ac_add_options --enable-release
ac_add_options --disable-debug
ac_add_options --enable-optimize
ac_add_options --with-branding=browser/branding/custom
ac_add_options --disable-crashreporter
ac_add_options --disable-source-paths
ac_add_options --enable-update-channel=release

# Ensure proper packaging
ac_add_options --enable-package
ac_add_options --enable-install-strip
```

### Build Process
```bash
# Clean previous broken build
./mach clobber

# Configure with fixed settings
export MOZCONFIG=mozconfig-release
./mach configure

# Build the application
./mach build

# Package the application
./mach package
```

### Quality Assurance Checklist
- [ ] Application launches without errors
- [ ] All components are self-contained within the bundle
- [ ] No broken symlinks or development paths
- [ ] XPCOM loads successfully
- [ ] Browser functionality works as expected
- [ ] Tested on clean macOS installations
- [ ] No external dependencies on development environments

## 📦 Expected Deliverables

### Application Bundle
- **Self-contained** `.app` bundle with all components
- **No broken symlinks** or development path dependencies
- **Complete XPCOM** component system
- **Working browser** functionality

### Distribution Packages
- **DMG installer** with proper branding
- **ZIP archive** for alternative distribution
- **Uninstallation instructions** for users
- **Release notes** documenting fixes

### Documentation
- **Updated developer guide** with working build process
- **Installation instructions** for end users
- **Troubleshooting guide** for common issues

## 🎯 Success Criteria

### Functional Requirements
- ✅ Application launches successfully on clean macOS
- ✅ No "Couldn't load XPCOM" errors
- ✅ All browser features work correctly
- ✅ Self-contained bundle with no external dependencies

### Quality Requirements
- ✅ Tested on multiple macOS versions
- ✅ No development artifacts in production build
- ✅ Proper error handling and user feedback
- ✅ Clean uninstallation process

## 📅 Timeline

### Week 1: Build Configuration
- Fix `mozconfig-release` settings
- Test build process
- Verify component inclusion

### Week 2: Testing and Validation
- Test on clean macOS installations
- Fix any remaining issues
- Validate all functionality

### Week 3: Packaging and Documentation
- Create distribution packages
- Update documentation
- Prepare release notes

### Week 4: Final Testing and Release
- Final testing on multiple systems
- Create release packages
- Deploy to users

## 🔍 Risk Mitigation

### Technical Risks
- **Build complexity**: Use Mozilla's standard build processes
- **Component dependencies**: Ensure all required components are included
- **Platform compatibility**: Test on multiple macOS versions

### Process Risks
- **Incomplete testing**: Implement comprehensive testing checklist
- **User experience**: Provide clear installation and uninstallation instructions
- **Documentation**: Keep documentation updated with build process

## 📊 Metrics for Success

### Technical Metrics
- **Launch success rate**: 100% on clean macOS installations
- **Component loading**: All XPCOM components load successfully
- **Bundle size**: Reasonable size with all required components

### User Experience Metrics
- **Installation success**: Users can install without issues
- **Functionality**: All browser features work as expected
- **Uninstallation**: Clean removal process

---

**Goal**: Transform Oasis Browser from a broken development build into a fully functional, self-contained application that users can actually use.

**Priority**: **CRITICAL** - Current build is completely non-functional and must be fixed before any other features can be added.
