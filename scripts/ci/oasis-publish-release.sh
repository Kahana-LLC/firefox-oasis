#!/usr/bin/env bash
set -euo pipefail

# Publish downloaded dual-arch macOS build artifacts to GitHub Releases and
# optionally register MAR metadata with the Oasis update service.
#
# Required environment:
#   PUBLISH_MODE          canary | versioned
#   RELEASE_TAG           vX.Y.Z.N (versioned) or ignored for canary bucket tag
#   ARTIFACT_DIR          directory containing per-arch subdirs (aarch64, x86_64)
#   GITHUB_REPOSITORY     owner/repo
#   GH_TOKEN              GitHub token with contents:write
#
# Canary-only (PUBLISH_MODE=canary):
#   OASIS_UPDATE_SERVICE_URL
#   OASIS_ADMIN_TOKEN
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

case "${PUBLISH_MODE}" in
  canary)
    GH_TAG="canary"
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
    GH_TAG="${RELEASE_TAG:?RELEASE_TAG required for versioned publish}"
    if gh release view "${GH_TAG}" > /dev/null 2>&1; then
      echo "Release ${GH_TAG} already exists. Publish a new version instead." >&2
      exit 1
    fi
    gh release create "${GH_TAG}" "${upload_paths[@]}" \
      --title "${GH_TAG}" \
      --notes "Oasis release ${GH_TAG}"
    ;;
  *)
    echo "Unknown PUBLISH_MODE: ${PUBLISH_MODE}" >&2
    exit 2
    ;;
esac

echo "Published ${#upload_paths[@]} assets to GitHub release ${GH_TAG}"

if [ "${PUBLISH_MODE}" = "canary" ]; then
  if [ -z "${OASIS_UPDATE_SERVICE_URL:-}" ] || [ -z "${OASIS_ADMIN_TOKEN:-}" ]; then
    echo "OASIS_UPDATE_SERVICE_URL and OASIS_ADMIN_TOKEN are required for canary publish." >&2
    exit 2
  fi
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
  python3 tools/oasis-update-service/publish_update.py \
    --service "${OASIS_UPDATE_SERVICE_URL}" \
    --admin-token "${OASIS_ADMIN_TOKEN}" \
    --version "${VERSION}" \
    --ring "${RING}" \
    --actor github-actions \
    --reason "canary dual-arch ring pointer (run ${GITHUB_RUN_ID:-local}, tag ${RELEASE_TAG:-unknown})"
  echo "Registered Supabase artifacts and moved ring ${RING} to ${VERSION}"
fi

for arch_slug in aarch64 x86_64; do
  mar_name="$(read_meta "${arch_slug}" mar_asset_name)"
  dmg_name="$(read_meta "${arch_slug}" dmg_asset_name)"
  echo "MAR (${arch_slug}): https://github.com/${GITHUB_REPOSITORY}/releases/download/${GH_TAG}/${mar_name}"
  echo "DMG (${arch_slug}): https://github.com/${GITHUB_REPOSITORY}/releases/download/${GH_TAG}/${dmg_name}"
done
