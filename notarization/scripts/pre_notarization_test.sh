#!/bin/bash

# Comprehensive Pre-Notarization Test
# This tests everything that could cause notarization failure

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔍 Comprehensive Pre-Notarization Test${NC}"
echo "=============================================="

# Test 1: Check for file modifications after signing
test_file_modifications() {
    echo -e "${YELLOW}📁 Test 1: Checking for file modifications after signing...${NC}"
    
    local app_path="$1"
    local modified_files=0
    
    # Check for file modification errors
    if codesign -vvv --deep --strict "$app_path" 2>&1 | grep -q "file modified"; then
        modified_files=$(codesign -vvv --deep --strict "$app_path" 2>&1 | grep "file modified" | wc -l)
        echo -e "${RED}❌ Found $modified_files files with modification errors${NC}"
        echo -e "${YELLOW}⚠️  This could cause notarization failure${NC}"
        return 1
    else
        echo -e "${GREEN}✅ No file modification errors detected${NC}"
        return 0
    fi
}

# Test 2: Verify signature integrity
test_signature_integrity() {
    echo -e "${YELLOW}🔐 Test 2: Verifying signature integrity...${NC}"
    
    local app_path="$1"
    
    # Check main app signature
    if codesign -vvv --deep --strict "$app_path" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Main app signature verification passed${NC}"
    else
        echo -e "${RED}❌ Main app signature verification failed${NC}"
        codesign -vvv --deep --strict "$app_path" 2>&1 | head -10
        return 1
    fi
    
    # Check for any unsigned components
    local unsigned_count=$(codesign -vvv --deep --strict "$app_path" 2>&1 | grep "not signed" | wc -l)
    if [ "$unsigned_count" -gt 0 ]; then
        echo -e "${RED}❌ Found $unsigned_count unsigned components${NC}"
        return 1
    else
        echo -e "${GREEN}✅ All components properly signed${NC}"
    fi
    
    return 0
}

# Test 3: Check certificate and authority chain
test_certificate_chain() {
    echo -e "${YELLOW}🏛️  Test 3: Verifying certificate and authority chain...${NC}"
    
    local app_path="$1"
    local signature_info=$(codesign -dvv "$app_path" 2>&1)
    
    # Check for Developer ID certificate
    if echo "$signature_info" | grep -q "Developer ID Application"; then
        echo -e "${GREEN}✅ Developer ID Application certificate found${NC}"
    else
        echo -e "${RED}❌ Developer ID Application certificate not found${NC}"
        return 1
    fi
    
    # Check for proper authority chain
    if echo "$signature_info" | grep -q "Apple Root CA"; then
        echo -e "${GREEN}✅ Complete authority chain to Apple Root CA${NC}"
    else
        echo -e "${RED}❌ Incomplete authority chain${NC}"
        return 1
    fi
    
    # Check team identifier
    if echo "$signature_info" | grep -q "TeamIdentifier=NV6BDYHYA5"; then
        echo -e "${GREEN}✅ Team identifier correctly set${NC}"
    else
        echo -e "${RED}❌ Team identifier not set or incorrect${NC}"
        return 1
    fi
    
    return 0
}

# Test 4: Check hardened runtime
test_hardened_runtime() {
    echo -e "${YELLOW}🛡️  Test 4: Verifying hardened runtime...${NC}"
    
    local app_path="$1"
    local signature_info=$(codesign -dvv "$app_path" 2>&1)
    
    if echo "$signature_info" | grep -q "runtime"; then
        echo -e "${GREEN}✅ Hardened runtime enabled${NC}"
        return 0
    else
        echo -e "${RED}❌ Hardened runtime not enabled${NC}"
        return 1
    fi
}

# Test 5: Check entitlements
test_entitlements() {
    echo -e "${YELLOW}📋 Test 5: Verifying entitlements...${NC}"
    
    local app_path="$1"
    
    # Check if entitlements are embedded
    if codesign -d --entitlements - "$app_path" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Entitlements properly embedded${NC}"
        
        # Show entitlements for review
        echo -e "${YELLOW}📄 Current entitlements:${NC}"
        codesign -d --entitlements - "$app_path" 2>/dev/null | head -20
        echo -e "${YELLOW}... (showing first 20 lines)${NC}"
    else
        echo -e "${RED}❌ No entitlements found${NC}"
        return 1
    fi
    
    return 0
}

