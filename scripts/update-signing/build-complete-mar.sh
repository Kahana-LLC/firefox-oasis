#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: build-complete-mar.sh <objdir> <app-dir> <output-mar> <product-version> <mar-channel-id>
EOF
}

if [ "$#" -ne 5 ]; then
  usage
  exit 1
fi

OBJDIR="$1"
APP_DIR="$2"
OUTPUT_MAR="$3"
PRODUCT_VERSION="$4"
MAR_CHANNEL_ID="$5"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

if [ ! -d "$OBJDIR" ]; then
  echo "error: objdir not found: $OBJDIR" >&2
  exit 1
fi

if [ ! -d "$APP_DIR" ]; then
  echo "error: app directory not found: $APP_DIR" >&2
  exit 1
fi

OBJDIR="$(cd "$OBJDIR" && pwd)"
APP_DIR="$(cd "$APP_DIR" && pwd)"
mkdir -p "$(dirname "$OUTPUT_MAR")"
OUTPUT_DIR="$(cd "$(dirname "$OUTPUT_MAR")" && pwd)"
OUTPUT_MAR="${OUTPUT_DIR}/$(basename "$OUTPUT_MAR")"

MAR_BIN="${OBJDIR}/dist/host/bin/mar"
if [ ! -x "$MAR_BIN" ]; then
  echo "error: mar binary not found: $MAR_BIN" >&2
  exit 1
fi

if [ ! -f "${APP_DIR}/precomplete" ] && [ ! -f "${APP_DIR}/Contents/Resources/precomplete" ]; then
  echo "error: precomplete not found under: $APP_DIR" >&2
  exit 1
fi

(
  cd "$REPO_ROOT"
  MAR="$MAR_BIN" \
  MOZ_PRODUCT_VERSION="$PRODUCT_VERSION" \
  MAR_CHANNEL_ID="$MAR_CHANNEL_ID" \
  ./tools/update-packaging/make_full_update.sh "$OUTPUT_MAR" "$APP_DIR"
)

echo "complete MAR written: $OUTPUT_MAR"
