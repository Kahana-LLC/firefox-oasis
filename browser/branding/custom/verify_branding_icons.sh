#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=dmg_layout_common.sh
source "${SCRIPT_DIR}/dmg_layout_common.sh"

fail() {
  echo "error: $*" >&2
  exit 1
}

expect_dimensions() {
  local file="$1"
  local expected="$2"
  local width
  width="$(sips -g pixelWidth "${file}" 2>/dev/null | awk '/pixelWidth:/ {print $2}')"
  [[ "${width}" == "${expected}" ]] || fail "${file} expected width ${expected}, got ${width}"
}

expect_rgb_colorspace() {
  local file="$1"
  local space
  space="$(sips -g space "${file}" 2>/dev/null | awk '/space:/ {print $2}')"
  [[ "${space}" == "RGB" ]] || fail "${file} expected RGB colorspace, got ${space}"
}

expect_png_dimensions() {
  local file="$1"
  local width="$2"
  local height="$3"
  local got_w got_h
  got_w="$(sips -g pixelWidth "${file}" 2>/dev/null | awk '/pixelWidth:/ {print $2}')"
  got_h="$(sips -g pixelHeight "${file}" 2>/dev/null | awk '/pixelHeight:/ {print $2}')"
  [[ "${got_w}" == "${width}" && "${got_h}" == "${height}" ]] \
    || fail "${file} expected ${width}x${height}, got ${got_w}x${got_h}"
}

expect_light_background() {
  local file="$1"
  if ! command -v magick &>/dev/null; then
    return 0
  fi
  local corner_r
  corner_r="$(magick "${file}[80x80+0+0]" -scale 1x1 -format '%[fx:r]' info:)"
  awk -v lum="${corner_r}" 'BEGIN { exit !(lum > 0.85) }' \
    || fail "${file} corner fill is too dark for white Oasis DMG (r=${corner_r})"
}

[[ -f "${SCRIPT_DIR}/Assets.car" ]] || fail "missing Assets.car"
[[ -f "${SCRIPT_DIR}/firefox.icns" ]] || fail "missing firefox.icns"
[[ -f "${SCRIPT_DIR}/disk.icns" ]] || fail "missing disk.icns"

expect_dimensions "${SCRIPT_DIR}/content/about-logo.png" 64
expect_dimensions "${SCRIPT_DIR}/content/about-logo@2x.png" 128
expect_rgb_colorspace "${SCRIPT_DIR}/content/about-logo.png"

if [[ -f "${SCRIPT_DIR}/build/icon-master-ui-1024.png" ]]; then
  expect_rgb_colorspace "${SCRIPT_DIR}/build/icon-master-ui-1024.png"
fi

if strings "${SCRIPT_DIR}/Assets.car" | grep -q 'unofficial-'; then
  fail "Assets.car contains unofficial Mozilla asset names"
fi

[[ -f "${SCRIPT_DIR}/background.png" ]] || fail "missing background.png"
expect_png_dimensions "${SCRIPT_DIR}/background.png" 1440 880
expect_rgb_colorspace "${SCRIPT_DIR}/background.png"
expect_light_background "${SCRIPT_DIR}/background.png"