# Test 6: Check bundle structure
test_bundle_structure() {
    echo -e "${YELLOW}📦 Test 6: Checking bundle structure...${NC}"
    
    local app_path="$1"
    
    # Check for required bundle components
    if [ -f "$app_path/Contents/Info.plist" ]; then
        echo -e "${GREEN}✅ Info.plist found${NC}"
    else
        echo -e "${RED}❌ Info.plist missing${NC}"
        return 1
    fi
    
    if [ -f "$app_path/Contents/MacOS/firefox" ]; then
        echo -e "${GREEN}✅ Main executable found${NC}"
    else
        echo -e "${RED}❌ Main executable missing${NC}"
        return 1
    fi
    
    # Check bundle identifier
    local bundle_id=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$app_path/Contents/Info.plist" 2>/dev/null)
    if [ "$bundle_id" = "org.mozilla.com.oasis.browser" ]; then
        echo -e "${GREEN}✅ Bundle identifier correct: $bundle_id${NC}"
    else
        echo -e "${YELLOW}⚠️  Bundle identifier: $bundle_id${NC}"
    fi
    
    return 0
}

# Test 7: Check for problematic files
test_problematic_files() {
    echo -e "${YELLOW}🚨 Test 7: Checking for problematic files...${NC}"
    
    local app_path="$1"
    
    # Check for files that might cause issues
    local problematic_files=$(find "$app_path" -name "*.done" -o -name ".mkdir.done" 2>/dev/null | wc -l)
    if [ "$problematic_files" -gt 0 ]; then
        echo -e "${YELLOW}⚠️  Found $problematic_files potentially problematic files${NC}"
        find "$app_path" -name "*.done" -o -name ".mkdir.done" 2>/dev/null | head -5
        echo -e "${YELLOW}⚠️  These might cause notarization issues${NC}"
    else
        echo -e "${GREEN}✅ No obviously problematic files found${NC}"
    fi
    
    return 0
}

# Main test function
run_comprehensive_test() {
    local app_path="$1"
    local test_results=0
    
    echo -e "${BLUE}Testing app: $app_path${NC}"
    echo ""
    
    test_file_modifications "$app_path" || test_results=$((test_results + 1))
    echo ""
    
    test_signature_integrity "$app_path" || test_results=$((test_results + 1))
    echo ""
    
    test_certificate_chain "$app_path" || test_results=$((test_results + 1))
    echo ""
    
    test_hardened_runtime "$app_path" || test_results=$((test_results + 1))
    echo ""
    
    test_entitlements "$app_path" || test_results=$((test_results + 1))
    echo ""
    
    test_bundle_structure "$app_path" || test_results=$((test_results + 1))
    echo ""
    
    test_problematic_files "$app_path" || test_results=$((test_results + 1))
    echo ""
    
    # Summary
    echo -e "${BLUE}📊 Test Summary:${NC}"
    if [ $test_results -eq 0 ]; then
        echo -e "${GREEN}✅ All tests passed! App appears ready for notarization.${NC}"
        echo -e "${YELLOW}⚠️  However, Apple's notarization service may still reject it.${NC}"
        echo -e "${YELLOW}⚠️  The only way to know for sure is to submit it.${NC}"
    else
        echo -e "${RED}❌ $test_results test(s) failed. App may not pass notarization.${NC}"
        echo -e "${YELLOW}💡 Consider fixing these issues before submission.${NC}"
    fi
    
    return $test_results
}

# Find the test app
find_test_app() {
    if [ -d "Oasis-Browser-clean-test.app" ]; then
        echo "Oasis-Browser-clean-test.app"
    elif [ -d "Oasis-Browser-direct-test.app" ]; then
        echo "Oasis-Browser-direct-test.app"
    elif [ -d "Oasis-Browser-rcodesign-test.app" ]; then
        echo "Oasis-Browser-rcodesign-test.app"
    else
        echo -e "${RED}❌ No test app found. Please run ./test_rcodesign.sh first.${NC}"
        exit 1
    fi
}

# Main execution
main() {
    local test_app
    test_app=$(find_test_app)
    
    run_comprehensive_test "$test_app"
    
    echo ""
    echo -e "${BLUE}💡 Next Steps:${NC}"
    echo "1. If tests passed, you can try submitting for notarization"
    echo "2. If tests failed, fix the issues before submission"
    echo "3. Remember: Apple's service is the final test"
}

# Run main function
main "$@"
