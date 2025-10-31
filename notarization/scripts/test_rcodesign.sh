#!/bin/bash

# Test script for rcodesign integration
# This will test rcodesign signing on your current Firefox build

set -e

# Configuration
CERTIFICATE_ID="Developer ID Application: Adam Richard Kershner (NV6BDYHYA5)"
ENTITLEMENTS_FILE="./entitlements.plist"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🧪 Testing rcodesign Integration${NC}"
echo "=================================="

# Find the latest Firefox build
find_firefox_build() {
    local build_dir="obj-aarch64-apple-darwin24.6.0/dist"
    if [ -d "$build_dir" ]; then
        # Look for the main app bundle
        if [ -d "$build_dir/Oasis.app" ]; then
            echo "$build_dir/Oasis.app"
        elif [ -d "$build_dir/Oasis-Signed.app" ]; then
            echo "$build_dir/Oasis-Signed.app"
        elif [ -d "$build_dir/Oasis-Mozilla-Signed.app" ]; then
            echo "$build_dir/Oasis-Mozilla-Signed.app"
        else
            echo -e "${RED}❌ No Oasis app bundle found in $build_dir${NC}"
            exit 1
        fi
    else
        echo -e "${RED}❌ Build directory not found: $build_dir${NC}"
        echo "Please run './mach build' first"
        exit 1
    fi
}

# Test rcodesign signing on a small component first
test_rcodesign_signing() {
    local app_path="$1"
    local test_app="Oasis-Browser-rcodesign-test.app"
    
    echo -e "${YELLOW}🔧 Testing rcodesign signing...${NC}"
    
    # Create test copy
    if [ -d "$test_app" ]; then
        rm -rf "$test_app"
    fi
    cp -R "$app_path" "$test_app"
    
    echo -e "${YELLOW}📝 Testing rcodesign sign command...${NC}"
    
    # Test the rcodesign sign command (dry run first)
    echo "Command to run:"
    echo "rcodesign sign --for-notarization --p12-file \"developer_id.p12\" --p12-password \"<password>\" --code-signature-flags runtime --entitlements-xml-file \"$ENTITLEMENTS_FILE\" \"$test_app\""
    
    # Ask user if they want to proceed
    echo -e "${YELLOW}🤔 Do you want to proceed with the test signing? (y/n)${NC}"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}🔏 Running rcodesign sign...${NC}"
        
        echo "Enter password for developer_id.p12:"
        read -s P12_PASSWORD
        
        rcodesign sign \
            --for-notarization \
            --p12-file "developer_id.p12" \
            --p12-password "$P12_PASSWORD" \
            --code-signature-flags runtime \
            --entitlements-xml-file "$ENTITLEMENTS_FILE" \
            "$test_app"
        
        echo -e "${GREEN}✅ rcodesign signing completed!${NC}"
        
        # Verify the signature
        echo -e "${YELLOW}🔍 Verifying signature...${NC}"
        
        # Check signature details
        echo -e "${YELLOW}📋 Signature details:${NC}"
        codesign -dvv "$test_app" 2>&1 | grep -E "(Authority|TeamIdentifier|Hardened Runtime|Signature)"
        
        # Check if it's properly signed with Developer ID
        if codesign -dvv "$test_app" 2>&1 | grep -q "Developer ID Application"; then
            echo -e "${GREEN}✅ Successfully signed with Developer ID certificate!${NC}"
        else
            echo -e "${RED}❌ Not signed with Developer ID certificate${NC}"
        fi
        
        # Check if hardened runtime is enabled
        if codesign -dvv "$test_app" 2>&1 | grep -q "runtime"; then
            echo -e "${GREEN}✅ Hardened runtime enabled${NC}"
        else
            echo -e "${RED}❌ Hardened runtime not enabled${NC}"
        fi
        
    else
        echo -e "${BLUE}⏭️  Skipping test signing${NC}"
    fi
    
    # Keep test app for further testing
    echo -e "${GREEN}📁 Test app preserved: $test_app${NC}"
    echo -e "${BLUE}💡 You can now run: ./pre_notarization_test.sh${NC}"
}

# Main execution
main() {
    # Find Firefox build
    local source_app
    source_app=$(find_firefox_build)
    echo -e "${GREEN}✅ Found Firefox build: $source_app${NC}"
    
    # Test rcodesign signing
    test_rcodesign_signing "$source_app"
    
    echo -e "${GREEN}🎉 rcodesign test completed!${NC}"
    echo -e "${BLUE}💡 If the test was successful, you can run the full notarization script:${NC}"
    echo "./rcodesign_notarization.sh"
}

# Run main function
main "$@"
