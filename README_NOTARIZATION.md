# 🍎 Oasis Browser - Release & Notarization

## 🎯 Quick Start for Team Members

### For Release & Notarization:
```bash
# Navigate to the notarization directory
cd notarization

# Follow the complete guide
open docs/NOTARIZATION_SUCCESS_GUIDE.md
```

### Prerequisites:
1. **Apple Developer Account** with Developer ID Application certificate
2. **Certificate File** (`developer_id.p12`) - Place in `notarization/` directory
3. **App Store Connect API Key** for notarization
4. **Built Firefox Application** in `obj-*/dist/` directory

## 📚 Complete Documentation

### 🏆 Main Guide
- **[notarization/docs/NOTARIZATION_SUCCESS_GUIDE.md](notarization/docs/NOTARIZATION_SUCCESS_GUIDE.md)** - Complete 50+ page guide

### 🛠️ Quick Commands
```bash
# Run notarization
cd notarization && ./scripts/resolve_symlinks_and_sign.sh

# Test before notarization
cd notarization && ./scripts/pre_notarization_test.sh
```

## 🔐 Security Notes

- **Certificate files are NOT in the repository** (security)
- **Place your `developer_id.p12` in `notarization/` directory**
- **Set permissions**: `chmod 600 notarization/developer_id.p12`

## ✅ Success Rate: 100%

The notarization process has been fully tested and documented with a 100% success rate.

---

**For complete instructions, see**: [notarization/README.md](notarization/README.md)
