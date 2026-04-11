# Voice features branch: setup and testing for new engineers

This guide walks you from a clean start through building Oasis and exercising the **voice** work on the branch maintained by **Rushyanth** (Git author **RushyanthN**). The canonical feature branch in this repository is **`voice-features`** (remote: `origin/voice-features`). The current tip includes work such as **TTS** (e.g. commit message *"added tts"*).

If you only need API keys and microphone behavior for the assistant UI, see also:

`browser/base/content/assistant/VOICE_INPUT_SETUP.md`

---

## Prerequisites

- **Hardware:** macOS, Linux, or Windows with enough disk and RAM for a full Firefox-class build (see [Firefox source docs](https://firefox-source-docs.mozilla.org/setup/index.html)).
- **Tools:** Git, a supported compiler toolchain, Python 3, and Node.js (for the assistant Preact bundle).
- **First-time Firefox build:** From the repo root, run `./mach bootstrap` once and follow the prompts so `./mach build` can succeed. If you have never built this tree before, read [Contributing / build](https://firefox-source-docs.mozilla.org/setup/contributing_code.html).

---

## 1. Get the repository

### Option A: New clone

```bash
git clone <YOUR_OASIS_OR_FIREFOX_REMOTE_URL> firefox-oasis
cd firefox-oasis
```

Use the same remote URL your team uses (fork or upstream).

### Option B: You already have a clone

```bash
cd /path/to/your/firefox-oasis
git fetch origin
```

---

## 2. Check out the voice branch

Create a local branch that tracks Rushyanth’s line of work:

```bash
git checkout -B voice-features origin/voice-features
```

Or, if you prefer a separate local name:

```bash
git fetch origin voice-features
git checkout -b my-voice-work origin/voice-features
```

Confirm you are on the right history:

```bash
git log -1 --oneline
```

You should see recent commits on this branch (including voice/TTS-related changes from **RushyanthN** where applicable).

**Note:** There is also `origin/integrate/semantic-search-history-voice`, which merges other work. For **voice-features-only** development, prefer **`voice-features`** unless your lead tells you otherwise.

---

## 3. Build the assistant UI bundle (required for sidebar changes)

Voice logic ships inside the bundled assistant script. After pulling the branch, install deps and rebuild the bundle:

```bash
cd browser/base/content/assistant/build
npm install
npm run build
cd ../../../../..
```

If your team uses lockfile-only installs, use `npm ci` instead of `npm install` when `package-lock.json` is present and up to date.

---

## 4. Build the browser

From the **repository root** (not a subdirectory):

```bash
./mach build
```

Oasis uses the same `./mach` interface as Firefox. Do not use subdirectory-only build targets unless your team explicitly documents them.

---

## 5. Run Oasis locally

```bash
./mach run
```

Use a profile where you can sign in and grant microphone permission if you are testing capture.

---

## 6. Configure voice (transcription / backend)

End-to-end voice needs:

1. **Signed-in assistant** (Supabase session) for signed requests where the code requires it.
2. **Microphone permission** for the site / chrome context (see `VOICE_INPUT_SETUP.md`).
3. **Backend:** Lambda (or equivalent) with `DEEPGRAM_API_KEY` / `GEMINI_API_KEY` as documented in `VOICE_INPUT_SETUP.md`.
4. **Client URL:** Set `OASIS_TRANSCRIBE_URL` in `browser/base/content/assistant/build/.env.local` (or as your team documents) so the bundle points at your voice endpoint.

After changing `.env.local`, run **`npm run build`** again in `browser/base/content/assistant/build`, then **`./mach build`** so the updated bundle is packaged.

---

## 7. Manual test checklist (voice-features branch)

1. `./mach run` and open the **assistant** sidebar (e.g. **+ chat**).
2. Confirm you are **signed in** if the UI requires auth for voice.
3. **Microphone:** Use the mic control in the assistant; grant permission when prompted; speak, stop recording, and confirm transcription appears in the input (STT path).
4. **TTS / playback:** On this branch, exercise whatever **speaker / read-aloud** or TTS controls the UI exposes after Rushyanth’s TTS work; confirm audio plays and errors are visible in the **Browser Console** if something fails.
5. Optional: open **Tools → Browser Console** and filter for voice-related logs or errors.

---

## 8. After you change code

From the repo root (typical workflow):

```bash
./mach format
./mach lint
./mach build
```

Run targeted tests only if your mentor gives you a specific `./mach test` path; a full `./mach test --auto` is expensive.

---

## 9. Staying current with the branch

```bash
git fetch origin
git checkout voice-features   # or your local branch name
git merge origin/voice-features
# or: git rebase origin/voice-features  (if your team prefers rebase)
```

Then repeat **sections 3–4** (and **6** if env changed).

---

## 10. Quick reference

| Step | Command / location |
|------|---------------------|
| Branch | `origin/voice-features` |
| Assistant bundle | `browser/base/content/assistant/build` → `npm run build` |
| Browser build | Repo root → `./mach build` |
| Run | `./mach run` |
| Voice env / API details | `browser/base/content/assistant/VOICE_INPUT_SETUP.md` |

If `origin/voice-features` does not exist on your remote, ask the team for the correct remote name or Rushyanth’s fork URL, then add it with `git remote add` and fetch that branch.
