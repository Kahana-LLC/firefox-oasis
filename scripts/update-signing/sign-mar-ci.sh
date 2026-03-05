#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: sign-mar-ci.sh <objdir> <unsigned-mar> <signed-mar>

Modes:
  OASIS_SIGNING_MODE=local-test
    Uses scripts/update-signing/sign-mar.sh with test NSS DB.

  OASIS_SIGNING_MODE=command
    Runs OASIS_SIGNING_COMMAND with placeholders:
      {input_mar}
      {output_mar}
EOF
}

if [ "$#" -ne 3 ]; then
  usage
  exit 1
fi

OBJDIR="$1"
UNSIGNED_MAR="$2"
SIGNED_MAR="$3"
MODE="${OASIS_SIGNING_MODE:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

case "$MODE" in
  local-test)
    "${SCRIPT_DIR}/sign-mar.sh" "$OBJDIR" "$UNSIGNED_MAR" "$SIGNED_MAR"
    ;;
  command)
    if [ -z "${OASIS_SIGNING_COMMAND:-}" ]; then
      echo "error: OASIS_SIGNING_COMMAND is required for command mode" >&2
      exit 1
    fi
    CMD="${OASIS_SIGNING_COMMAND//\{input_mar\}/$UNSIGNED_MAR}"
    CMD="${CMD//\{output_mar\}/$SIGNED_MAR}"
    (cd "$REPO_ROOT" && eval "$CMD")
    ;;
  *)
    echo "error: OASIS_SIGNING_MODE must be set to local-test or command" >&2
    exit 1
    ;;
esac

echo "signed MAR written: $SIGNED_MAR"
