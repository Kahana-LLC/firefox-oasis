# 🔐 Security Notes for Notarization Files

## ⚠️ CRITICAL: Never Commit These Files to GitHub

### 🚫 **NEVER COMMIT - Security Sensitive:**
- `developer_id.p12` - Contains your private key
- `*.p12` - Any certificate files with private keys
- `*.pem` - Private key files
- `*.cer` - Certificate files
- `*.key` - Private key files
- `*.mobileprovision` - Provisioning profiles

### 🚫 **NEVER COMMIT - Large Binary Files:**
- `outputs/` - Contains 1.2GB of app bundles and distribution files
- `*.app` - Application bundles
- `*.dmg` - Disk images
- `*.zip` - Archive files
- `*.ipa` - iOS app archives

### 🚫 **NEVER COMMIT - Personal Information:**
- Files containing passwords
- Files containing secrets
- Files containing personal information
- Log files that might contain sensitive data

## ✅ **SAFE TO COMMIT - Documentation and Scripts:**
- `docs/` - All documentation files
- `scripts/` - All automation scripts
- `*.md` - Markdown documentation
- `entitlements.plist` - App entitlements (no secrets)
- `README.md` - Project documentation
- `.gitignore` - Git ignore rules

## 🛡️ **Security Best Practices:**

1. **Use Environment Variables**: Store sensitive data in environment variables
2. **Use .env Files**: Create `.env` files for local development (add to .gitignore)
3. **Use CI/CD Secrets**: Store certificates in GitHub Actions secrets
4. **Regular Rotation**: Rotate certificates regularly
5. **Access Control**: Limit access to sensitive files

## 📋 **Pre-Commit Checklist:**

Before pushing to GitHub, verify:
- [ ] No `.p12` files in the commit
- [ ] No large binary files (`.app`, `.dmg`, `.zip`)
- [ ] No passwords or secrets in any files
- [ ] All sensitive data is in environment variables
- [ ] `.gitignore` is properly configured

## 🔧 **Recommended Setup:**

1. **Local Development**: Use `.env` files for sensitive data
2. **CI/CD**: Use GitHub Actions secrets for certificates
3. **Team Sharing**: Share certificates securely outside of Git
4. **Documentation**: Document the process without exposing secrets

---

*Remember: Once sensitive data is committed to Git history, it's very difficult to remove completely. Always err on the side of caution.*
