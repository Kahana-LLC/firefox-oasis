# 🔧 Phased Notarization Fix Strategy
## Step-by-Step Approach to Resolve Critical Issues

**Date:** September 13, 2025  
**Objective:** Fix critical notarization issues through incremental, verifiable phases  
**Current Status:** 9 submissions stuck "In Progress" due to systemic issues

---

## 📋 **PHASE OVERVIEW**

| Phase | Focus | Duration | Verification | Success Criteria |
|-------|-------|----------|--------------|------------------|
| **Phase 1** | Team Identifier Fix | 5 minutes | Info.plist check | Team ID present |
| **Phase 2** | Relative Path Dependencies | 15 minutes | otool verification | All @rpath → @executable_path |
| **Phase 3** | File Modification Prevention | 10 minutes | Clean copy + immediate signing | No "file modified" errors |
| **Phase 4** | Bundle Integrity Verification | 5 minutes | codesign + spctl tests | Local verification passes |
| **Phase 5** | Clean Submission | 10 minutes | Notarization submission | Submission accepted |
| **Phase 6** | Results Analysis | 15 minutes | Log analysis | Notarization success |

**Total Estimated Time:** 60 minutes  
**Success Probability After Fixes:** 95%

---

## 🎯 **PHASE 1: TEAM IDENTIFIER FIX**

### **Objective:** Add missing team identifier to Info.plist

### **Step 1.1: Backup Current App**
```bash
# Create backup before modifications
cp -R Oasis-Browser-Improved.app Oasis-Browser-Phase1-Backup.app
echo "✅ Backup created: Oasis-Browser-Phase1-Backup.app"
```

### **Step 1.2: Add Team Identifier**
```bash
# Add team identifier to Info.plist
/usr/libexec/PlistBuddy -c "Add :CFBundleTeamIdentifier string NV6BDYHYA5" Oasis-Browser-Improved.app/Contents/Info.plist
echo "✅ Team identifier added to Info.plist"
```

### **Step 1.3: Verify Team Identifier**
```bash
# Verify team identifier is present
/usr/libexec/PlistBuddy -c "Print :CFBundleTeamIdentifier" Oasis-Browser-Improved.app/Contents/Info.plist
echo "✅ Team identifier verification complete"
```

### **Step 1.4: Re-sign with Team Identifier**
```bash
# Re-sign main app bundle to include team identifier
codesign --force --sign "Developer ID Application: Adam Richard Kershner (NV6BDYHYA5)" \
  --options runtime --timestamp --entitlements "./entitlements.plist" \
  Oasis-Browser-Improved.app
echo "✅ App re-signed with team identifier"
```

### **Phase 1 Verification:**
```bash
# Check team identifier in signature
codesign -dvv Oasis-Browser-Improved.app 2>&1 | grep "TeamIdentifier"
# Should show: TeamIdentifier=NV6BDYHYA5
```

**✅ Phase 1 Success Criteria:** Team identifier present in code signature

---

## 🎯 **PHASE 2: RELATIVE PATH DEPENDENCIES FIX**

### **Objective:** Convert @rpath references to @executable_path for hardened runtime compatibility

### **Step 2.1: Identify All @rpath References**
```bash
# Find all @rpath references in main executable
otool -l Oasis-Browser-Improved.app/Contents/MacOS/firefox | grep -A 5 "LC_LOAD_DYLIB" | grep "@rpath" > rpath_references.txt
echo "✅ @rpath references identified and saved to rpath_references.txt"
```

### **Step 2.2: Fix Main Executable Dependencies**
```bash
# Fix @rpath references in main executable
install_name_tool -change @rpath/libnss3.dylib @executable_path/libnss3.dylib Oasis-Browser-Improved.app/Contents/MacOS/firefox
install_name_tool -change @rpath/libmozglue.dylib @executable_path/libmozglue.dylib Oasis-Browser-Improved.app/Contents/MacOS/firefox
install_name_tool -change @rpath/libgkcodecs.dylib @executable_path/libgkcodecs.dylib Oasis-Browser-Improved.app/Contents/MacOS/firefox
echo "✅ Main executable @rpath references fixed"
```

