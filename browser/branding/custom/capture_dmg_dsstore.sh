#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=dmg_layout_common.sh
source "${SCRIPT_DIR}/dmg_layout_common.sh"
OUTPUT_DSSTORE="${SCRIPT_DIR}/dsstore"
LAYOUT_DIR="${SCRIPT_DIR}/build/dmg-layout"
CAPTURE_DIR="${SCRIPT_DIR}/build/dmg-capture"
SCRATCH_RW="${CAPTURE_DIR}/scratch-rw.dmg"
BACKGROUND="${SCRIPT_DIR}/background.png"
VOLUME_ICON="${SCRIPT_DIR}/disk.icns"
CAPTURE_VOLUME="OasisCap9"
VOLUME_NAME="Oasis"
APP_NAME="Oasis.app"
SCRATCH_SIZE_MB=800

usage() {
  echo "Usage: $0 <staged-package-dir>" >&2
  echo "  staged-package-dir  e.g. obj-*/dist/firefox from: make -C obj-*/browser/installer stage-package" >&2
  echo "  Fallback only: prefer finalize_dmg_layout.sh on the built .dmg after make_dmg." >&2
  exit 1
}

if [[ "${1:-}" == "--python-only" ]]; then
  exec python3 "${SCRIPT_DIR}/generate_dmg_dsstore.py"
fi

[[ "$(uname -s)" == "Darwin" ]] || {
  echo "error: capture_dmg_dsstore.sh must run on macOS" >&2
  exit 1
}

[[ -f "${BACKGROUND}" ]] || {
  echo "error: run build_branding_icons.sh first (missing background.png)" >&2
  exit 1
}
[[ -f "${VOLUME_ICON}" ]] || {
  echo "error: missing disk.icns" >&2
  exit 1
}

STAGE_SRC="${1:-}"
if [[ -z "${STAGE_SRC}" ]]; then
  usage
fi
[[ -d "${STAGE_SRC}/${APP_NAME}" ]] || {
  echo "error: ${STAGE_SRC}/${APP_NAME} not found (run stage-package first)" >&2
  exit 1
}

MOUNT_POINT=""
cleanup() {
  if [[ -n "${MOUNT_POINT}" ]] && mount | grep -q "on ${MOUNT_POINT} "; then
    hdiutil detach "${MOUNT_POINT}" -quiet || true
  fi
}
trap cleanup EXIT

verify_dsstore() {
  local dsstore="$1"
  [[ -s "${dsstore}" ]] || {
    echo "error: dsstore is empty" >&2
    return 1
  }
  local size
  size="$(wc -c < "${dsstore}" | tr -d ' ')"
  if [[ "${size}" -lt 8192 ]]; then
    echo "error: dsstore too small (${size} bytes)" >&2
    return 1
  fi
  if strings "${dsstore}" | grep -qE 'Nightly|firefox-installer|oasis-dmg-install'; then
    echo "error: dsstore still references stale Firefox installer paths" >&2
    return 1
  fi
  if strings "${dsstore}" | grep -q 'private/var/folders'; then
    echo "error: dsstore background alias points at a temp folder path" >&2
    return 1
  fi
  if ! strings "${dsstore}" | grep -q 'background.png'; then
    echo "error: dsstore does not reference background.png" >&2
    return 1
  fi
  if ! strings "${dsstore}" | grep -q "${VOLUME_NAME}"; then
    echo "error: dsstore does not reference volume name ${VOLUME_NAME}" >&2
    return 1
  fi
  if strings "${dsstore}" | grep -q "${CAPTURE_VOLUME}"; then
    echo "error: dsstore still references capture volume ${CAPTURE_VOLUME}" >&2
    return 1
  fi
  return 0
}

patch_dsstore_volume_name() {
  python3 - "${OUTPUT_DSSTORE}" "${CAPTURE_VOLUME}" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
capture = sys.argv[2].encode("ascii")
target = b"Oasis\x00\x00\x00\x00"
if len(capture) != len(target):
    raise SystemExit(f"capture volume name must be {len(target)} bytes")
data = path.read_bytes()
data = data.replace(b"/Volumes/" + capture, b"/Volumes/Oasis\x00\x00\x00")
data = data.replace(capture, target)
path.write_bytes(data)
PY
}

prepare_layout_folder() {
  rm -rf "${LAYOUT_DIR}"
  mkdir -p "${LAYOUT_DIR}/.background"
  cp "${BACKGROUND}" "${LAYOUT_DIR}/.background/background.png"
  cp "${VOLUME_ICON}" "${LAYOUT_DIR}/.VolumeIcon.icns"
  rsync -a "${STAGE_SRC}/${APP_NAME}" "${LAYOUT_DIR}/"
  ln -sf /Applications "${LAYOUT_DIR}/ "
}

