#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=dmg_layout_common.sh
source "${SCRIPT_DIR}/dmg_layout_common.sh"
SVG_FILE="${SCRIPT_DIR}/kahana_logo.svg"
OUTPUT_DIR="${SCRIPT_DIR}"
BUILD_DIR="${SCRIPT_DIR}/build"
MASTER_UI_PNG="${BUILD_DIR}/icon-master-ui-1024.png"
MASTER_DOCK_PNG="${BUILD_DIR}/icon-master-dock-1024.png"
ICONSET_DIR="${BUILD_DIR}/firefox.iconset"
APPICONSET_DIR="${SCRIPT_DIR}/macos/Assets.xcassets/AppIcon.appiconset"
UNOFFICIAL_DIR="${SCRIPT_DIR}/../unofficial"
EMPTY_STATE_BG="${SCRIPT_DIR}/../../base/content/assistant/images/empty-state-bg.png"
ICON_BACKGROUND="#313A00"
DMG_BG_WIDTH=1440
DMG_BG_HEIGHT=880
DMG_BG_COLOR="#ffffff"
DMG_HEADLINE="Click and drag Oasis into the Applications folder"
DMG_SUBLINE="to complete installation"
APP_ICON_SOURCE=""

for candidate in \
  "${SCRIPT_DIR}/app-icon-source.png" \
  "${SCRIPT_DIR}/app-icon-1024.png" \
  "${SCRIPT_DIR}/Oasis Logo(5).png"; do
  if [[ -f "${candidate}" ]]; then
    APP_ICON_SOURCE="${candidate}"
    break
  fi
done

RSVG_CONVERT=""
for candidate in rsvg-convert /opt/homebrew/bin/rsvg-convert /usr/local/bin/rsvg-convert; do
  if command -v "${candidate}" &>/dev/null; then
    RSVG_CONVERT="${candidate}"
    break
  fi
done

if [[ -n "${RSVG_CONVERT}" ]]; then
  RENDER_SVG() {
    "${RSVG_CONVERT}" -w "$1" -h "$1" "${SVG_FILE}" -o "$2"
  }
elif command -v magick &>/dev/null; then
  RENDER_SVG() {
    local size="$1"
    local out="$2"
    local tmp="${BUILD_DIR}/svg-render-full.png"
    magick -density 300 "${SVG_FILE}" -background none -alpha on -colorspace sRGB \
      PNG32:"${tmp}"
    magick "${tmp}" -filter Lanczos -resize "${size}x${size}" PNG32:"${out}"
  }
else
  echo "error: install ImageMagick (brew install imagemagick) or librsvg" >&2
  exit 1
fi

apply_icon_background() {
  local in="$1"
  local out="$2"
  magick "${in}" -channel RGB -fuzz 15% -fill "${ICON_BACKGROUND}" -opaque '#000000' +channel \
    -background "${ICON_BACKGROUND}" -alpha remove -alpha off PNG32:"${out}"
}

if command -v magick &>/dev/null; then
  RESIZE_PNG() {
    magick "$1" -colorspace sRGB -filter Lanczos -resize "${2}x${2}" PNG32:"$3"
  }
elif command -v convert &>/dev/null; then
  RESIZE_PNG() {
    convert "$1" -colorspace sRGB -filter Lanczos -resize "${2}x${2}!" "$3"
  }
else
  echo "error: ImageMagick required for downsampling (brew install imagemagick)" >&2
  exit 1
fi

expect_dimensions() {
  local file="$1"
  local expected="$2"
  local width
  width="$(sips -g pixelWidth "${file}" 2>/dev/null | awk '/pixelWidth:/ {print $2}')"
  if [[ "${width}" != "${expected}" ]]; then
    echo "error: ${file} expected width ${expected}, got ${width}" >&2
    exit 1
  fi
}

expect_rgb_colorspace() {
  local file="$1"
  local space
  space="$(sips -g space "${file}" 2>/dev/null | awk '/space:/ {print $2}')"
  if [[ "${space}" != "RGB" ]]; then
    echo "error: ${file} expected RGB colorspace, got ${space}" >&2
    exit 1
  fi
}

