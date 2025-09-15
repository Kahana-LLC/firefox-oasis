<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# I'm working on building a new browser based on firefox source code (i maintain a public branch). I recently have been working on preparing it for successful apple notarization, and here is a report of my recent failed attempts. I'm looking to come up with a plan for analyzing how to fix issues, implemnet fixes, and ultimately get a notarization success. Here is the report: Based on my analysis of the notarization attempts, here's a comprehensive status report of your past notarization attempts:

📊 Notarization Status Summary
Recent Submissions (All Failed)
DateSubmission IDNameStatusKey Issues
Sep 14, 2025
7e8b3091-12a6-40ce-b1e7-4ad8688656fd
Oasis-Browser-Clean-20250913.zip
❌ Invalid
Invalid signatures on core binaries
Sep 13, 2025
044b223a-c3e8-4efc-8e31-03f6705bfbd3
Oasis-Browser-20250913.zip
❌ Invalid
Critical validation errors
Sep 13, 2025
b2950004-dab2-4d0d-9397-809377f2c128
Oasis Browser-1.2.0-working-for-notarization.zip
❌ Invalid
Archive validation issues
Latest Rejection Details (Most Recent)
Submission ID: 7e8b3091-12a6-40ce-b1e7-4ad8688656fd
Status: Invalid
Error Code: 4000
Summary: "Archive contains critical validation errors"
Specific Issues Found:
Main Firefox Binary (firefox) - Invalid signature (both x86_64 and arm64)
Updater Binary (org.mozilla.updater) - Invalid signature (both x86_64 and arm64)
�� Root Cause Analysis
Primary Issue: Invalid Binary Signatures
The core problem is that the main executables have invalid signatures, which means:
The signing process is not working correctly
Files are being modified after signing
The signature verification is failing at Apple's servers
Why This Keeps Happening:
Firefox Build Complexity - Firefox has a complex build system that modifies files after signing
File Modification After Signing - 6,736+ files show modification errors
Signing Process Issues - The current signing approach isn't preventing file corruption
📈 Progress Made vs. Issues Remaining
✅ What You've Successfully Fixed:
Developer ID certificate is valid
Hardened runtime is enabled
Secure timestamps are present
Comprehensive entitlements file created
Relative path dependencies fixed (@rpath → @executable_path)
Clean copy methodology implemented
❌ Critical Issues Still Remaining:
Invalid binary signatures (main blocker)
File modification after signing (6,736+ files affected)
Team identifier not properly set in signatures
Local verification failures (Gatekeeper rejection)
�� Current Status Assessment
Success Probability: 20-30%
Despite significant improvements, the fundamental issue of invalid signatures remains the primary blocker.
Why Previous Attempts Failed:
File modification after signing breaks signatures
Complex Firefox build system conflicts with notarization requirements
Signing process doesn't prevent post-signing modifications
🚀 Recommended Next Steps
Option 1: Investigate Build-Time Signing (Recommended)
Sign during the Firefox build process, not after
This would prevent file modification issues
Requires modifying the Firefox build system
Option 2: Alternative Signing Approach
Try a different signing methodology
Use Xcode for notarization instead of command line
Research Firefox-specific notarization solutions
Option 3: Accept Current Limitations
Distribute as code-signed (not notarized)
Users will see a one-time security warning
Still provides good security for most use cases
📋 Key Takeaways
All recent attempts have failed due to invalid signatures
The phased approach made improvements but didn't solve the core issue
File modification after signing is the primary technical blocker
Firefox's complexity makes notarization particularly challenging
Current code-signed version works well for distribution (just not notarized)
The notarization attempts show a pattern of technical improvements but persistent signature validation failures. The core issue appears to be fundamental to how Firefox builds work, making notarization extremely challenging without significant build system modifications.
 
26%
1 Tab

