# Oasis Browser Signing Order

## Current Status Analysis

**✅ ALREADY SIGNED (15 items):**
- Main XUL executable (the core browser engine)
- All .dylib libraries in MacOS/
- Plugin container executable
- Crash reporter executable
- Updater executable
- Media plugin helper executable
- Most core system components

**❌ NEEDS SIGNING (35 items):**

## Exact Signing Order

### Phase 1: Deepest Nested Components First
1. **TestAUSHelper** - `Contents/MacOS/callback_app.app/Contents/MacOS/TestAUSHelper`
2. **Callback App Bundle** - `Contents/MacOS/callback_app.app` (after its contents)

### Phase 2: MacOS Executables
3. **Main Firefox Launcher** - `Contents/MacOS/firefox` ⚠️ **CRITICAL**
4. **HTTP3 Server** - `Contents/MacOS/http3server`
5. **XPCShell** - `Contents/MacOS/xpcshell`
6. **CertUtil** - `Contents/MacOS/certutil`
7. **PK12Util** - `Contents/MacOS/pk12util`
8. **SSL Tunnel** - `Contents/MacOS/ssltunnel`

### Phase 3: Test Libraries (MacOS)
9. **libxul_broken_buildid.dylib** - `Contents/MacOS/gtest/libxul_broken_buildid.dylib`
10. **libxul_correct_buildid.dylib** - `Contents/MacOS/gtest/libxul_correct_buildid.dylib`
11. **libxul_missing_buildid.dylib** - `Contents/MacOS/gtest/libxul_missing_buildid.dylib`

### Phase 4: Resources Executables
12. **BadCertAndPinningServer** - `Contents/Resources/BadCertAndPinningServer`
13. **ChannelPrefs** - `Contents/Resources/ChannelPrefs`
14. **CrashReporter** - `Contents/Resources/crashreporter`
15. **DelegatedCredentialsServer** - `Contents/Resources/DelegatedCredentialsServer`
16. **EncryptedClientHelloServer** - `Contents/Resources/EncryptedClientHelloServer`
17. **FaultyServer** - `Contents/Resources/FaultyServer`
18. **Firefox (Resources)** - `Contents/Resources/firefox`
19. **Firefox Binary** - `Contents/Resources/firefox-bin`
20. **GenerateOCSPResponse** - `Contents/Resources/GenerateOCSPResponse`
21. **LogAlloc Replay** - `Contents/Resources/logalloc-replay`
22. **NSInstall** - `Contents/Resources/nsinstall`
23. **OCSPStaplingServer** - `Contents/Resources/OCSPStaplingServer`
24. **Org Mozilla Updater** - `Contents/Resources/org.mozilla.updater`
25. **Plugin Container** - `Contents/Resources/plugin-container`
26. **SanctionsTestServer** - `Contents/Resources/SanctionsTestServer`
27. **SignMar** - `Contents/Resources/signmar`
28. **UpdateSettings** - `Contents/Resources/UpdateSettings`
29. **Zucchini** - `Contents/Resources/zucchini`
30. **Zucchini GTest** - `Contents/Resources/zucchini-gtest`

### Phase 5: Resources Libraries
31. **libfake.dylib** - `Contents/Resources/gmp-fake/1.0/libfake.dylib`
32. **libfakeopenh264.dylib** - `Contents/Resources/gmp-fakeopenh264/1.0/libfakeopenh264.dylib`
33. **libfreebl3.dylib** - `Contents/Resources/libfreebl3.dylib`
34. **libgkcodecs.dylib** - `Contents/Resources/libgkcodecs.dylib`
35. **liblgpllibs.dylib** - `Contents/Resources/liblgpllibs.dylib`
36. **libmozavcodec.dylib** - `Contents/Resources/libmozavcodec.dylib`
37. **libmozavutil.dylib** - `Contents/Resources/libmozavutil.dylib`
38. **libmozglue.dylib** - `Contents/Resources/libmozglue.dylib`
39. **libmozinference.dylib** - `Contents/Resources/libmozinference.dylib`
40. **libnss3.dylib** - `Contents/Resources/libnss3.dylib`
41. **libonnxruntime.dylib** - `Contents/Resources/libonnxruntime.dylib`
42. **libsoftokn3.dylib** - `Contents/Resources/libsoftokn3.dylib`

### Phase 6: Final App Bundle
43. **Main App Bundle** - `Oasis-Mozilla-Signed.app` (with entitlements)

## Critical Dependencies

1. **TestAUSHelper MUST be signed before callback_app.app**
2. **All individual executables MUST be signed before the main app bundle**
3. **Main firefox executable is CRITICAL** - this is the primary launcher
4. **App bundle MUST be signed last** with entitlements

## Signing Command Template

```bash
# For individual executables:
codesign --force --sign "Developer ID Application: Adam Richard Kershner (NV6BDYHYA5)" \
  --options runtime --timestamp \
  "path/to/executable"

# For app bundles:
codesign --force --sign "Developer ID Application: Adam Richard Kershner (NV6BDYHYA5)" \
  --options runtime --timestamp \
  "path/to/app.bundle"

# For main app bundle (with entitlements):
codesign --force --deep --sign "Developer ID Application: Adam Richard Kershner (NV6BDYHYA5)" \
  --options runtime --timestamp \
  --entitlements "./entitlements.plist" \
  "./obj-aarch64-apple-darwin24.6.0/dist/Oasis-Mozilla-Signed.app"
```

## Verification

After each phase, verify with:
```bash
codesign -vvv --deep --strict "./obj-aarch64-apple-darwin24.6.0/dist/Oasis-Mozilla-Signed.app"
```

## Notes

- **Total items to sign**: 42 individual components + 1 main app bundle
- **Estimated time**: 5-10 minutes
- **Critical path**: firefox executable → app bundle
- **Dependencies**: Nested app bundles must be signed from inside-out
