# Voice features branch: setup (legacy pointer)

**For current work on the integration branch** (assistant + voice + semantic history), use the structured guide:

**[README.md](README.md)**

That index links to onboarding, build steps, architecture diagrams, environment troubleshooting, and local testing.

---

## Legacy: `origin/voice-features` only

The historical **voice-features** line (for example Rushyanth’s TTS-focused branch) is **not** the same as **`integrate/semantic-search-history-voice`**. Use **`voice-features`** only when your team explicitly works off that remote branch.

Minimal checkout:

```bash
git fetch origin
git checkout -B voice-features origin/voice-features
```

Then follow **[build.md](build.md)** for `npm run build` in **`assistant/build`**, Preact **`ui-preact`**, and **`./mach build`**, and **[`browser/base/content/assistant/VOICE_INPUT_SETUP.md`](../../browser/base/content/assistant/VOICE_INPUT_SETUP.md)** for Lambda and keys.

Compare behavior with integrate: **[voice-ux-voice-features-vs-integrate.md](voice-ux-voice-features-vs-integrate.md)**.