Plan, search, build anything
Agent⌘I
Auto
[]()
[ Agents]()
[ release-v1.2.0*]()
[]()
[ 0  0]()
[]()
[Markdown]()
[]()
[LF]()
[UTF-8]()
[Spaces: 4]()
[Ln 1, Col 1]()
[Cursor Tab]()
Warning: The git repository at "/Users/adamkershner/Documents/firefox-oasis" has too many active changes, only a subset of Git features will be enabled.
Extension Host Unresponsive
The extension host has stopped responding. You can wait a moment or reload this window.
Reload Window
[Show Recommendations]()[Install]()

Based on my extensive research on Firefox notarization issues and build system behavior, I can now provide you with a comprehensive analysis and actionable plan to fix your notarization problems.

# Comprehensive Plan to Fix Firefox Browser Notarization Issues

## Root Cause Analysis

Your notarization failures stem from a fundamental conflict between Firefox's complex build system and Apple's notarization requirements. The core issue is **post-build file modification** - Firefox's build process continues to modify binaries after they've been signed, which invalidates the signatures.[^1][^2][^3]

## The Firefox File Modification Problem

Firefox has a unique build system that performs extensive post-processing after compilation:[^4][^2][^5]

1. **Omni.ja Processing**: Firefox packages JavaScript files into `omni.ja` archives after compilation[^3][^6][^7]
2. **Binary Preprocessing**: The build system applies various transformations to binaries[^2][^8]
3. **ELF Hacking**: Firefox uses custom tools like "elfhack" to modify binaries for performance optimization[^9]
4. **Component Bundling**: Various browser components are bundled and potentially modified after initial compilation[^2]

This explains why your 6,736+ files show modification errors after signing - the Firefox build system is actively changing files post-signature.

## Strategic Solutions Framework

### Option 1: Build-Time Integration Signing (Recommended)

**Implementation Steps:**

1. **Integrate Signing into Build System**[^10][^11]
    - Modify Firefox's `mozconfig` to include signing parameters
    - Use Mozilla's documented local signing process for macOS builds
    - Configure signing to occur during the build rather than after
2. **Use Mozilla's Build System Signing**
    - Firefox already has infrastructure for this through `signingscript`[^11][^1]
    - Leverage the existing `mac-signing` and `mac-notarization` build targets[^12]
    - Implement `rcodesign` integration similar to Mozilla's production process[^13][^1]
3. **Prevent Post-Build Modification**
    - Configure build to avoid file modifications after signing
    - Use `--disable-unified-build` to reduce build complexity[^14]
    - Consider artifact builds to minimize local compilation[^15]

### Option 2: rcodesign Integration Approach

**Implementation Steps:**

1. **Use rcodesign Tool**[^16][^17][^13]
    - Mozilla uses `rcodesign` for notarization in production[^18][^1]
    - This Rust-based tool works on Linux and doesn't require macOS
    - Supports the `--for-notarization` flag for compatibility mode[^13]
2. **Signing Command Structure:**

```bash
rcodesign sign \
  --for-notarization \
  --pem-source developer-id-application.pem \
  --code-signature-flags runtime \
  YourBrowser.app
```

3. **Notarization Process:**

```bash
rcodesign notary-submit \
  --api-key-file ~/.appstoreconnect/key.json \
  --wait \
  --staple \
  YourBrowser.app.zip
```


### Option 3: Build System Modification Approach

**Implementation Steps:**

1. **Disable Post-Build Processing**
    - Modify `mozconfig` to disable problematic post-processing
    - Use `ac_add_options --disable-replace-malloc` if needed[^9]
    - Consider `ac_add_options --enable-artifact-builds` to reduce local compilation[^15]
2. **Create Clean Build Environment**
    - Use a separate signing-specific build configuration
    - Implement signing immediately after compilation but before packaging
    - Avoid file modifications in the packaging phase

## Immediate Action Plan

### Phase 1: Diagnostic Analysis (1-2 days)

1. **Build System Audit**
    - Identify exactly which build steps modify files after compilation
    - Map the Firefox build process to understand modification points
    - Document current `mozconfig` settings and build options
