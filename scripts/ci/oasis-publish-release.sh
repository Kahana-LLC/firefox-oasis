#!/usr/bin/env bash
set -euo pipefail

# Publish downloaded dual-arch macOS build artifacts (and optional Windows
# installer) to GitHub Releases and optionally register MAR metadata with
# the Oasis update service.
#
# Required environment:
#   PUBLISH_MODE          canary | versioned
#   RELEASE_TAG           vX.Y.Z.N (versioned) or ignored for canary bucket tag
#   ARTIFACT_DIR          directory containing per-arch subdirs
#                         macOS:   aarch64/  x86_64/
#                         Windows: windows-x86_64/   (optional — skipped if absent)
#   GITHUB_REPOSITORY     owner/repo
#   GH_TOKEN              GitHub token with contents:write
#
# Canary-only (PUBLISH_MODE=canary):
#   OASIS_UPDATE_SERVICE_URL
#   OASIS_ADMIN_TOKEN
#
# Optional:
#   SKIP_GITHUB_UPLOAD=1   register update service only (assets already on release)
#   PRODUCT               default Firefox
#   RING                  default oasis-canary
#   LOCALE                default en-US

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/ci/oasis-release-names.sh
source "${SCRIPT_DIR}/oasis-release-names.sh"

PRODUCT="${PRODUCT:-Firefox}"
LOCALE="${LOCALE:-en-US}"
RING="${RING:-oasis-canary}"

if [ -z "${PUBLISH_MODE:-}" ] || [ -z "${ARTIFACT_DIR:-}" ]; then
  echo "PUBLISH_MODE and ARTIFACT_DIR are required." >&2
  exit 2
fi

read_meta() {
  local arch_slug="$1"
  python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))[sys.argv[2]])' \
    "${ARTIFACT_DIR}/${arch_slug}/meta.json" "$2"
}

upload_paths=()
VERSION=""
BUILD_TARGETS=()

# ── macOS artifacts (aarch64 + x86_64) ──────────────────────────────────────
for arch_slug in aarch64 x86_64; do
  arch_dir="${ARTIFACT_DIR}/${arch_slug}"
  if [ ! -f "${arch_dir}/meta.json" ]; then
    echo "Missing ${arch_dir}/meta.json" >&2
    exit 1
  fi
  dmg_name="$(read_meta "${arch_slug}" dmg_asset_name)"
  mar_name="$(read_meta "${arch_slug}" mar_asset_name)"
  if [ ! -f "${arch_dir}/${dmg_name}" ] || [ ! -f "${arch_dir}/${mar_name}" ]; then
    echo "Missing dmg or mar under ${arch_dir}" >&2
    exit 1
  fi
  arch_version="$(read_meta "${arch_slug}" version)"
  if [ -z "${VERSION}" ]; then
    VERSION="${arch_version}"
  elif [ "${VERSION}" != "${arch_version}" ]; then
    echo "Version mismatch across architectures: ${VERSION} vs ${arch_version}" >&2
    exit 1
  fi
  BUILD_TARGETS+=("$(read_meta "${arch_slug}" build_target)")
  upload_paths+=("${arch_dir}/${mar_name}")
  upload_paths+=("${arch_dir}/${dmg_name}")
done

# ── Windows artifacts (windows-x86_64) — optional ───────────────────────────
WIN_ARCH_DIR="${ARTIFACT_DIR}/windows-x86_64"
WIN_EXE_PATH=""
WIN_MAR_PATH=""

if [ -f "${WIN_ARCH_DIR}/meta.json" ]; then
  exe_name="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["exe_asset_name"])' "${WIN_ARCH_DIR}/meta.json")"
  win_mar_name="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["mar_asset_name"])' "${WIN_ARCH_DIR}/meta.json")"
  win_version="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "${WIN_ARCH_DIR}/meta.json")"

  if [ "${win_version}" != "${VERSION}" ]; then
    echo "Windows artifact version mismatch: macOS=${VERSION}, Windows=${win_version}" >&2
    exit 1
  fi
  if [ ! -f "${WIN_ARCH_DIR}/${exe_name}" ]; then
    echo "Missing Windows installer at ${WIN_ARCH_DIR}/${exe_name}" >&2
    exit 1
  fi
  if [ ! -f "${WIN_ARCH_DIR}/${win_mar_name}" ]; then
    echo "Missing Windows MAR at ${WIN_ARCH_DIR}/${win_mar_name}" >&2
    exit 1
  fi

  WIN_EXE_PATH="${WIN_ARCH_DIR}/${exe_name}"
  WIN_MAR_PATH="${WIN_ARCH_DIR}/${win_mar_name}"
  upload_paths+=("${WIN_EXE_PATH}")
  upload_paths+=("${WIN_MAR_PATH}")
  BUILD_TARGETS+=("$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["build_target"])' "${WIN_ARCH_DIR}/meta.json")")
  echo "Windows artifacts found: ${exe_name}, ${win_mar_name}"
else
  echo "No Windows artifacts found at ${WIN_ARCH_DIR} — publishing macOS only."
fi

# ── GitHub release upload ────────────────────────────────────────────────────
SKIP_GITHUB_UPLOAD="${SKIP_GITHUB_UPLOAD:-0}"

case "${PUBLISH_MODE}" in
  canary)
    GH_TAG="canary"
    ;;
  versioned)
    GH_TAG="${RELEASE_TAG:?RELEASE_TAG required for versioned publish}"
    ;;
  *)
    echo "Unknown PUBLISH_MODE: ${PUBLISH_MODE}" >&2
    exit 2
    ;;