capture_from_rw_volume() {
  mkdir -p "${CAPTURE_DIR}"
  rm -f "${SCRATCH_RW}"

  echo "Preparing layout folder..."
  prepare_layout_folder

  echo "Creating ${SCRATCH_SIZE_MB}MB HFS scratch volume (${CAPTURE_VOLUME})..."
  hdiutil detach "/Volumes/${VOLUME_NAME}" -quiet 2>/dev/null || true
  hdiutil detach "/Volumes/${CAPTURE_VOLUME}" -quiet 2>/dev/null || true
  hdiutil create -size "${SCRATCH_SIZE_MB}m" -fs HFS+ -volname "${CAPTURE_VOLUME}" "${SCRATCH_RW}" >/dev/null

  MOUNT_OUT="$(hdiutil attach -readwrite -nobrowse "${SCRATCH_RW}")"
  MOUNT_POINT="$(echo "${MOUNT_OUT}" | awk 'END {print $3}')"
  [[ -d "${MOUNT_POINT}" ]] || {
    echo "error: could not mount scratch volume" >&2
    return 1
  }

  echo "Copying layout to ${MOUNT_POINT}..."
  ditto "${LAYOUT_DIR}/" "${MOUNT_POINT}/"

  local vol_posix bg_posix
  vol_posix="$(cd "${MOUNT_POINT}" && pwd)"
  bg_posix="${vol_posix}/.background/background.png"

  echo "Configuring Finder on ${vol_posix}..."
  osascript <<APPLESCRIPT
tell application "Finder"
  activate
  close every window
  set volumeFolder to POSIX file "${vol_posix}" as alias
  set bgFile to POSIX file "${bg_posix}" as alias
  open volumeFolder
  delay 2
  set dmgWindow to front window
  tell dmgWindow
    set current view to icon view
    set toolbar visible to false
    set statusbar visible to false
    set bounds to {120, 80, ${DMG_LAYOUT_WINDOW_WIDTH} + 120, ${DMG_LAYOUT_WINDOW_HEIGHT} + 80}
  end tell
  tell icon view options of dmgWindow
    set icon size to ${DMG_LAYOUT_ICON_SIZE}
    set background picture to bgFile
    set text size to 12
  end tell
  tell dmgWindow
    set position of item "${APP_NAME}" to {${DMG_LAYOUT_APP_ICON_X}, ${DMG_LAYOUT_APP_ICON_Y}}
    set position of item " " to {${DMG_LAYOUT_APPS_ICON_X}, ${DMG_LAYOUT_APPS_ICON_Y}}
  end tell
  delay 3
  close dmgWindow
end tell
APPLESCRIPT

  local ds_size=0
  local attempt
  for attempt in 1 2 3; do
    if [[ -f "${MOUNT_POINT}/.DS_Store" ]]; then
      ds_size="$(wc -c < "${MOUNT_POINT}/.DS_Store" | tr -d ' ')"
      if [[ "${ds_size}" -ge 8192 ]]; then
        break
      fi
    fi
    echo "Finder layout not saved (attempt ${attempt}); retrying..."
  osascript <<APPLESCRIPT
tell application "Finder"
  set volumeFolder to POSIX file "${vol_posix}" as alias
  set bgFile to POSIX file "${bg_posix}" as alias
  open volumeFolder
  delay 2
  set dmgWindow to front window
  tell dmgWindow
    set current view to icon view
    set toolbar visible to false
    set statusbar visible to false
    set bounds to {120, 80, ${DMG_LAYOUT_WINDOW_WIDTH} + 120, ${DMG_LAYOUT_WINDOW_HEIGHT} + 80}
  end tell
  tell icon view options of dmgWindow
    set icon size to ${DMG_LAYOUT_ICON_SIZE}
    set background picture to bgFile
    set text size to 12
  end tell
  tell dmgWindow
    set position of item "${APP_NAME}" to {${DMG_LAYOUT_APP_ICON_X}, ${DMG_LAYOUT_APP_ICON_Y}}
    set position of item " " to {${DMG_LAYOUT_APPS_ICON_X}, ${DMG_LAYOUT_APPS_ICON_Y}}
  end tell
  delay 3
  close dmgWindow
end tell
APPLESCRIPT
  done

  [[ -f "${MOUNT_POINT}/.DS_Store" ]] || {
    echo "error: Finder did not write .DS_Store on ${MOUNT_POINT}" >&2
    return 1
  }
  ds_size="$(wc -c < "${MOUNT_POINT}/.DS_Store" | tr -d ' ')"
  if [[ "${ds_size}" -lt 8192 ]]; then
    echo "error: .DS_Store too small (${ds_size} bytes); grant Finder automation permission" >&2
    return 1
  fi

  cp "${MOUNT_POINT}/.DS_Store" "${OUTPUT_DSSTORE}"
  hdiutil detach "${MOUNT_POINT}" -quiet
  MOUNT_POINT=""

  echo "Patching volume name ${CAPTURE_VOLUME} -> ${VOLUME_NAME} in dsstore..."
  patch_dsstore_volume_name

  verify_dsstore "${OUTPUT_DSSTORE}" || return 1
  echo "Wrote ${OUTPUT_DSSTORE}"
}

if capture_from_rw_volume; then
  exit 0
fi

echo "warning: Finder capture failed; falling back to generate_dmg_dsstore.py" >&2
if python3 "${SCRIPT_DIR}/generate_dmg_dsstore.py"; then
  echo "warning: using fallback dsstore (background image may not appear)" >&2
  exit 0
fi

echo "error: could not produce dsstore" >&2
exit 1
