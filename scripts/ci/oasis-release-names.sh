#!/usr/bin/env bash
# Shared Oasis release asset naming for CI workflows.

oasis_dmg_name() {
  echo "oasis-$1.$2.$3.mac.dmg"
}

oasis_safe_target() {
  echo "$1" | tr '/ ' '__'
}

oasis_mar_name() {
  local version="$1"
  local build_target="$2"
  local locale="$3"
  echo "oasis-${version}-$(oasis_safe_target "${build_target}")-${locale}.signed.complete.mar"
}
