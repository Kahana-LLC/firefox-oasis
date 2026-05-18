# Shared DMG Finder layout constants and helpers.
# shellcheck shell=bash

_DMG_LAYOUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DMG_CLUSTER_WIDTH_ENV="${_DMG_LAYOUT_DIR}/build/dmg-cluster-width.env"

DMG_LAYOUT_VOLUME_NAME="Oasis"
DMG_LAYOUT_APP_NAME="Oasis.app"
DMG_LAYOUT_WINDOW_WIDTH=1440
DMG_LAYOUT_WINDOW_HEIGHT=880
DMG_LAYOUT_ICON_SIZE=128
DMG_LAYOUT_FEATURE_ART_WIDTH_PCT=40
DMG_LAYOUT_APP_ICON_Y=300
DMG_LAYOUT_APPS_ICON_Y=300
DMG_LAYOUT_MIN_DSSTORE_BYTES=8192

DMG_LAYOUT_ARROW_Y_BG_OFFSET=-32
DMG_LAYOUT_ARROW_X_OFFSET=-76
DMG_LAYOUT_ARROW_TIP_CLEARANCE=104
DMG_LAYOUT_ARROW_SHAFT_CLEARANCE=16
DMG_LAYOUT_ARROW_GAP_PAD=10
DMG_LAYOUT_ARROW_CHEVRON_SIZE=16
DMG_LAYOUT_ARROW_CHEVRON_HALF=8
DMG_LAYOUT_ICON_CLUSTER_PAD=16
DMG_LAYOUT_SLOTH_BOTTOM_INSET=56
DMG_LAYOUT_SLOTH_MAX_HEIGHT_PCT=42
DMG_LAYOUT_SLOTH_INK_WIDTH=0

DMG_LAYOUT_FEATURE_ART_WIDTH=$((DMG_LAYOUT_WINDOW_WIDTH * DMG_LAYOUT_FEATURE_ART_WIDTH_PCT / 100))

dmg_layout_recompute_positions() {
  DMG_LAYOUT_CLUSTER_LEFT=$(((DMG_LAYOUT_WINDOW_WIDTH - DMG_LAYOUT_FEATURE_ART_WIDTH) / 2))
  DMG_LAYOUT_APP_ICON_X=${DMG_LAYOUT_CLUSTER_LEFT}
  DMG_LAYOUT_APPS_ICON_X=$((DMG_LAYOUT_CLUSTER_LEFT + DMG_LAYOUT_FEATURE_ART_WIDTH - DMG_LAYOUT_ICON_SIZE))

  DMG_LAYOUT_APP_CENTER_X=$((DMG_LAYOUT_APP_ICON_X + DMG_LAYOUT_ICON_SIZE / 2))
  DMG_LAYOUT_APPS_CENTER_X=$((DMG_LAYOUT_APPS_ICON_X + DMG_LAYOUT_ICON_SIZE / 2))
  DMG_LAYOUT_ICON_CENTER_Y=$((DMG_LAYOUT_APP_ICON_Y + DMG_LAYOUT_ICON_SIZE / 2))
  DMG_LAYOUT_ICON_INNER_LEFT=$((DMG_LAYOUT_APP_ICON_X + DMG_LAYOUT_ICON_SIZE))
  DMG_LAYOUT_ICON_INNER_RIGHT=${DMG_LAYOUT_APPS_ICON_X}
  DMG_LAYOUT_ARROW_Y=$((DMG_LAYOUT_ICON_CENTER_Y + DMG_LAYOUT_ARROW_Y_BG_OFFSET))
  DMG_LAYOUT_GAP_MID=$(((DMG_LAYOUT_ICON_INNER_LEFT + DMG_LAYOUT_ICON_INNER_RIGHT) / 2))
  local gap_inner_left=$((DMG_LAYOUT_ICON_INNER_LEFT + DMG_LAYOUT_ARROW_GAP_PAD))
  local gap_inner_right=$((DMG_LAYOUT_ICON_INNER_RIGHT - DMG_LAYOUT_ARROW_GAP_PAD))
  local gap_inner_w=$((gap_inner_right - gap_inner_left))
  local assembly_w=${gap_inner_w}
  local shaft_w=$((assembly_w - DMG_LAYOUT_ARROW_CHEVRON_SIZE))
  if [[ ${shaft_w} -lt 1 ]]; then
    shaft_w=1
    assembly_w=$((DMG_LAYOUT_ARROW_CHEVRON_SIZE + 1))
  fi
  DMG_LAYOUT_ARROW_LINE_X1=$((DMG_LAYOUT_GAP_MID - shaft_w / 2))
  DMG_LAYOUT_ARROW_LINE_X2=$((DMG_LAYOUT_GAP_MID + shaft_w / 2))
  DMG_LAYOUT_ARROW_LINE_X1=$((DMG_LAYOUT_ARROW_LINE_X1 + DMG_LAYOUT_ARROW_X_OFFSET))
  DMG_LAYOUT_ARROW_LINE_X2=$((DMG_LAYOUT_ARROW_LINE_X2 + DMG_LAYOUT_ARROW_X_OFFSET))
  local tip_max=$((DMG_LAYOUT_ICON_INNER_RIGHT - DMG_LAYOUT_ARROW_TIP_CLEARANCE))
  local shaft_min=$((DMG_LAYOUT_ICON_INNER_LEFT + DMG_LAYOUT_ARROW_SHAFT_CLEARANCE))
  if [[ ${DMG_LAYOUT_ARROW_LINE_X2} -gt ${tip_max} ]]; then
    DMG_LAYOUT_ARROW_LINE_X2=${tip_max}
  fi
  if [[ ${DMG_LAYOUT_ARROW_LINE_X1} -lt ${shaft_min} ]]; then
    DMG_LAYOUT_ARROW_LINE_X1=${shaft_min}
  fi
}

