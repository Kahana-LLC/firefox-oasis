#!/bin/bash

# Resolve Symbolic Links and Sign Script
# This script resolves all symbolic links in the Firefox app bundle and then signs it

set -e

# Configuration
APP_NAME="Oasis-Browser"
CERTIFICATE_ID="Developer ID Application: Adam Richard Kershner (NV6BDYHYA5)"
TEAM_ID="NV6BDYHYA5"
APPLE_ID="adamkershner@rocketmail.com"
ENTITLEMENTS_FILE="./entitlements.plist"
P12_FILE="developer_id.p12"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔗 Resolve Symbolic Links and Sign for Oasis Browser${NC}"
echo "============================================================="

# Function to resolve symbolic links in a directory
resolve_symlinks() {
    local app_path="$1"
    local resolved_count=0
    
    echo -e "${YELLOW}🔍 Finding symbolic links in: $app_path${NC}"
    
    # Find all symbolic links
    local symlinks=$(find "$app_path" -type l 2>/dev/null)
    
    if [ -z "$symlinks" ]; then
        echo -e "${GREEN}✅ No symbolic links found${NC}"
        return 0
    fi
    
    local symlink_count=$(echo "$symlinks" | wc -l)
    echo -e "${YELLOW}📊 Found $symlink_count symbolic links${NC}"
    
    # Process each symbolic link
    echo "$symlinks" | while read -r symlink; do
        if [ -n "$symlink" ]; then
            local target=$(readlink "$symlink")
            local symlink_dir=$(dirname "$symlink")
            local symlink_name=$(basename "$symlink")
            
            echo -e "${YELLOW}🔗 Resolving: $symlink -> $target${NC}"
            
            # Check if target exists
            if [ -e "$target" ]; then
                # Remove the symbolic link
                rm "$symlink"
                
                # Copy the target file
                if [ -f "$target" ]; then
                    cp "$target" "$symlink"
                    echo -e "${GREEN}✅ Copied file: $symlink_name${NC}"
                elif [ -d "$target" ]; then
                    cp -R "$target" "$symlink"
                    echo -e "${GREEN}✅ Copied directory: $symlink_name${NC}"
                fi
                
                resolved_count=$((resolved_count + 1))
            else
                echo -e "${RED}❌ Target not found: $target${NC}"
            fi
        fi
    done
    
    echo -e "${GREEN}✅ Resolved $resolved_count symbolic links${NC}"
    return 0
}

# Function to sign the app with rcodesign
sign_app() {
    local app_path="$1"
    
    echo -e "${YELLOW}🔏 Signing app with rcodesign...${NC}"
    
    # Get password for P12 file
    echo -e "${YELLOW}Enter password for $P12_FILE:${NC}"
    read -s P12_PASSWORD
    
    # Sign with rcodesign
    rcodesign sign \
        --for-notarization \
        --p12-file "$P12_FILE" \
        --p12-password "$P12_PASSWORD" \
        --code-signature-flags runtime \
        --entitlements-xml-file "$ENTITLEMENTS_FILE" \
        "$app_path"
    
    echo -e "${GREEN}✅ App signed successfully${NC}"
}

# Function to verify the signature
verify_signature() {
    local app_path="$1"
    
    echo -e "${YELLOW}🔍 Verifying signature...${NC}"
    
    # Check signature details
    local signature_info=$(codesign -dvv "$app_path" 2>&1)
    
    if echo "$signature_info" | grep -q "Developer ID Application"; then
        echo -e "${GREEN}✅ Developer ID Application certificate found${NC}"
    else
        echo -e "${RED}❌ Developer ID Application certificate not found${NC}"
        return 1
    fi
    
    if echo "$signature_info" | grep -q "TeamIdentifier=$TEAM_ID"; then
        echo -e "${GREEN}✅ Team identifier correctly set${NC}"
    else
        echo -e "${RED}❌ Team identifier not set or incorrect${NC}"
        return 1
    fi
    
    # Check for file modification errors
    local modification_errors=$(codesign -vvv --deep --strict "$app_path" 2>&1 | grep "file modified" | wc -l)
    
    if [ "$modification_errors" -eq 0 ]; then
        echo -e "${GREEN}✅ No file modification errors${NC}"
        return 0
    else
        echo -e "${RED}❌ Found $modification_errors file modification errors${NC}"
        return 1
    fi
}

# Main function
main() {
    local source_app="${1:-obj-aarch64-apple-darwin24.6.0/dist/Oasis.app}"
    local output_app="${2:-Oasis-Browser-Final.app}"
    
    if [ ! -d "$source_app" ]; then
        echo -e "${RED}❌ Source app not found: $source_app${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}Source: $source_app${NC}"
    echo -e "${BLUE}Output: $output_app${NC}"
    echo ""
    
    # Step 1: Copy the app
    echo -e "${YELLOW}📁 Copying app...${NC}"
    rm -rf "$output_app"
    cp -R "$source_app" "$output_app"
    echo -e "${GREEN}✅ App copied${NC}"
    echo ""
    
    # Step 2: Resolve symbolic links
    echo -e "${YELLOW}🔗 Resolving symbolic links...${NC}"
    resolve_symlinks "$output_app"
    echo ""
    
    # Step 3: Sign the app
    echo -e "${YELLOW}🔏 Signing app...${NC}"
    sign_app "$output_app"
    echo ""
    
    # Step 4: Verify signature
    echo -e "${YELLOW}🔍 Verifying signature...${NC}"
    if verify_signature "$output_app"; then
        echo -e "${GREEN}🎉 SUCCESS! App is ready for notarization${NC}"
        echo -e "${BLUE}💡 Next steps:${NC}"
        echo "1. Create a zip file: zip -r Oasis-Browser-Final.zip $output_app"
        echo "2. Submit for notarization using xcrun notarytool"
    else
        echo -e "${RED}❌ Signature verification failed${NC}"
        exit 1
    fi
}

# Run main function
main "$@"
