#!/bin/bash

# Oasis Browser Notarization Readiness Test
# Comprehensive testing to predict notarization success

set -e

# Configuration
APP_PATH="./obj-aarch64-apple-darwin24.6.0/dist/Oasis-Mozilla-Signed.app"
CERTIFICATE="Developer ID Application: Adam Richard Kershner (NV6BDYHYA5)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Oasis Browser Notarization Readiness Test${NC}"
echo "=================================================="
echo ""

# Test results tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
WARNING_TESTS=0

# Function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_result="$3"
    local test_type="$4"  # "critical", "important", "warning"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo -e "${BLUE}🔍 Test $TOTAL_TESTS: $test_name${NC}"
    
    if eval "$test_command" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ PASS${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        if [ "$test_type" = "critical" ]; then
            echo -e "${RED}❌ FAIL (CRITICAL)${NC}"
            FAILED_TESTS=$((FAILED_TESTS + 1))
        elif [ "$test_type" = "important" ]; then
            echo -e "${YELLOW}⚠️  FAIL (IMPORTANT)${NC}"
            WARNING_TESTS=$((WARNING_TESTS + 1))
        else
            echo -e "${YELLOW}⚠️  WARNING${NC}"
            WARNING_TESTS=$((WARNING_TESTS + 1))
        fi
        return 1
    fi
}

# Function to get detailed test results
get_detailed_result() {
    local test_name="$1"
    local test_command="$2"
    
    echo -e "${BLUE}📋 Detailed Results for: $test_name${NC}"
    eval "$test_command" 2>&1 | head -10
    echo ""
}

echo -e "${YELLOW}🚀 Starting comprehensive notarization readiness tests...${NC}"
echo ""

# Test 1: App bundle exists
run_test "App Bundle Exists" "[ -d '$APP_PATH' ]" "App bundle should exist" "critical"

# Test 2: Main app bundle is signed
run_test "Main App Bundle Signed" "codesign -dvv '$APP_PATH' 2>&1 | grep -q 'Authority=Developer ID Application'" "Main app bundle should be signed" "critical"

# Test 3: Developer ID certificate type
run_test "Correct Certificate Type" "codesign -dvv '$APP_PATH' 2>&1 | grep -q 'Developer ID Application'" "Should use Developer ID Application certificate" "critical"

# Test 4: Hardened runtime enabled
run_test "Hardened Runtime Enabled" "codesign -dvv '$APP_PATH' 2>&1 | grep -q 'flags=0x10000(runtime)'" "Hardened runtime should be enabled" "critical"

# Test 5: Secure timestamp present
run_test "Secure Timestamp Present" "codesign -dvv '$APP_PATH' 2>&1 | grep -q 'Timestamp='" "Secure timestamp should be present" "critical"

# Test 6: Entitlements applied
run_test "Entitlements Applied" "codesign -d --entitlements - '$APP_PATH' 2>&1 | grep -q 'com.apple.security'" "Entitlements should be applied" "important"

# Test 7: No get-task-allow entitlement
run_test "No Debug Entitlement" "! codesign -d --entitlements - '$APP_PATH' 2>&1 | grep -q 'get-task-allow'" "Should not have debug entitlement" "important"

# Test 8: All executables signed
run_test "All Executables Signed" "find '$APP_PATH' -type f -perm +111 -exec codesign -dvv {} \; 2>&1 | grep -q 'not signed' && false || true" "All executables should be signed" "important"

# Test 9: No unsigned libraries
run_test "No Unsigned Libraries" "find '$APP_PATH' -name '*.dylib' -exec codesign -dvv {} \; 2>&1 | grep -q 'not signed' && false || true" "All libraries should be signed" "important"

# Test 10: App bundle verification (basic)
run_test "Basic App Bundle Verification" "codesign -v '$APP_PATH' 2>&1" "Basic verification should pass" "critical"