pick_dmg_font() {
  local weight="${1:-regular}"
  local font
  local -a candidates
  if [[ "${weight}" == "bold" ]]; then
    candidates=(
      "SF-Pro-Display-Semibold"
      "SF Pro Display Semibold"
      "Helvetica Neue Bold"
      "Helvetica-Bold"
      "Helvetica Neue"
      "Helvetica"
    )
  else
    candidates=(
      "SF-Pro-Text-Regular"
      "SF Pro Text Regular"
      "Helvetica Neue"
      "Helvetica"
      "Arial"
    )
  fi
  for font in "${candidates[@]}"; do
    if magick -font "${font}" -pointsize 12 label:x /dev/null 2>/dev/null; then
      echo "${font}"
      return
    fi
  done
  echo "Helvetica"
}

build_dmg_background() {
  local out="${OUTPUT_DIR}/background.png"
  local sloth_tmp="${BUILD_DIR}/dmg-sloth.png"
  local sloth_trimmed="${BUILD_DIR}/dmg-sloth-trimmed.png"
  if [[ ! -f "${EMPTY_STATE_BG}" ]]; then
    echo "error: missing ${EMPTY_STATE_BG}" >&2
    exit 1
  fi
  if ! command -v magick &>/dev/null; then
    echo "error: ImageMagick required for DMG background" >&2
    exit 1
  fi

  local sloth_max_w=$((DMG_LAYOUT_WINDOW_WIDTH * DMG_LAYOUT_FEATURE_ART_WIDTH_PCT / 100))
  local sloth_max_h=$((DMG_LAYOUT_WINDOW_HEIGHT * DMG_LAYOUT_SLOTH_MAX_HEIGHT_PCT / 100))
  local ink_w ink_h cluster_w min_cluster_w

  echo "Generating DMG background (${DMG_BG_WIDTH}x${DMG_BG_HEIGHT})..."
  magick "${EMPTY_STATE_BG}" -colorspace sRGB -fuzz 12% -transparent black \
    -filter Lanczos -resize "${sloth_max_w}x" PNG32:"${sloth_tmp}"
  magick "${sloth_tmp}" -trim +repage PNG32:"${sloth_trimmed}"
  ink_w="$(magick identify -format '%w' "${sloth_trimmed}")"
  ink_h="$(magick identify -format '%h' "${sloth_trimmed}")"
  if [[ "${ink_h}" -gt ${sloth_max_h} ]]; then
    magick "${sloth_trimmed}" -filter Lanczos -resize "x${sloth_max_h}" PNG32:"${sloth_trimmed}"
    ink_w="$(magick identify -format '%w' "${sloth_trimmed}")"
    ink_h="$(magick identify -format '%h' "${sloth_trimmed}")"
  fi
  min_cluster_w=$((DMG_LAYOUT_ICON_SIZE * 2))
  cluster_w=$((ink_w + DMG_LAYOUT_ICON_CLUSTER_PAD))
  if [[ "${cluster_w}" -lt ${min_cluster_w} ]]; then
    cluster_w=${min_cluster_w}
  fi
  if [[ "${cluster_w}" -gt ${sloth_max_w} ]]; then
    cluster_w=${sloth_max_w}
  fi
  dmg_layout_apply_cluster_width "${cluster_w}" "${ink_w}"
  echo "DMG layout: sloth ink ${ink_w}px; icon cluster ${cluster_w}px (pad ${DMG_LAYOUT_ICON_CLUSTER_PAD}px; icons at ${DMG_LAYOUT_APP_ICON_X}, ${DMG_LAYOUT_APPS_ICON_X})"

  local headline_font subline_font
  headline_font="$(pick_dmg_font bold)"
  subline_font="$(pick_dmg_font regular)"
  local line_x1=${DMG_LAYOUT_ARROW_LINE_X1}
  local line_x2=${DMG_LAYOUT_ARROW_LINE_X2}
  local arrow_y=${DMG_LAYOUT_ARROW_Y}
  local chevron=${DMG_LAYOUT_ARROW_CHEVRON_SIZE}
  local chevron_half=${DMG_LAYOUT_ARROW_CHEVRON_HALF}
  local shaft_end=$((line_x2 - chevron))

  magick -size "${DMG_BG_WIDTH}x${DMG_BG_HEIGHT}" "xc:${DMG_BG_COLOR}" \
    \( "${sloth_trimmed}" \) -gravity south -geometry +0+${DMG_LAYOUT_SLOTH_BOTTOM_INSET} -composite \
    -stroke '#777777' -strokewidth 3 -fill none \
    -draw "line ${line_x1},${arrow_y} ${shaft_end},${arrow_y}" \
    -fill '#777777' -stroke none \
    -draw "polygon ${line_x2},${arrow_y} $((line_x2 - chevron)),$((arrow_y - chevron_half)) $((line_x2 - chevron)),$((arrow_y + chevron_half))" \
    -stroke none -strokewidth 0 \
    -font "${headline_font}" -fill '#1a1a1a' -pointsize 36 -gravity north \
    -annotate +0+48 "${DMG_HEADLINE}" \
    -font "${subline_font}" -fill '#444444' -pointsize 19 -gravity north \
    -annotate +0+98 "${DMG_SUBLINE}" \
    PNG32:"${out}"
  rm -f "${sloth_tmp}" "${sloth_trimmed}"

  expect_dimensions "${out}" "${DMG_BG_WIDTH}"
  local height
  height="$(sips -g pixelHeight "${out}" 2>/dev/null | awk '/pixelHeight:/ {print $2}')"
  if [[ "${height}" != "${DMG_BG_HEIGHT}" ]]; then
    echo "error: ${out} expected height ${DMG_BG_HEIGHT}, got ${height}" >&2
    exit 1
  fi
  expect_rgb_colorspace "${out}"
}

