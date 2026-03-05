#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: verify-mar.sh <objdir> <signed-mar> [der-cert ...]

Default DER cert:
  toolkit/mozapps/update/updater/xpcshellCertificate.der
EOF
}

if [ "$#" -lt 2 ]; then
  usage
  exit 1
fi

OBJDIR="$1"
SIGNED_MAR="$2"
shift 2

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

if [ "$#" -eq 0 ]; then
  DER_CERTS=("${REPO_ROOT}/toolkit/mozapps/update/updater/xpcshellCertificate.der")
else
  DER_CERTS=("$@")
fi

if [ ! -d "$OBJDIR" ]; then
  echo "error: objdir not found: $OBJDIR" >&2
  exit 1
fi

if [ ! -f "$SIGNED_MAR" ]; then
  echo "error: signed MAR not found: $SIGNED_MAR" >&2
  exit 1
fi

OBJDIR="$(cd "$OBJDIR" && pwd)"
SIGNED_MAR="$(cd "$(dirname "$SIGNED_MAR")" && pwd)/$(basename "$SIGNED_MAR")"

SIGNMAR_BIN="${OBJDIR}/dist/bin/signmar"
if [ ! -x "$SIGNMAR_BIN" ]; then
  echo "error: signmar binary not found: $SIGNMAR_BIN" >&2
  exit 1
fi

VERIFY_ARGS=()
if [ "${#DER_CERTS[@]}" -eq 1 ]; then
  CERT_PATH="${DER_CERTS[0]}"
  if [ ! -f "$CERT_PATH" ]; then
    echo "error: DER cert not found: $CERT_PATH" >&2
    exit 1
  fi
  VERIFY_ARGS=(-D "$CERT_PATH")
else
  for i in "${!DER_CERTS[@]}"; do
    CERT_PATH="${DER_CERTS[$i]}"
    if [ ! -f "$CERT_PATH" ]; then
      echo "error: DER cert not found: $CERT_PATH" >&2
      exit 1
    fi
    VERIFY_ARGS+=("-D${i}" "$CERT_PATH")
  done
fi

"$SIGNMAR_BIN" "${VERIFY_ARGS[@]}" -v "$SIGNED_MAR"
echo "signature verification passed: $SIGNED_MAR"
