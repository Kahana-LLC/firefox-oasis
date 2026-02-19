#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: sign-mar.sh <objdir> <unsigned-mar> <signed-mar> [nss-db-dir] [cert-nickname]

Defaults:
  nss-db-dir: modules/libmar/tests/unit/data
  cert-nickname: mycert
EOF
}

if [ "$#" -lt 3 ] || [ "$#" -gt 5 ]; then
  usage
  exit 1
fi

OBJDIR="$1"
UNSIGNED_MAR="$2"
SIGNED_MAR="$3"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

NSS_DB_DIR="${4:-${REPO_ROOT}/modules/libmar/tests/unit/data}"
CERT_NICKNAME="${5:-mycert}"

if [ ! -d "$OBJDIR" ]; then
  echo "error: objdir not found: $OBJDIR" >&2
  exit 1
fi

if [ ! -f "$UNSIGNED_MAR" ]; then
  echo "error: unsigned MAR not found: $UNSIGNED_MAR" >&2
  exit 1
fi

if [ ! -d "$NSS_DB_DIR" ]; then
  echo "error: NSS DB dir not found: $NSS_DB_DIR" >&2
  exit 1
fi

if [ ! -f "${NSS_DB_DIR}/cert9.db" ] && [ ! -f "${NSS_DB_DIR}/cert8.db" ]; then
  echo "error: NSS DB missing cert database in: $NSS_DB_DIR" >&2
  exit 1
fi

OBJDIR="$(cd "$OBJDIR" && pwd)"
UNSIGNED_MAR="$(cd "$(dirname "$UNSIGNED_MAR")" && pwd)/$(basename "$UNSIGNED_MAR")"
mkdir -p "$(dirname "$SIGNED_MAR")"
SIGNED_MAR="$(cd "$(dirname "$SIGNED_MAR")" && pwd)/$(basename "$SIGNED_MAR")"
NSS_DB_DIR="$(cd "$NSS_DB_DIR" && pwd)"

SIGNMAR_BIN="${OBJDIR}/dist/bin/signmar"
if [ ! -x "$SIGNMAR_BIN" ]; then
  echo "error: signmar binary not found: $SIGNMAR_BIN" >&2
  exit 1
fi

"$SIGNMAR_BIN" -d "$NSS_DB_DIR" -n "$CERT_NICKNAME" -s "$UNSIGNED_MAR" "$SIGNED_MAR"
echo "signed MAR written: $SIGNED_MAR"