mkdir -p "${BUILD_DIR}" "${ICONSET_DIR}" "${APPICONSET_DIR}"

if [[ -n "${APP_ICON_SOURCE}" ]]; then
  if ! command -v magick &>/dev/null; then
    echo "error: ImageMagick required to process ${APP_ICON_SOURCE}" >&2
    exit 1
  fi
  echo "Using hand-off icon ${APP_ICON_SOURCE}..."
  magick "${APP_ICON_SOURCE}" -colorspace sRGB -filter Lanczos -resize 1024x1024 \
    PNG32:"${BUILD_DIR}/icon-resized.png"
elif [[ -f "${SVG_FILE}" ]]; then
  echo "Rendering 1024x1024 from ${SVG_FILE}..."
  RENDER_SVG 1024 "${BUILD_DIR}/icon-resized.png"
else
  echo "error: provide app-icon-source.png (or Oasis Logo(5).png) or ${SVG_FILE}" >&2
  exit 1
fi

cp "${BUILD_DIR}/icon-resized.png" "${MASTER_UI_PNG}"
apply_icon_background "${BUILD_DIR}/icon-resized.png" "${MASTER_DOCK_PNG}"

expect_dimensions "${MASTER_UI_PNG}" 1024
expect_dimensions "${MASTER_DOCK_PNG}" 1024
expect_rgb_colorspace "${MASTER_UI_PNG}"

echo "Generating in-browser icon sizes (no dock background)..."
for size in 16 32 48 64 128; do
  RESIZE_PNG "${MASTER_UI_PNG}" "${size}" "${OUTPUT_DIR}/default${size}.png"
done

RESIZE_PNG "${MASTER_UI_PNG}" 64 "${OUTPUT_DIR}/content/about-logo.png"
RESIZE_PNG "${MASTER_UI_PNG}" 128 "${OUTPUT_DIR}/content/about-logo@2x.png"
if [[ -f "${SVG_FILE}" ]]; then
  cp "${SVG_FILE}" "${OUTPUT_DIR}/content/about-logo.svg"