esac

if [ "${SKIP_GITHUB_UPLOAD}" != "1" ]; then
  case "${PUBLISH_MODE}" in
    canary)
      if gh release view "${GH_TAG}" > /dev/null 2>&1; then
        gh release edit "${GH_TAG}" --title "Canary Builds" --prerelease
      else
        gh release create "${GH_TAG}" \
          --title "Canary Builds" \
          --notes "Rolling canary artifacts. Assets are appended by automation." \
          --prerelease
      fi
      gh release upload "${GH_TAG}" "${upload_paths[@]}" --clobber
      ;;
    versioned)
      if gh release view "${GH_TAG}" > /dev/null 2>&1; then
        echo "Release ${GH_TAG} already exists. Publish a new version instead." >&2
        exit 1
      fi
      gh release create "${GH_TAG}" "${upload_paths[@]}" \
        --title "${GH_TAG}" \
        --notes "Oasis release ${GH_TAG}"
      ;;
  esac
  echo "Published ${#upload_paths[@]} assets to GitHub release ${GH_TAG}"
else
  echo "Skipping GitHub upload (SKIP_GITHUB_UPLOAD=1); using existing release ${GH_TAG}"
fi

# ── Canary update service registration ──────────────────────────────────────
if [ "${PUBLISH_MODE}" = "canary" ]; then
  if [ -z "${OASIS_UPDATE_SERVICE_URL:-}" ] || [ -z "${OASIS_ADMIN_TOKEN:-}" ]; then
    echo "OASIS_UPDATE_SERVICE_URL and OASIS_ADMIN_TOKEN are required for canary publish." >&2
    exit 2
  fi

  # Register macOS MARs
  for arch_slug in aarch64 x86_64; do
    build_target="$(read_meta "${arch_slug}" build_target)"
    build_id="$(read_meta "${arch_slug}" build_id)"
    mar_name="$(read_meta "${arch_slug}" mar_asset_name)"
    mar_path="${ARTIFACT_DIR}/${arch_slug}/${mar_name}"
    mar_url="https://github.com/${GITHUB_REPOSITORY}/releases/download/${GH_TAG}/${mar_name}"
    python3 tools/oasis-update-service/publish_update.py \
      --service "${OASIS_UPDATE_SERVICE_URL}" \
      --admin-token "${OASIS_ADMIN_TOKEN}" \
      --product "${PRODUCT}" \
      --version "${VERSION}" \
      --build-id "${build_id}" \
      --build-target "${build_target}" \
      --locale "${LOCALE}" \
      --mar-url "${mar_url}" \
      --mar-path "${mar_path}" \
      --actor github-actions \
      --reason "canary dual-arch artifact (run ${GITHUB_RUN_ID:-local}, arch ${arch_slug})"
  done

  # Register Windows MAR if present
  if [ -n "${WIN_MAR_PATH}" ]; then
    win_build_target="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["build_target"])' "${WIN_ARCH_DIR}/meta.json")"
    win_build_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["build_id"])' "${WIN_ARCH_DIR}/meta.json")"
    win_mar_name="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["mar_asset_name"])' "${WIN_ARCH_DIR}/meta.json")"
    win_mar_url="https://github.com/${GITHUB_REPOSITORY}/releases/download/${GH_TAG}/${win_mar_name}"
    python3 tools/oasis-update-service/publish_update.py \
      --service "${OASIS_UPDATE_SERVICE_URL}" \
      --admin-token "${OASIS_ADMIN_TOKEN}" \
      --product "${PRODUCT}" \
      --version "${VERSION}" \
      --build-id "${win_build_id}" \
      --build-target "${win_build_target}" \
      --locale "${LOCALE}" \
      --mar-url "${win_mar_url}" \
      --mar-path "${WIN_MAR_PATH}" \
      --actor github-actions \
      --reason "canary Windows artifact (run ${GITHUB_RUN_ID:-local})"
  fi

  python3 tools/oasis-update-service/publish_update.py \
    --service "${OASIS_UPDATE_SERVICE_URL}" \
    --admin-token "${OASIS_ADMIN_TOKEN}" \
    --version "${VERSION}" \
    --ring "${RING}" \
    --actor github-actions \
    --reason "canary dual-arch ring pointer (run ${GITHUB_RUN_ID:-local}, tag ${RELEASE_TAG:-unknown})"
  echo "Registered update service artifacts and moved ring ${RING} to ${VERSION}"
fi

# ── Print asset URLs ─────────────────────────────────────────────────────────
for arch_slug in aarch64 x86_64; do
  mar_name="$(read_meta "${arch_slug}" mar_asset_name)"
  dmg_name="$(read_meta "${arch_slug}" dmg_asset_name)"
  echo "MAR (${arch_slug}): https://github.com/${GITHUB_REPOSITORY}/releases/download/${GH_TAG}/${mar_name}"
  echo "DMG (${arch_slug}): https://github.com/${GITHUB_REPOSITORY}/releases/download/${GH_TAG}/${dmg_name}"
done

if [ -n "${WIN_EXE_PATH}" ]; then
  exe_name="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["exe_asset_name"])' "${WIN_ARCH_DIR}/meta.json")"
  win_mar_name="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["mar_asset_name"])' "${WIN_ARCH_DIR}/meta.json")"
  echo "EXE (windows-x86_64): https://github.com/${GITHUB_REPOSITORY}/releases/download/${GH_TAG}/${exe_name}"
  echo "MAR (windows-x86_64): https://github.com/${GITHUB_REPOSITORY}/releases/download/${GH_TAG}/${win_mar_name}"
fi