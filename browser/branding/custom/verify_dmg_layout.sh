#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=dmg_layout_common.sh
source "${SCRIPT_DIR}/dmg_layout_common.sh"

fail() {
  echo "error: $*" >&2
  exit 1
}

[[ "$(uname -s)" == "Darwin" ]] || fail "verify_dmg_layout.sh must run on macOS"

DMG_PATH="${1:-}"
if [[ -z "${DMG_PATH}" || ! -f "${DMG_PATH}" ]]; then
  echo "Usage: $0 <path-to.dmg>" >&2
  exit 1
fi

DMG_PATH="$(cd "$(dirname "${DMG_PATH}")" && pwd)/$(basename "${DMG_PATH}")"

MOUNT_POINT=""
cleanup() {
  if [[ -n "${MOUNT_POINT}" ]] && mount | grep -F "on ${MOUNT_POINT} " >/dev/null 2>&1; then
    hdiutil detach "${MOUNT_POINT}" -quiet || true
  fi
}
trap cleanup EXIT

hdiutil detach "/Volumes/${DMG_LAYOUT_VOLUME_NAME}" -quiet 2>/dev/null || true
MOUNT_OUT="$(hdiutil attach -nobrowse "${DMG_PATH}")"
MOUNT_POINT="$(echo "${MOUNT_OUT}" | awk 'END {print $3}')"
[[ -d "${MOUNT_POINT}" ]] || fail "could not mount ${DMG_PATH}"

[[ -f "${MOUNT_POINT}/.background/background.png" ]] \
  || fail "missing .background/background.png on volume"
[[ -f "${MOUNT_POINT}/.DS_Store" ]] || fail "missing .DS_Store on volume"

verify_dsstore_file "${MOUNT_POINT}/.DS_Store"

repo_dsstore="${SCRIPT_DIR}/dsstore"
if [[ -f "${repo_dsstore}" ]]; then
  if ! cmp -s "${repo_dsstore}" "${MOUNT_POINT}/.DS_Store"; then
    fail "DMG .DS_Store does not match browser/branding/custom/dsstore; run finalize_dmg_layout.sh"
  fi
fi

if command -v magick &>/dev/null; then
  corner_r="$(magick "${MOUNT_POINT}/.background/background.png[80x80+0+0]" -scale 1x1 -format '%[fx:r]' info:)"
  awk -v lum="${corner_r}" 'BEGIN { exit !(lum > 0.85) }' \
    || fail "background.png corner is too dark for white theme (r=${corner_r})"
fi

[[ -d "${MOUNT_POINT}/${DMG_LAYOUT_APP_NAME}" ]] || fail "missing ${DMG_LAYOUT_APP_NAME}"
[[ -L "${MOUNT_POINT}/ " || -e "${MOUNT_POINT}/ " ]] || fail "missing Applications symlink"

echo "ok: DMG layout verified for ${DMG_PATH}"