fi
RESIZE_PNG "${MASTER_UI_PNG}" 64 "${OUTPUT_DIR}/content/about-logo-private.png"
RESIZE_PNG "${MASTER_UI_PNG}" 128 "${OUTPUT_DIR}/content/about-logo-private@2x.png"
RESIZE_PNG "${MASTER_UI_PNG}" 256 "${OUTPUT_DIR}/content/about.png"

expect_dimensions "${OUTPUT_DIR}/content/about-logo.png" 64
expect_dimensions "${OUTPUT_DIR}/content/about-logo@2x.png" 128
expect_rgb_colorspace "${OUTPUT_DIR}/content/about-logo.png"

echo "Building macOS Dock iconset (background ${ICON_BACKGROUND})..."
RESIZE_PNG "${MASTER_DOCK_PNG}" 16 "${ICONSET_DIR}/icon_16x16.png"
RESIZE_PNG "${MASTER_DOCK_PNG}" 32 "${ICONSET_DIR}/icon_16x16@2x.png"
RESIZE_PNG "${MASTER_DOCK_PNG}" 32 "${ICONSET_DIR}/icon_32x32.png"
RESIZE_PNG "${MASTER_DOCK_PNG}" 64 "${ICONSET_DIR}/icon_32x32@2x.png"
RESIZE_PNG "${MASTER_DOCK_PNG}" 128 "${ICONSET_DIR}/icon_128x128.png"
RESIZE_PNG "${MASTER_DOCK_PNG}" 256 "${ICONSET_DIR}/icon_128x128@2x.png"
RESIZE_PNG "${MASTER_DOCK_PNG}" 256 "${ICONSET_DIR}/icon_256x256.png"
RESIZE_PNG "${MASTER_DOCK_PNG}" 512 "${ICONSET_DIR}/icon_256x256@2x.png"
RESIZE_PNG "${MASTER_DOCK_PNG}" 512 "${ICONSET_DIR}/icon_512x512.png"
RESIZE_PNG "${MASTER_DOCK_PNG}" 1024 "${ICONSET_DIR}/icon_512x512@2x.png"

cp "${ICONSET_DIR}"/icon_*.png "${APPICONSET_DIR}/"

if ! command -v iconutil &>/dev/null; then
  echo "error: iconutil not found (macOS only)" >&2
  exit 1
fi

iconutil -c icns "${ICONSET_DIR}" -o "${OUTPUT_DIR}/firefox.icns"
cp "${OUTPUT_DIR}/firefox.icns" "${OUTPUT_DIR}/document.icns"
iconutil -c icns "${ICONSET_DIR}" -o "${OUTPUT_DIR}/disk.icns"

echo "Compiling Assets.car..."
if ! command -v xcrun &>/dev/null; then
  echo "error: xcrun not found (Xcode command line tools required)" >&2
  exit 1
fi

ASSETS_OUT="$(mktemp -d)"
xcrun actool --compile "${ASSETS_OUT}" \
  --platform macosx \
  --target-device mac \
  --minimum-deployment-target 10.15 \
  --app-icon AppIcon \
  --output-partial-info-plist "${ASSETS_OUT}/partial.plist" \
  "$(cd "${SCRIPT_DIR}/macos" && pwd)/Assets.xcassets" \
  >/dev/null
cp "${ASSETS_OUT}/Assets.car" "${OUTPUT_DIR}/Assets.car"
rm -rf "${ASSETS_OUT}"

build_dmg_background

echo "Note: after make_dmg, run finalize_dmg_layout.sh on the .dmg to apply Finder background."
if [[ ! -f "${OUTPUT_DIR}/dsstore" ]] || [[ ! -s "${OUTPUT_DIR}/dsstore" ]]; then
  echo "Generating fallback DMG dsstore..."
  python3 "${SCRIPT_DIR}/generate_dmg_dsstore.py" || {
    echo "error: missing dsstore; run capture_dmg_dsstore.sh or install ds-store (pip3 install ds-store mac-alias)" >&2
    exit 1
  }
fi

if strings "${OUTPUT_DIR}/Assets.car" | grep -q 'unofficial-'; then
  echo "error: Assets.car still contains unofficial asset names" >&2
  exit 1
fi

echo "Branding icons built successfully."