2. **Signing Timing Analysis**
    - Determine the optimal point in the build process for signing
    - Identify which Firefox build targets cause file modifications
    - Test signing at different stages of the build process

### Phase 2: Implementation (1-2 weeks)

1. **Set Up rcodesign Environment**
    - Install and configure `rcodesign` tool[^17][^13]
    - Set up App Store Connect API credentials
    - Test basic signing and notarization workflow
2. **Build System Integration**
    - Create a custom build configuration that signs during build
    - Modify packaging scripts to avoid post-signing modifications
    - Implement automated signing as part of the build process
3. **Testing and Validation**
    - Test the modified build process
    - Validate that signatures remain valid through the entire process
    - Ensure the browser functions correctly after signing

### Phase 3: Optimization (1 week)

1. **Process Refinement**
    - Optimize the signing workflow for efficiency
    - Implement error handling and recovery
    - Document the complete process
2. **Automation**
    - Create scripts for repeatable builds
    - Set up continuous integration if needed
    - Establish monitoring for signature validity

## Key Technical Recommendations

1. **Use Mozilla's Proven Tools**: Leverage `rcodesign` and the existing Firefox signing infrastructure[^1][^13]
2. **Sign Early**: Integrate signing into the build process rather than as a post-build step[^10]
3. **Avoid File Modification**: Configure the build to minimize post-compilation changes[^14][^2]
4. **Follow Mozilla's Pattern**: Adapt Mozilla's production signing process for your custom build[^12][^1]

## Expected Outcomes

Following this plan should resolve your notarization issues by:

- Eliminating post-signing file modifications that invalidate signatures
- Using proven tools and processes from Mozilla's production environment
- Maintaining signature integrity throughout the build process
- Achieving successful Apple notarization for your Firefox-based browser

The key insight is that Firefox's build system complexity requires signing to be integrated into the build process itself, rather than applied afterward. This approach has proven successful for Mozilla and should resolve your persistent notarization failures.
<span style="display:none">[^19][^20][^21][^22][^23][^24][^25][^26][^27][^28][^29][^30][^31][^32][^33][^34][^35][^36][^37][^38][^39][^40][^41][^42][^43][^44][^45][^46][^47][^48][^49][^50][^51][^52][^53][^54][^55][^56][^57][^58][^59][^60][^61][^62][^63][^64][^65][^66][^67][^68][^69][^70][^71][^72][^73][^74][^75][^76][^77][^78][^79][^80][^81][^82][^83][^84][^85][^86][^87][^88][^89][^90][^91][^92][^93][^94][^95][^96]</span>

<div style="text-align: center">⁂</div>

[^1]: http://docs.mozilla-releng.net/en/latest/explanations/signing/Apple_signing_and_notarization.html

[^2]: https://github.com/glacambre/firefox-patches/issues/1

[^3]: https://shallowsky.com/blog/tech/web/script-omni.ja.html

[^4]: https://firefox-source-docs.mozilla.org/build/buildsystem/locales.html

[^5]: https://firefox-source-docs.mozilla.org/build/buildsystem/build-overview.html

[^6]: https://shallowsky.com/blog/tech/web/modifying-omni.ja.html

[^7]: https://whatsoftware.com/edit-files-inside-firefox-4-omni-jar-to-auto-save-password/

[^8]: https://firefox-source-docs.mozilla.org/build/buildsystem/preprocessor.html

[^9]: https://glandium.org/blog/?p=4297

[^10]: https://firefox-source-docs.mozilla.org/contributing/signing/signing_macos_build.html

[^11]: https://firefox-source-docs.mozilla.org/taskcluster/kinds.html

[^12]: https://firefox-source-docs.mozilla.org/taskcluster/signing.html

[^13]: https://gregoryszorc.com/docs/apple-codesign/stable/apple_codesign_rcodesign_notarizing.html

[^14]: https://firefox-source-docs.mozilla.org/build/buildsystem/unified-builds.html

[^15]: https://firefox-source-docs.mozilla.org/contributing/build/artifact_builds.html

