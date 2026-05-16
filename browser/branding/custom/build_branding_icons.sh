#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SVG_FILE="${SCRIPT_DIR}/kahana_logo.svg"
OUTPUT_DIR="${SCRIPT_DIR}"
BUILD_DIR="${SCRIPT_DIR}/build"
MASTER_UI_PNG="${BUILD_DIR}/icon-master-ui-1024.png"
MASTER_DOCK_PNG="${BUILD_DIR}/icon-master-dock-1024.png"
ICONSET_DIR="${BUILD_DIR}/firefox.iconset"
APPICONSET_DIR="${SCRIPT_DIR}/macos/Assets.xcassets/AppIcon.appiconset"
UNOFFICIAL_DIR="${SCRIPT_DIR}/../unofficial"
ICON_BACKGROUND="#313A00"
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

if [[ ! -s "${OUTPUT_DIR}/background.png" ]] && [[ -f "${UNOFFICIAL_DIR}/background.png" ]]; then
  echo "Seeding background.png from unofficial branding..."
  cp "${UNOFFICIAL_DIR}/background.png" "${OUTPUT_DIR}/background.png"
fi
if [[ ! -s "${OUTPUT_DIR}/dsstore" ]] && [[ -f "${UNOFFICIAL_DIR}/dsstore" ]]; then
  echo "Seeding dsstore from unofficial branding..."
  cp "${UNOFFICIAL_DIR}/dsstore" "${OUTPUT_DIR}/dsstore"
fi

if strings "${OUTPUT_DIR}/Assets.car" | grep -q 'unofficial-'; then
  echo "error: Assets.car still contains unofficial asset names" >&2
  exit 1
fi

echo "Branding icons built successfully."