dmg_layout_apply_cluster_width() {
  local width="$1"
  local sloth_ink_w="${2:-0}"
  if [[ -z "${width}" || "${width}" -lt 1 ]]; then
    echo "error: invalid cluster width ${width}" >&2
    return 1
  fi
  DMG_LAYOUT_FEATURE_ART_WIDTH="${width}"
  if [[ "${sloth_ink_w}" -gt 0 ]]; then
    DMG_LAYOUT_SLOTH_INK_WIDTH="${sloth_ink_w}"
  fi
  dmg_layout_recompute_positions
  mkdir -p "${_DMG_LAYOUT_DIR}/build"
  {
    if [[ "${DMG_LAYOUT_SLOTH_INK_WIDTH}" -gt 0 ]]; then
      printf 'DMG_LAYOUT_SLOTH_INK_WIDTH=%s\n' "${DMG_LAYOUT_SLOTH_INK_WIDTH}"
    fi
    printf 'DMG_LAYOUT_FEATURE_ART_WIDTH=%s\n' "${width}"
  } >"${DMG_CLUSTER_WIDTH_ENV}"
}

dmg_layout_recompute_positions

if [[ -f "${DMG_CLUSTER_WIDTH_ENV}" ]]; then
  # shellcheck source=/dev/null
  source "${DMG_CLUSTER_WIDTH_ENV}"
  dmg_layout_recompute_positions
fi

configure_finder_on_volume() {
  local vol_posix="$1"
  local bg_posix="${vol_posix}/.background/background.png"

  if [[ ! -f "${bg_posix}" ]]; then
    echo "error: missing ${bg_posix}" >&2
    return 1
  fi

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
    set position of item "${DMG_LAYOUT_APP_NAME}" to {${DMG_LAYOUT_APP_ICON_X}, ${DMG_LAYOUT_APP_ICON_Y}}
    set position of item " " to {${DMG_LAYOUT_APPS_ICON_X}, ${DMG_LAYOUT_APPS_ICON_Y}}
  end tell
  delay 3
  close dmgWindow
end tell
APPLESCRIPT
}

wait_for_dsstore() {
  local mount_point="$1"
  local attempt
  for attempt in 1 2 3; do
    if [[ -f "${mount_point}/.DS_Store" ]]; then
      local ds_size
      ds_size="$(wc -c < "${mount_point}/.DS_Store" | tr -d ' ')"
      if [[ "${ds_size}" -ge ${DMG_LAYOUT_MIN_DSSTORE_BYTES} ]]; then
        return 0
      fi
    fi
    echo "Finder layout not saved (attempt ${attempt}); retrying..."
    configure_finder_on_volume "$(cd "${mount_point}" && pwd)" || return 1
  done
  echo "error: Finder did not write a valid .DS_Store on ${mount_point}" >&2
  return 1
}

verify_dsstore_file() {
  local dsstore="$1"
  [[ -s "${dsstore}" ]] || {
    echo "error: dsstore is empty" >&2
    return 1
  }
  local size
  size="$(wc -c < "${dsstore}" | tr -d ' ')"
  if [[ "${size}" -lt ${DMG_LAYOUT_MIN_DSSTORE_BYTES} ]]; then
    echo "error: dsstore too small (${size} bytes)" >&2
    return 1
  fi
  if strings "${dsstore}" | grep -qE 'Nightly|firefox-installer|oasis-dmg-install'; then
    echo "error: dsstore references stale Firefox installer paths" >&2
    return 1
  fi
  if strings "${dsstore}" | grep -q 'private/var/folders'; then
    echo "error: dsstore background alias points at a temp folder path" >&2
    return 1
  fi
  if strings "${dsstore}" | grep -q 'OasisCap9'; then
    echo "error: dsstore still references OasisCap9 capture volume" >&2
    return 1
  fi
  if ! strings "${dsstore}" | grep -q 'background.png'; then
    echo "error: dsstore does not reference background.png" >&2
    return 1
  fi
  if ! strings "${dsstore}" | grep -q "${DMG_LAYOUT_VOLUME_NAME}"; then
    echo "error: dsstore does not reference volume ${DMG_LAYOUT_VOLUME_NAME}" >&2
    return 1
  fi
  return 0
}
