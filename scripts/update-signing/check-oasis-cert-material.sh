#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: check-oasis-cert-material.sh [updater-dir]

Fails if oasis cert files are identical to dep cert files.
Set ALLOW_DEV_OASIS_CERTS=1 to allow temporary bootstrap certs.
EOF
}

if [ "$#" -gt 1 ]; then
  usage
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
UPDATER_DIR="${1:-${REPO_ROOT}/toolkit/mozapps/update/updater}"

PRIMARY="${UPDATER_DIR}/oasis_primary.der"
SECONDARY="${UPDATER_DIR}/oasis_secondary.der"
DEP1="${UPDATER_DIR}/dep1.der"
DEP2="${UPDATER_DIR}/dep2.der"

for path in "$PRIMARY" "$SECONDARY" "$DEP1" "$DEP2"; do
  if [ ! -f "$path" ]; then
    echo "error: missing cert file: $path" >&2
    exit 1
  fi
done

primary_hash="$(shasum -a 256 "$PRIMARY" | awk '{print $1}')"
secondary_hash="$(shasum -a 256 "$SECONDARY" | awk '{print $1}')"
dep1_hash="$(shasum -a 256 "$DEP1" | awk '{print $1}')"
dep2_hash="$(shasum -a 256 "$DEP2" | awk '{print $1}')"

if [ "$primary_hash" = "$dep1_hash" ] || [ "$secondary_hash" = "$dep2_hash" ]; then
  if [ "${ALLOW_DEV_OASIS_CERTS:-0}" = "1" ]; then
    echo "warning: oasis cert material matches dep certs (allowed by ALLOW_DEV_OASIS_CERTS=1)"
    exit 0
  fi
  echo "error: oasis cert material still matches dep certs; replace with fork-owned certs" >&2
  exit 1
fi

echo "ok: oasis cert files differ from dep certs"