[^16]: https://gregoryszorc.com/blog/2022/08/08/achieving-a-completely-open-source-implementation-of-apple-code-signing-and-notarization/

[^17]: https://gregoryszorc.com/docs/apple-codesign/0.17.0/apple_codesign_rcodesign.html

[^18]: https://hearsum.ca/posts/history-of-code-signing-at-mozilla/

[^19]: https://www.deepdownstudios.com/html/testing/geckodriver/Notarization.html

[^20]: https://www.globalsign.com/en/code-signing-certificate/mozilla

[^21]: https://stackoverflow.com/questions/78876976/electron-apple-notarisation

[^22]: https://firefox-source-docs.mozilla.org/setup/macos_build.html

[^23]: https://signmycode.com/resources/quick-guide-to-import-code-signing-certificate-into-firefox

[^24]: https://developer.apple.com/forums/thread/736356

[^25]: https://firefox-source-docs.mozilla.org/testing/geckodriver/Notarization.html

[^26]: https://blog.frostwire.com/2019/08/27/apple-notarization-the-signature-of-the-binary-is-invalid-one-other-reason-not-explained-in-apple-developer-documentation/

[^27]: https://discussions.apple.com/thread/255716470

[^28]: https://developer.apple.com/documentation/security/resolving-common-notarization-issues

[^29]: https://bugzilla.mozilla.org/show_bug.cgi?id=1689807

[^30]: https://developer.apple.com/documentation/Security/notarizing-macos-software-before-distribution

[^31]: https://codesigncert.com/resources/export-code-signing-certificate-from-firefox

[^32]: https://github.com/airsdk/Adobe-Runtime-Support/issues/2369

[^33]: https://developer.apple.com/videos/play/wwdc2021/10261/

[^34]: https://news.ycombinator.com/item?id=42975436

[^35]: https://www.youtube.com/watch?v=H7VcIIrdoXg

[^36]: https://davidwalsh.name/how-to-build-firefox

[^37]: https://www.ghacks.net/2016/08/14/override-firefox-add-on-signing-requirement/

[^38]: https://firefox-source-docs.mozilla.org/setup/configuring_build_options.html

[^39]: https://stackoverflow.com/questions/10374207/i-can-change-signed-executable

[^40]: https://support.mozilla.org/en-US/questions/1418760

[^41]: https://firefox-source-docs.mozilla.org/setup/linux_build.html

[^42]: https://stackoverflow.com/questions/36308767/how-to-sign-firefox-addon-after-editing-it

[^43]: https://atiqcs.wordpress.com/2014/07/02/building-mozilla-from-source-and-custom-firefox-with-extensions/

[^44]: https://www.reddit.com/r/firefox/comments/2vfuob/introducing_extension_signing_a_safer_addon/

[^45]: https://clarionhub.com/t/has-my-exe-been-modified/5844

[^46]: https://gregoryszorc.com/blog/2013/02/28/moz.build-files-and-the-firefox-build-system/

[^47]: https://firefox-source-docs.mozilla.org/build/buildsystem/build-targets.html

[^48]: https://support.mozilla.org/en-US/questions/1243141

[^49]: https://support.mozilla.org/en-US/kb/customizing-firefox-using-autoconfig

[^50]: https://www.reddit.com/r/Gentoo/comments/12rp0w1/i_switched_to_binary_firefox_because_i_see_no/

[^51]: https://gregoryszorc.com/docs/apple-codesign/0.26.0/apple_codesign_rcodesign_notarizing.html

[^52]: https://mozilla-l10n.github.io/documentation/products/firefox_desktop/build_system.html

[^53]: https://pyoxidizer.readthedocs.io/_/downloads/en/apple-codesign-0.15.0/pdf/

[^54]: https://bugzilla.mozilla.org/show_bug.cgi?id=1470607

[^55]: https://dennisbabkin.com/blog/?t=how-to-get-certificate-code-sign-notarize-macos-binaries-outside-apple-app-store