expect_dmg_background_graphics() {
  local file="$1"
  if ! command -v magick &>/dev/null; then
    return 0
  fi
  local shaft_end=$((DMG_LAYOUT_ARROW_LINE_X2 - DMG_LAYOUT_ARROW_CHEVRON_SIZE))
  local arrow_mid_x=$(((DMG_LAYOUT_ARROW_LINE_X1 + shaft_end) / 2))
  local arrow_r arrow_g arrow_b
  read -r arrow_r arrow_g arrow_b <<<"$(magick "${file}" -crop "1x1+${arrow_mid_x}+${DMG_LAYOUT_ARROW_Y}" \
    -scale 1x1 -format '%[fx:r] %[fx:g] %[fx:b]' info:)"
  awk -v r="${arrow_r}" -v g="${arrow_g}" -v b="${arrow_b}" \
    'BEGIN { exit !(r > 0.45 && r < 0.85 && g > 0.45 && g < 0.85 && b > 0.45 && b < 0.85) }' \
    || fail "${file} arrow mid-pixel not grey (r=${arrow_r} g=${arrow_g} b=${arrow_b})"
  local text_r
  text_r="$(magick "${file}" -crop "1x1+720+70" -scale 1x1 -format '%[fx:r]' info:)"
  awk -v lum="${text_r}" 'BEGIN { exit !(lum < 0.25) }' \
    || fail "${file} headline area not dark enough (r=${text_r})"
  local tip_clearance shaft_clearance
  tip_clearance=$((DMG_LAYOUT_ICON_INNER_RIGHT - DMG_LAYOUT_ARROW_LINE_X2))
  shaft_clearance=$((DMG_LAYOUT_ARROW_LINE_X1 - DMG_LAYOUT_ICON_INNER_LEFT))
  [[ "${tip_clearance}" -ge ${DMG_LAYOUT_ARROW_TIP_CLEARANCE} ]] \
    || fail "${file} chevron too close to Applications (clearance ${tip_clearance}px, need ${DMG_LAYOUT_ARROW_TIP_CLEARANCE})"
  [[ "${shaft_clearance}" -ge ${DMG_LAYOUT_ARROW_SHAFT_CLEARANCE} ]] \
    || fail "${file} arrow shaft too close to Oasis (clearance ${shaft_clearance}px, need ${DMG_LAYOUT_ARROW_SHAFT_CLEARANCE})"
  local tip_r tip_g tip_b
  read -r tip_r tip_g tip_b <<<"$(magick "${file}" -crop "1x1+${DMG_LAYOUT_ARROW_LINE_X2}+${DMG_LAYOUT_ARROW_Y}" \
    -scale 1x1 -format '%[fx:r] %[fx:g] %[fx:b]' info:)"
  awk -v r="${tip_r}" -v g="${tip_g}" -v b="${tip_b}" \
    'BEGIN { exit !(r > 0.45 && r < 0.85 && g > 0.45 && g < 0.85 && b > 0.45 && b < 0.85) }' \
    || fail "${file} chevron tip not grey at (${DMG_LAYOUT_ARROW_LINE_X2},${DMG_LAYOUT_ARROW_Y})"
  local bottom_edge_y=$((DMG_LAYOUT_WINDOW_HEIGHT - 1))
  local bottom_r
  bottom_r="$(magick "${file}" -crop "1x1+720+${bottom_edge_y}" -scale 1x1 -format '%[fx:r]' info:)"
  awk -v lum="${bottom_r}" 'BEGIN { exit !(lum > 0.90) }' \
    || fail "${file} sloth clipped at window bottom (y=${bottom_edge_y} r=${bottom_r})"
}

expect_dmg_background_graphics "${SCRIPT_DIR}/background.png"

icon_span=$((DMG_LAYOUT_APPS_ICON_X + DMG_LAYOUT_ICON_SIZE - DMG_LAYOUT_APP_ICON_X))
[[ "${icon_span}" -eq "${DMG_LAYOUT_FEATURE_ART_WIDTH}" ]] \
  || fail "icon cluster span ${icon_span}px != feature art width ${DMG_LAYOUT_FEATURE_ART_WIDTH}px"
[[ -f "${SCRIPT_DIR}/build/dmg-cluster-width.env" ]] \
  || fail "missing build/dmg-cluster-width.env; run build_branding_icons.sh first"
grep -q '^DMG_LAYOUT_SLOTH_INK_WIDTH=' "${SCRIPT_DIR}/build/dmg-cluster-width.env" \
  || fail "dmg-cluster-width.env missing DMG_LAYOUT_SLOTH_INK_WIDTH"
grep -q '^DMG_LAYOUT_FEATURE_ART_WIDTH=' "${SCRIPT_DIR}/build/dmg-cluster-width.env" \
  || fail "dmg-cluster-width.env missing DMG_LAYOUT_FEATURE_ART_WIDTH"
if [[ "${DMG_LAYOUT_SLOTH_INK_WIDTH}" -gt 0 && "${DMG_LAYOUT_FEATURE_ART_WIDTH}" -gt "${DMG_LAYOUT_SLOTH_INK_WIDTH}" ]]; then
  :
else
  fail "icon cluster width should exceed sloth ink width (ink=${DMG_LAYOUT_SLOTH_INK_WIDTH} cluster=${DMG_LAYOUT_FEATURE_ART_WIDTH})"
fi

[[ -f "${SCRIPT_DIR}/dsstore" ]] || fail "missing dsstore"
dsstore_size="$(wc -c < "${SCRIPT_DIR}/dsstore" | tr -d ' ')"
[[ "${dsstore_size}" -ge 4096 ]] || fail "dsstore too small (${dsstore_size} bytes); run capture_dmg_dsstore.sh"
if strings "${SCRIPT_DIR}/dsstore" | grep -qE 'Nightly|firefox-installer|oasis-dmg-install'; then
  fail "dsstore still references stale Firefox installer paths; run capture_dmg_dsstore.sh"
fi
if strings "${SCRIPT_DIR}/dsstore" | grep -q 'private/var/folders'; then
  fail "dsstore background alias points at a temp folder; run capture_dmg_dsstore.sh"
fi
if ! strings "${SCRIPT_DIR}/dsstore" | grep -q 'background.png'; then
  fail "dsstore does not reference background.png; run capture_dmg_dsstore.sh"
fi

echo "ok: Oasis branding icons verified"
