#!/bin/bash

# Diagnose Code Signing Issues
# This script helps identify what's preventing proper notarization

set -e

# Configuration
BUILD_DIR="obj-aarch64-apple-darwin24.6.0/dist"
APP_PATH="$BUILD_DIR/Oasis.app"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔍 Diagnosing Code Signing Issues...${NC}"

# Check if the app exists
if [ ! -d "$APP_PATH" ]; then
    echo -e "${RED}❌ Error: $APP_PATH not found!${NC}"
    exit 1
fi

echo -e "${YELLOW}📊 App Bundle Analysis${NC}"
echo "================================"

# Check app bundle structure
echo -e "${BLUE}App Bundle Structure:${NC}"
ls -la "$APP_PATH/Contents/"

echo -e "\n${BLUE}MacOS Directory:${NC}"
ls -la "$APP_PATH/Contents/MacOS/" | head -20

echo -e "\n${BLUE}Frameworks Directory:${NC}"
if [ -d "$APP_PATH/Contents/Frameworks" ]; then
    ls -la "$APP_PATH/Contents/Frameworks/" | head -10
else
    echo "No Frameworks directory"
fi

# Check for problematic files
echo -e "\n${YELLOW}🔍 Problematic Files Analysis${NC}"
echo "=================================="

echo -e "${BLUE}Files that can't be signed:${NC}"
find "$APP_PATH" -name "*.done" -o -name "*.build" -o -name "moz.build" -o -name ".mkdir.done" | head -10

echo -e "\n${BLUE}Empty directories:${NC}"
find "$APP_PATH" -type d -empty | head -10

echo -e "\n${BLUE}Invalid .app directories:${NC}"
find "$APP_PATH" -name "*.app" -type d | while read -r app_dir; do
    if [ ! -f "$app_dir/Contents/Info.plist" ]; then
        echo "Invalid app bundle: $app_dir"
    fi
done

# Check current signing status
echo -e "\n${YELLOW}🔍 Current Signing Status${NC}"
echo "=============================="

echo -e "${BLUE}Main app bundle signature:${NC}"
codesign --verify --verbose "$APP_PATH" 2>&1 || echo "Not signed or invalid"

echo -e "\n${BLUE}spctl assessment:${NC}"
spctl --assess --verbose "$APP_PATH" 2>&1 || echo "Failed spctl assessment"

# Check individual file signatures
echo -e "\n${YELLOW}🔍 Individual File Signatures${NC}"
echo "================================="

echo -e "${BLUE}Checking main executable:${NC}"
if [ -f "$APP_PATH/Contents/MacOS/firefox" ]; then
    codesign --verify --verbose "$APP_PATH/Contents/MacOS/firefox" 2>&1 || echo "Not signed"
else
    echo "Main executable not found"
fi

echo -e "\n${BLUE}Checking dylibs:${NC}"
find "$APP_PATH" -name "*.dylib" | head -5 | while read -r dylib; do
    echo "Checking: $(basename "$dylib")"
    codesign --verify --verbose "$dylib" 2>&1 || echo "  Not signed"
done

# Check app bundles
echo -e "\n${BLUE}Checking app bundles:${NC}"
find "$APP_PATH" -name "*.app" -not -path "*/Oasis.app" | while read -r app_bundle; do
    echo "Checking: $(basename "$app_bundle")"
    codesign --verify --verbose "$app_bundle" 2>&1 || echo "  Not signed"
done

# Check entitlements
echo -e "\n${YELLOW}🔍 Entitlements Analysis${NC}"
echo "============================="

if [ -f "entitlements.plist" ]; then
    echo -e "${BLUE}Current entitlements:${NC}"
    cat entitlements.plist
else
    echo "No entitlements.plist found"
fi

# Check certificate
echo -e "\n${YELLOW}🔍 Certificate Analysis${NC}"
echo "============================="

echo -e "${BLUE}Available certificates:${NC}"
security find-identity -v -p codesigning

echo -e "\n${BLUE}Certificate details:${NC}"
security find-identity -v -p codesigning | grep "Developer ID Application" | head -1 | while read -r line; do
    cert_id=$(echo "$line" | awk '{print $2}')
    echo "Certificate ID: $cert_id"
    security find-certificate -c "Developer ID Application" -p | openssl x509 -text -noout | grep -A 5 "Subject:"
done

# Recommendations
echo -e "\n${YELLOW}💡 Recommendations${NC}"
echo "=================="

echo -e "${BLUE}1. Clean up problematic files:${NC}"
echo "   - Remove .done, .build, moz.build files"
echo "   - Remove empty directories"
echo "   - Remove invalid .app directories"

echo -e "\n${BLUE}2. Sign in correct order:${NC}"
echo "   - Sign dylibs first"
echo "   - Sign executables second"
echo "   - Sign nested app bundles third"
echo "   - Sign main app bundle last"

echo -e "\n${BLUE}3. Use proper entitlements:${NC}"
echo "   - Ensure entitlements.plist is valid"
echo "   - Use --options runtime for hardened runtime"

echo -e "\n${BLUE}4. Verify each step:${NC}"
echo "   - Check signatures after each step"
echo "   - Use codesign --verify --verbose"
echo "   - Use spctl --assess --verbose"

echo -e "\n${GREEN}✅ Diagnosis complete!${NC}"