[^56]: https://developer.apple.com/forums/tags/notarization/?page=5\&sortBy=oldest

[^57]: https://www.reddit.com/r/firefox/comments/bknnkw/a_note_to_mozilla/

[^58]: https://www.dochub.com/en/functionalities/notarize-a-document-for-e-signature-in-mozilla-firefox

[^59]: https://news.ycombinator.com/item?id=32386762

[^60]: https://www.reddit.com/r/firefox/comments/1i6nkby/how_to_install_an_addon_modified_by_myself_with/

[^61]: https://stackoverflow.com/questions/31952727/how-can-i-disable-signature-checking-for-firefox-add-ons

[^62]: https://udn.realityripple.com/docs/Mozilla/Developer_guide/Build_Instructions/How_Mozilla_s_build_system_works

[^63]: https://www.reddit.com/r/firefox/comments/1c4y8ey/upgraded_addon_signatures_required_for_firefox_127/

[^64]: https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/

[^65]: https://gregoryszorc.com/blog/2012/07/29/mozilla-build-system-overview/

[^66]: https://www.deepdownstudios.com/html/python/mach.html

[^67]: https://support.mozilla.org/en-US/kb/add-on-signing-in-firefox

[^68]: https://firefox-source-docs.mozilla.org/python/mozbuild.html

[^69]: https://support.mozilla.org/en-US/kb/about-config-editor-firefox

[^70]: https://sslinsights.com/import-code-signing-certificate-from-firefox/

[^71]: https://firefox-source-docs.mozilla.org/mach/usage.html

[^72]: https://news.ycombinator.com/item?id=10038999

[^73]: https://support.mozilla.org/en-US/kb/firefox-advanced-customization-and-configuration

[^74]: https://discourse.mozilla.org/t/self-sign-my-extension/5369

[^75]: https://firefox-source-docs.mozilla.org/python/index.html

[^76]: https://gittup.org/building-firefox-with-tup.html

[^77]: https://bugzilla.mozilla.org/show_bug.cgi?id=525013

[^78]: https://firefox-source-docs.mozilla.org/testing/marionette/Building.html

[^79]: https://users.rust-lang.org/t/post-build-binary-modification/119345

[^80]: https://firefox-source-docs.mozilla.org/build/buildsystem/defining-binaries.html

[^81]: https://stackoverflow.com/questions/10858219/the-recommended-way-to-run-binary-from-mozilla-extension-with-std-i-o-communica

[^82]: https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest_API/Sending_and_Receiving_Binary_Data

[^83]: https://firefox-source-docs.mozilla.org/mach/windows-usage-outside-mozillabuild.html

[^84]: https://www.youtube.com/watch?v=m-M69FyW22I

[^85]: https://support.mozilla.org/en-US/kb/import-bookmarks-google-chrome

[^86]: https://stackoverflow.com/questions/76648381/how-to-solve-firefox-drivers-binary-problem-in-selenium

[^87]: https://support.mozilla.org/en-US/questions/1183315

[^88]: https://stackoverflow.com/questions/32038251/how-to-correctly-repack-omni-ja-in-firefox

[^89]: https://developer.mozilla.org/en-US/docs/Web/WebDriver/Reference/Capabilities/firefoxOptions

[^90]: https://connect.mozilla.org/t5/ideas/file-improvement-omni-ja/idi-p/3103

[^91]: https://www.reddit.com/r/firefox/comments/107fj69/how_can_i_disable_the_efficiency_mode_on_firefox/

[^92]: https://mike.kaply.com/2013/05/06/dont-unpack-and-repack-omni-jar/

[^93]: https://support.mozilla.org/en-US/kb/firefox-uses-too-much-memory-or-cpu-resources

[^94]: https://github.com/mozilla/geckodriver/issues/1134

[^95]: https://support.mozilla.org/en-US/questions/1319962

[^96]: https://support.mozilla.org/en-US/kb/task-manager-tabs-or-extensions-are-slowing-firefox