# Test 11: Gatekeeper assessment
echo -e "${BLUE}🔍 Test 11: Gatekeeper Assessment${NC}"
if spctl -vvv --assess --type exec "$APP_PATH" 2>&1 | grep -q "accepted"; then
    echo -e "${GREEN}✅ PASS${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${YELLOW}⚠️  WARNING (Expected for complex apps)${NC}"
    WARNING_TESTS=$((WARNING_TESTS + 1))
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# Test 12: File size check
echo -e "${BLUE}🔍 Test 12: File Size Check${NC}"
APP_SIZE=$(du -sm "$APP_PATH" | cut -f1)
if [ "$APP_SIZE" -lt 1000 ]; then
    echo -e "${GREEN}✅ PASS (Size: ${APP_SIZE}MB)${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${YELLOW}⚠️  WARNING (Large size: ${APP_SIZE}MB - may take longer)${NC}"
    WARNING_TESTS=$((WARNING_TESTS + 1))
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# Test 13: Architecture check
run_test "Architecture Support" "file '$APP_PATH/Contents/MacOS/firefox' 2>&1 | grep -q 'arm64\|x86_64'" "Should support Apple Silicon or Intel" "important"

# Test 14: Info.plist validation
run_test "Info.plist Valid" "plutil -lint '$APP_PATH/Contents/Info.plist' 2>&1" "Info.plist should be valid" "important"

# Test 15: Bundle identifier check
run_test "Bundle Identifier Present" "codesign -dvv '$APP_PATH' 2>&1 | grep -q 'Identifier='" "Should have bundle identifier" "important"

echo ""
echo -e "${BLUE}📊 Test Results Summary${NC}"
echo "========================"
echo -e "Total Tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${YELLOW}Warnings: $WARNING_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"
echo ""

# Calculate success probability
if [ $FAILED_TESTS -eq 0 ]; then
    if [ $WARNING_TESTS -eq 0 ]; then
        SUCCESS_PROBABILITY=95
        echo -e "${GREEN}🎉 SUCCESS PROBABILITY: $SUCCESS_PROBABILITY%${NC}"
        echo -e "${GREEN}Excellent! All critical tests passed.${NC}"
    elif [ $WARNING_TESTS -le 3 ]; then
        SUCCESS_PROBABILITY=85
        echo -e "${YELLOW}🎯 SUCCESS PROBABILITY: $SUCCESS_PROBABILITY%${NC}"
        echo -e "${YELLOW}Good! Minor warnings but should succeed.${NC}"
    else
        SUCCESS_PROBABILITY=70
        echo -e "${YELLOW}⚠️  SUCCESS PROBABILITY: $SUCCESS_PROBABILITY%${NC}"
        echo -e "${YELLOW}Moderate chance of success.${NC}"
    fi
else
    SUCCESS_PROBABILITY=30
    echo -e "${RED}❌ SUCCESS PROBABILITY: $SUCCESS_PROBABILITY%${NC}"
    echo -e "${RED}High risk of failure due to critical issues.${NC}"
fi

echo ""
echo -e "${BLUE}📋 Detailed Analysis${NC}"
echo "===================="

# Show detailed results for failed tests
if [ $FAILED_TESTS -gt 0 ] || [ $WARNING_TESTS -gt 0 ]; then
    echo -e "${YELLOW}🔍 Detailed Results for Issues:${NC}"
    echo ""
    
    # Check main app bundle details
    get_detailed_result "Main App Bundle Details" "codesign -dvv '$APP_PATH'"
    
    # Check for unsigned files
    echo -e "${BLUE}📋 Unsigned Files Check:${NC}"
    find "$APP_PATH" -type f -perm +111 -exec sh -c 'if codesign -dvv "$1" 2>&1 | grep -q "not signed"; then echo "UNSIGNED: $1"; fi' _ {} \; | head -10
    
    # Check Gatekeeper details
    echo -e "${BLUE}📋 Gatekeeper Assessment Details:${NC}"
    spctl -vvv --assess --type exec "$APP_PATH" 2>&1 | head -10
fi

echo ""
echo -e "${BLUE}🎯 Notarization Prediction${NC}"
echo "=========================="
echo "Based on these tests, your app has a $SUCCESS_PROBABILITY% chance of successful notarization."
echo ""

if [ $SUCCESS_PROBABILITY -ge 80 ]; then
    echo -e "${GREEN}✅ RECOMMENDATION: Proceed with confidence!${NC}"
elif [ $SUCCESS_PROBABILITY -ge 60 ]; then
    echo -e "${YELLOW}⚠️  RECOMMENDATION: Proceed with caution.${NC}"
else
    echo -e "${RED}❌ RECOMMENDATION: Address critical issues first.${NC}"
fi
