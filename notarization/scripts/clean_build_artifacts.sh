#!/bin/bash

# Clean Build Artifacts Script
# Removes .mkdir.done files and other build artifacts before signing

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🧹 Cleaning Build Artifacts${NC}"
echo "=============================="

# Function to clean build artifacts
clean_artifacts() {
    local app_path="$1"
    
    if [ ! -d "$app_path" ]; then
        echo -e "${RED}❌ App path not found: $app_path${NC}"
        return 1
    fi
    
    echo -e "${YELLOW}📁 Cleaning artifacts in: $app_path${NC}"
    
    # Count artifacts before cleaning
    local before_count=$(find "$app_path" -name "*.done" -o -name ".mkdir.done" 2>/dev/null | wc -l)
    echo -e "${YELLOW}📊 Found $before_count build artifacts${NC}"
    
    if [ "$before_count" -eq 0 ]; then
        echo -e "${GREEN}✅ No build artifacts found${NC}"
        return 0
    fi
    
    # Remove build artifacts
    echo -e "${YELLOW}🗑️  Removing build artifacts...${NC}"
    find "$app_path" -name "*.done" -o -name ".mkdir.done" -delete 2>/dev/null
    
    # Count artifacts after cleaning
    local after_count=$(find "$app_path" -name "*.done" -o -name ".mkdir.done" 2>/dev/null | wc -l)
    
    if [ "$after_count" -eq 0 ]; then
        echo -e "${GREEN}✅ Successfully cleaned $before_count build artifacts${NC}"
        return 0
    else
        echo -e "${RED}❌ Failed to clean all artifacts. $after_count remaining${NC}"
        return 1
    fi
}

# Main execution
main() {
    local app_path="${1:-obj-aarch64-apple-darwin24.6.0/dist/Oasis.app}"
    
    echo -e "${BLUE}Target: $app_path${NC}"
    echo ""
    
    clean_artifacts "$app_path"
    
    echo ""
    echo -e "${BLUE}💡 Next Steps:${NC}"
    echo "1. Run this script before signing"
    echo "2. Then run rcodesign to sign the cleaned app"
    echo "3. The app should now pass notarization"
}

# Run main function
main "$@"
