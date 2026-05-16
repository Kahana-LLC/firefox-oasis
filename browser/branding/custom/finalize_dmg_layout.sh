#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
# shellcheck source=dmg_layout_common.sh
source "${SCRIPT_DIR}/dmg_layout_common.sh"

OUTPUT_DSSTORE="${SCRIPT_DIR}/dsstore"
BACKGROUND="${SCRIPT_DIR}/background.png"
VOLUME_ICON="${SCRIPT_DIR}/disk.icns"
CAPTURE_DIR="${SCRIPT_DIR}/build/dmg-capture"
SHADOW_FILE="${CAPTURE_DIR}/dmg-shadow.img"

usage() {
  echo "Usage: $0 <path-to.dmg> [staged-package-dir]" >&2
  echo "  Captures Finder layout on the Oasis volume, writes dsstore, then repacks" >&2
  echo "  the DMG so changes are baked in (shadow-only edits are not visible on open)." >&2
  echo "  staged-package-dir defaults to <dmg-dir>/firefox" >&2
  exit 1
}

repack_dmg() {
  local stage_dir="$1"
  local dmg_path="$2"
  if [[ ! -d "${stage_dir}/${DMG_LAYOUT_APP_NAME}" ]]; then
    echo "error: staged package missing ${DMG_LAYOUT_APP_NAME} in ${stage_dir}" >&2
    return 1
  fi
  echo "Repacking ${dmg_path} with captured dsstore..."
  (
    cd "${REPO_ROOT}"
    ./mach python -m mozbuild.action.make_dmg \
      --dsstore "${OUTPUT_DSSTORE}" \
      --background "${BACKGROUND}" \
      --icon "${VOLUME_ICON}" \
      --volume-name "${DMG_LAYOUT_VOLUME_NAME}" \
      "${stage_dir}" \
      "${dmg_path}"
  )
}

[[ "$(uname -s)" == "Darwin" ]] || {
  echo "error: finalize_dmg_layout.sh must run on macOS" >&2
  exit 1
}

DMG_PATH="${1:-}"
STAGEDIR="${2:-}"
if [[ -z "${DMG_PATH}" || ! -f "${DMG_PATH}" ]]; then
  usage
fi
[[ -f "${BACKGROUND}" ]] || {
  echo "error: run build_branding_icons.sh first" >&2
  exit 1
}

DMG_PATH="$(cd "$(dirname "${DMG_PATH}")" && pwd)/$(basename "${DMG_PATH}")"
if [[ -z "${STAGEDIR}" ]]; then
  STAGEDIR="$(dirname "${DMG_PATH}")/firefox"
fi
if [[ ! -d "${STAGEDIR}" ]]; then
  echo "error: staged package not found at ${STAGEDIR}" >&2
  echo "  run: make -C obj-*/browser/installer stage-package" >&2
  exit 1
fi
STAGEDIR="$(cd "${STAGEDIR}" && pwd)"

mkdir -p "${CAPTURE_DIR}"

MOUNT_POINT=""
cleanup() {
  if [[ -n "${MOUNT_POINT}" ]] && mount | grep -F "on ${MOUNT_POINT} " >/dev/null 2>&1; then
    hdiutil detach "${MOUNT_POINT}" -quiet || true
  fi
}
trap cleanup EXIT

echo "Detaching any existing ${DMG_LAYOUT_VOLUME_NAME} mounts..."
hdiutil detach "/Volumes/${DMG_LAYOUT_VOLUME_NAME}" -quiet 2>/dev/null || true

echo "Attaching ${DMG_PATH} read-write (shadow)..."
rm -f "${SHADOW_FILE}"
MOUNT_OUT="$(hdiutil attach -readwrite -shadow "${SHADOW_FILE}" -nobrowse "${DMG_PATH}")"
MOUNT_POINT="$(echo "${MOUNT_OUT}" | awk 'END {print $3}')"
[[ -d "${MOUNT_POINT}" ]] || {
  echo "error: could not mount DMG at ${DMG_PATH}" >&2
  exit 1
}

vol_posix="$(cd "${MOUNT_POINT}" && pwd)"
echo "Mounted at ${vol_posix}"

mkdir -p "${vol_posix}/.background"
vol_bg="${vol_posix}/.background/background.png"
if [[ -f "${vol_bg}" ]] && cmp -s "${BACKGROUND}" "${vol_bg}"; then
  echo "background.png already present on volume"
elif [[ -f "${vol_bg}" ]]; then
  echo "error: volume background differs from ${BACKGROUND}; rebuild DMG with make_dmg" >&2
  exit 1
else
  cp "${BACKGROUND}" "${vol_bg}"
fi

if [[ -f "${vol_bg}" ]] && python3 "${SCRIPT_DIR}/write_dmg_dsstore.py" \
  --output "${OUTPUT_DSSTORE}" \
  --volume-background "${vol_bg}"; then
  echo "Wrote ${OUTPUT_DSSTORE} with volume-relative background alias"
else
  echo "warning: write_dmg_dsstore.py failed; falling back to Finder capture" >&2
  echo "Configuring Finder layout on ${DMG_LAYOUT_VOLUME_NAME}..."
  configure_finder_on_volume "${vol_posix}"
  wait_for_dsstore "${MOUNT_POINT}"
  cp "${MOUNT_POINT}/.DS_Store" "${OUTPUT_DSSTORE}"
fi
verify_dsstore_file "${OUTPUT_DSSTORE}"
if strings "${OUTPUT_DSSTORE}" | grep -qE '\.dmg|scratch-rw\.dmg|private/var/folders'; then
  echo "error: dsstore aliases a host .dmg path; install ds-store/mac-alias and re-run finalize" >&2
  exit 1
fi

echo "Detaching ${MOUNT_POINT}..."
hdiutil detach "${MOUNT_POINT}" -quiet
MOUNT_POINT=""

repack_dmg "${STAGEDIR}" "${DMG_PATH}"

hdiutil detach "/Volumes/${DMG_LAYOUT_VOLUME_NAME}" -quiet 2>/dev/null || true
MOUNT_OUT="$(hdiutil attach -nobrowse "${DMG_PATH}")"
MOUNT_POINT="$(echo "${MOUNT_OUT}" | awk 'END {print $3}')"
if ! cmp -s "${OUTPUT_DSSTORE}" "${MOUNT_POINT}/.DS_Store"; then
  echo "error: repacked DMG .DS_Store does not match ${OUTPUT_DSSTORE}" >&2
  hdiutil detach "${MOUNT_POINT}" -quiet || true
  exit 1
fi
hdiutil detach "${MOUNT_POINT}" -quiet
MOUNT_POINT=""

rm -f "${SHADOW_FILE}"

echo "Wrote ${OUTPUT_DSSTORE} and repacked ${DMG_PATH}"
echo "Open the DMG to confirm: open \"${DMG_PATH}\""