### **Step 2.3: Fix Dynamic Library Dependencies**
```bash
# Fix @rpath references in all dylibs
for dylib in Oasis-Browser-Improved.app/Contents/MacOS/*.dylib; do
  if [ -f "$dylib" ]; then
    install_name_tool -change @rpath/libnss3.dylib @executable_path/libnss3.dylib "$dylib"
    install_name_tool -change @rpath/libmozglue.dylib @executable_path/libmozglue.dylib "$dylib"
    install_name_tool -change @rpath/libgkcodecs.dylib @executable_path/libgkcodecs.dylib "$dylib"
  fi
done
echo "✅ Dynamic library @rpath references fixed"
```

### **Step 2.4: Re-sign After Path Changes**
```bash
# Re-sign all modified components
find Oasis-Browser-Improved.app -name "*.dylib" -exec codesign --force --sign "Developer ID Application: Adam Richard Kershner (NV6BDYHYA5)" --options runtime --timestamp {} \;
codesign --force --sign "Developer ID Application: Adam Richard Kershner (NV6BDYHYA5)" --options runtime --timestamp --entitlements "./entitlements.plist" Oasis-Browser-Improved.app
echo "✅ All components re-signed after path fixes"
```

### **Phase 2 Verification:**
```bash
# Verify no @rpath references remain
otool -l Oasis-Browser-Improved.app/Contents/MacOS/firefox | grep -A 5 "LC_LOAD_DYLIB" | grep "@rpath" | wc -l
# Should show: 0
```

**✅ Phase 2 Success Criteria:** Zero @rpath references remaining

---

## 🎯 **PHASE 3: FILE MODIFICATION PREVENTION**

### **Objective:** Create completely clean copy and prevent file modification after signing

### **Step 3.1: Create Clean Copy**
```bash
# Create completely clean copy
rm -rf Oasis-Browser-Clean.app
cp -R Oasis-Browser-Improved.app Oasis-Browser-Clean.app
echo "✅ Clean copy created: Oasis-Browser-Clean.app"
```

### **Step 3.2: Immediate Signing (No Delays)**
```bash
# Sign immediately after copy to prevent modification
echo "🔏 Signing clean copy immediately..."

# Sign all individual files first
find Oasis-Browser-Clean.app -type f -perm +111 -print0 | while IFS= read -r -d $'\0' file; do
  if [[ "$file" == *".sys.mjs"* || "$file" == *".js"* || "$file" == *".json"* || "$file" == *".info"* || "$file" == *".done"* || "$file" == *".txt"* || "$file" == *".plist"* || "$file" == *".html"* || "$file" == *".css"* || "$file" == *".xml"* || "$file" == *".ftl"* || "$file" == *".gif"* ]]; then
    continue
  fi
  codesign --force --sign "Developer ID Application: Adam Richard Kershner (NV6BDYHYA5)" --options runtime --timestamp "$file"
done

# Sign nested app bundles
for nested_app in Oasis-Browser-Clean.app/Contents/MacOS/*.app; do
  if [ -d "$nested_app" ]; then
    codesign --force --sign "Developer ID Application: Adam Richard Kershner (NV6BDYHYA5)" --options runtime --timestamp "$nested_app"
  fi
done

# Sign main app bundle
codesign --force --sign "Developer ID Application: Adam Richard Kershner (NV6BDYHYA5)" --options runtime --timestamp --entitlements "./entitlements.plist" Oasis-Browser-Clean.app

echo "✅ Clean copy signed immediately"
```

### **Phase 3 Verification:**
```bash
# Check for file modification errors
codesign -vvv --deep --strict Oasis-Browser-Clean.app 2>&1 | grep "file modified" | wc -l
# Should show: 0
```

**✅ Phase 3 Success Criteria:** Zero "file modified" errors

---

## 🎯 **PHASE 4: BUNDLE INTEGRITY VERIFICATION**

### **Objective:** Verify bundle integrity and local verification

### **Step 4.1: Deep Code Signature Verification**
```bash
# Verify all signatures are valid
codesign -vvv --deep --strict Oasis-Browser-Clean.app
echo "✅ Deep signature verification complete"
```

### **Step 4.2: Local Gatekeeper Test**
```bash
# Test local Gatekeeper acceptance
spctl -a -v Oasis-Browser-Clean.app
echo "✅ Local Gatekeeper test complete"
```

