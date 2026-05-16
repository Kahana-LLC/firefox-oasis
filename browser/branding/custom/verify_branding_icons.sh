#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

echo "ok: Oasis branding icons verified"
