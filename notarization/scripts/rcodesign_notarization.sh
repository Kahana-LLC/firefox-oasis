#!/bin/bash

# rcodesign-based Notarization Script for Oasis Browser
# Based on Mozilla's proven approach for Firefox notarization

set -e

# Configuration
APP_NAME="Oasis-Browser"
CERTIFICATE_ID="Developer ID Application: Adam Richard Kershner (NV6BDYHYA5)"
TEAM_ID="NV6BDYHYA5"
APPLE_ID="adamkershner@rocketmail.com"
ENTITLEMENTS_FILE="./entitlements.plist"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔧 rcodesign-based Notarization for Oasis Browser${NC}"
echo "=================================================="

# Function to check if rcodesign is available
check_rcodesign() {
    if ! command -v rcodesign &> /dev/null; then
        echo -e "${RED}❌ rcodesign not found. Please install it first:${NC}"
        echo "cargo install apple-codesign"
        exit 1
    fi
    echo -e "${GREEN}✅ rcodesign found: $(rcodesign --version)${NC}"
}

# Function to find the latest Firefox build
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

# Function to create a clean copy for signing
create_clean_copy() {
    local source_app="$1"
    local clean_app="Oasis-Browser-rcodesign.app"
    
    echo -e "${YELLOW}📁 Creating clean copy for rcodesign signing...${NC}"
    
    # Remove existing clean copy
    if [ -d "$clean_app" ]; then
        rm -rf "$clean_app"
    fi
    
    # Create clean copy
    cp -R "$source_app" "$clean_app"
    echo -e "${GREEN}✅ Clean copy created: $clean_app${NC}"
    
    echo "$clean_app"
}

# Function to sign with rcodesign
sign_with_rcodesign() {
    local app_path="$1"
    
    echo -e "${YELLOW}🔏 Signing with rcodesign...${NC}"
    
    # Sign with rcodesign using the --for-notarization flag
    rcodesign sign \
        --for-notarization \
        --keychain-fingerprint "12BEB164C43858BE7F4F06AAD2CF67FEEF4FBEE0" \
        --code-signature-flags runtime \
        --entitlements-xml-file "$ENTITLEMENTS_FILE" \
        "$app_path"
    
    echo -e "${GREEN}✅ App signed with rcodesign${NC}"
}

# Function to verify the signature
verify_signature() {
    local app_path="$1"
    
    echo -e "${YELLOW}🔍 Verifying signature...${NC}"
    
    # Verify with rcodesign
    rcodesign verify "$app_path"
    
    # Also verify with Apple's tools
    codesign -vvv --deep --strict "$app_path"
    
    echo -e "${GREEN}✅ Signature verification passed${NC}"
}

# Function to create zip for notarization
create_notarization_zip() {
    local app_path="$1"
    local zip_name="Oasis-Browser-rcodesign-$(date +%Y%m%d).zip"
    
    echo -e "${YELLOW}📦 Creating zip for notarization...${NC}"
    
    # Create zip using ditto (preserves extended attributes)
    ditto -c -k --keepParent "$app_path" "$zip_name"
    
    echo -e "${GREEN}✅ Zip created: $zip_name${NC}"
    echo "$zip_name"
}

# Function to submit for notarization
submit_for_notarization() {
    local zip_path="$1"
    
    echo -e "${YELLOW}🚀 Submitting for notarization...${NC}"
    
    # Get app-specific password
    echo "Please enter your app-specific password:"
    read -s APP_PASSWORD
    
    # Submit for notarization
    rcodesign notary-submit \
        --apple-id "$APPLE_ID" \
        --team-id "$TEAM_ID" \
        --password "$APP_PASSWORD" \
        --wait \
        --staple \
        "$zip_path"
    
    echo -e "${GREEN}✅ Notarization completed successfully!${NC}"
}

# Main execution
main() {
    echo -e "${BLUE}Starting rcodesign-based notarization process...${NC}"
    
    # Check prerequisites
    check_rcodesign
    
    # Find Firefox build
    local source_app
    source_app=$(find_firefox_build)
    echo -e "${GREEN}✅ Found Firefox build: $source_app${NC}"
    
    # Create clean copy
    local clean_app
    clean_app=$(create_clean_copy "$source_app")
    
    # Sign with rcodesign
    sign_with_rcodesign "$clean_app"
    
    # Verify signature
    verify_signature "$clean_app"
    
    # Create zip for notarization
    local zip_file
    zip_file=$(create_notarization_zip "$clean_app")
    
    # Ask user if they want to submit for notarization
    echo -e "${YELLOW}🤔 Do you want to submit for notarization now? (y/n)${NC}"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        submit_for_notarization "$zip_file"
    else
        echo -e "${BLUE}📋 Ready for manual submission:${NC}"
        echo "Zip file: $zip_file"
        echo "Use: rcodesign notary-submit --apple-id $APPLE_ID --team-id $TEAM_ID --password <password> --wait --staple $zip_file"
    fi
    
    echo -e "${GREEN}🎉 rcodesign workflow completed!${NC}"
}

# Run main function
main "$@"