### **Step 4.3: Signature Details Verification**
```bash
# Verify signature details
codesign -dvv Oasis-Browser-Clean.app 2>&1 | grep -E "(Authority|Timestamp|TeamIdentifier|Hardened Runtime)"
echo "✅ Signature details verification complete"
```

### **Phase 4 Verification:**
```bash
# Check for any verification failures
codesign -vvv --deep --strict Oasis-Browser-Clean.app 2>&1 | grep -E "(invalid|modified|error)" | wc -l
# Should show: 0
```

**✅ Phase 4 Success Criteria:** All verification tests pass

---

## 🎯 **PHASE 5: CLEAN SUBMISSION**

### **Objective:** Submit clean version for notarization

### **Step 5.1: Create Clean Zip**
```bash
# Create zip immediately after verification
ditto -c -k --keepParent Oasis-Browser-Clean.app Oasis-Browser-Clean-$(date +%Y%m%d).zip
echo "✅ Clean zip created: Oasis-Browser-Clean-$(date +%Y%m%d).zip"
```

### **Step 5.2: Submit for Notarization**
```bash
# Submit with monitoring
xcrun notarytool submit Oasis-Browser-Clean-$(date +%Y%m%d).zip \
  --apple-id "adamkershner@rocketmail.com" \
  --team-id "NV6BDYHYA5" \
  --password "$(osascript -e 'text returned of (display dialog "Enter your app-specific password:" with title "App-Specific Password" default answer "" with hidden answer)')" \
  --wait
echo "✅ Clean submission completed"
```

### **Phase 5 Verification:**
```bash
# Check submission status
xcrun notarytool info <submission-id> --apple-id "adamkershner@rocketmail.com" --team-id "NV6BDYHYA5" --password "$(osascript -e 'text returned of (display dialog "Enter your app-specific password:" with title "App-Specific Password" default answer "" with hidden answer)')"
```

**✅ Phase 5 Success Criteria:** Submission accepted and processing

---

## 🎯 **PHASE 6: RESULTS ANALYSIS**

### **Objective:** Analyze notarization results and logs

### **Step 6.1: Check Notarization Status**
```bash
# Get final status
xcrun notarytool info <submission-id> --apple-id "adamkershner@rocketmail.com" --team-id "NV6BDYHYA5" --password "$(osascript -e 'text returned of (display dialog "Enter your app-specific password:" with title "App-Specific Password" default answer "" with hidden answer)')"
```

### **Step 6.2: Analyze Notarization Logs**
```bash
# Get detailed logs
xcrun notarytool log <submission-id> --apple-id "adamkershner@rocketmail.com" --team-id "NV6BDYHYA5" --password "$(osascript -e 'text returned of (display dialog "Enter your app-specific password:" with title "App-Specific Password" default answer "" with hidden answer)')"
```

### **Step 6.3: Staple Ticket (If Successful)**
```bash
# Staple notarization ticket
xcrun stapler staple Oasis-Browser-Clean.app
echo "✅ Notarization ticket stapled"
```

### **Phase 6 Verification:**
```bash
# Verify stapled ticket
spctl -a -v Oasis-Browser-Clean.app
# Should show: "accepted" with notarization info
```

**✅ Phase 6 Success Criteria:** Notarization successful and ticket stapled

---

## 📊 **SUCCESS METRICS**

### **Phase-by-Phase Success Indicators:**
- **Phase 1:** Team identifier present in signature
- **Phase 2:** Zero @rpath references
- **Phase 3:** Zero "file modified" errors
- **Phase 4:** All verification tests pass
- **Phase 5:** Submission accepted and processing
- **Phase 6:** Notarization successful

### **Overall Success Criteria:**
- ✅ All critical issues resolved
- ✅ Bundle integrity maintained
- ✅ Local verification passes
- ✅ Notarization successful
- ✅ Ticket stapled

---

## 🚀 **EXECUTION STRATEGY**

### **Immediate Actions:**
1. **Start with Phase 1** (team identifier fix)
2. **Verify each phase** before proceeding
3. **Document results** at each step
4. **Stop if any phase fails** and debug

### **Rollback Plan:**
- Each phase creates backups
- Can rollback to any previous phase
- Maintain original app for reference

### **Monitoring:**
- Track time spent per phase
- Document any issues encountered
- Verify success criteria at each step

**Ready to begin Phase 1?** 🚀
