# Windows build: ICU compiler warnings (MozillaBuild / Oasis)

This note is for engineers building Firefox/Oasis on **Windows** (e.g. MozillaBuild) who see **warnings** (not errors) from **`intl/icu`** during `./mach build`, similar to:

- `locmap.cpp`: `unused variable 'len' [-Wunused-variable]`
- `displayoptions.cpp`: `result of comparison '...' >= 0 is always true [-Wtautological-type-limit-compare]`

The build normally **continues** after these messages. They do **not** by themselves mean your tree or Oasis setup is wrong.

---

## What was evaluated

### 1. `intl/icu/source/common/locmap.cpp` (unused `len`)

**Location:** `uprv_convertToLCIDPlatform`, inside:

```cpp
#if U_PLATFORM_HAS_WIN32_API && UCONFIG_USE_WINDOWS_LCID_MAPPING_API
```

**Finding:** `int32_t len;` is declared but **never used** anywhere in that `#if` block. The rest of the block uses `baseName`, `mylocaleID`, `asciiBCP47Tag`, `bcp47Tag`, and `LocaleNameToLCID` without referencing `len`.

**Why Windows shows it:** That preprocessor branch is compiled **only when the Win32 API path is active**. On macOS/Linux the same source is parsed, but this block is **excluded**, so other platforms never compile the unused variable and do not get this warning.

**Conclusion:** Harmless **dead code** in vendored ICU, likely a leftover from a refactor. Windows builds are the ones that exercise this path.

---

### 2. `intl/icu/source/i18n/displayoptions.cpp` (tautological `>= 0`)

**Pattern:** Functions such as `udispopt_getGrammaticalCaseIdentifier` use:

```cpp
if (grammaticalCase >= 0 && grammaticalCase < UPRV_LENGTHOF(grammaticalCaseIds)) {
```

(and the same for plural category and noun class).

**Finding:** The types (`UDisplayOptionsGrammaticalCase`, etc.) are C-style enums in `intl/icu/source/i18n/unicode/udisplayoptions.h` with **only non-negative enumerators**. **Clang** (used in Mozilla Windows builds, e.g. clang-cl) diagnoses `value >= 0` as **always true** for the promoted type (`-Wtautological-type-limit-compare`).

**Why it matters less than it sounds:** The author’s intent is a bounds check before indexing a C array. The **upper** bound (`< UPRV_LENGTHOF(...)`) is the meaningful part for Clang’s analysis of the lower bound.

**Conclusion:** ICU’s defensive style clashes with Clang’s warning. This is **not Oasis-specific**; it is ICU + compiler warning level.

---

## Impact on your work

| Question | Answer |
|----------|--------|
| Is the build broken? | **No**, unless your configuration treats these warnings as errors (unusual for default Firefox/Oasis builds). |
| Is Oasis misconfigured? | **No.** These come from **upstream-style ICU** under `intl/icu`. |
| Should you stop and fix ICU before continuing? | **No** for day-to-day development unless your team policy requires a clean warning set. |

---

## Ways to fix or move forward

### Option A: Ignore for now (recommended for most)

Treat the messages as **noise from third-party code**. Confirm the build **finishes** and use `./mach run` or your usual validation. No code change required.

### Option B: Local patch in `intl/icu` (silence warnings)

If you need a quieter log (or stricter `-Werror` somewhere in the chain):

1. **`locmap.cpp`**  
   - Remove the unused `int32_t len;` line, **or**  
   - If something later needs a length placeholder: `(void)len;` after assigning, or use a real length from an API that returns it.  
   - Minimal fix: **delete the unused declaration**.

2. **`displayoptions.cpp`**  
   - Replace `if (x >= 0 && x < N)` with **`if (x < N)`** for the three affected functions (grammatical case, plural category, noun class), **or**  
   - Cast to a signed type only if you must preserve “negative means invalid” semantics (not needed for these enums as defined today).

**Caveat:** Editing `intl/icu` creates **divergence from upstream Firefox/ICU**. Prefer upstreaming fixes or carrying a **small documented patch** if your fork policy allows it. When merging from mozilla-central, watch for **conflicts** in the same hunks.

### Option C: Upstream / merge path

- Check whether **mozilla-central** or **ICU** already fixed these in a newer snapshot (Firefox periodically updates `intl/icu`).
- If yes, **merge or rebase** the ICU update rather than hand-patching.
- If you contribute a fix upstream, downstream merges pick it up without permanent fork drift.

### Option D: Narrow compiler diagnostics (advanced)

Adjusting warning flags for ICU only is possible in the build system (`moz.build` / per-directory compile flags), but it is **more invasive** than a two-line ICU fix and may be harder to justify in review. Most teams choose A or B.

---

## Quick checklist for the struggling engineer

1. Confirm messages say **`warning:`**, not **`error:`**.
2. Scroll the log: later tiers (e.g. `docshell`, `browser`) should still compile if nothing else failed.
3. If the build **stops**, look for the **first error** (often unrelated to ICU).
4. If you only care about **Oasis UI / assistant** changes, a full browser build still pulls ICU once; warnings there do not invalidate assistant work.

---

## References (paths in this tree)

- `intl/icu/source/common/locmap.cpp` — Win32 LCID path, unused `len`
- `intl/icu/source/i18n/displayoptions.cpp` — tautological `>= 0` checks
- `intl/icu/source/i18n/unicode/udisplayoptions.h` — enum definitions for display options

Document version: written for Oasis / Firefox-on-Windows ICU warning triage.
