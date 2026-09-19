#!/usr/bin/env bash
#
# Verify a release APK before anyone sideloads it.
#
# Two things can be wrong with a build that looks perfectly green in CI, and
# both of them only show up on a shop's phone:
#
#   1. It is signed with the debug key. Expo's generated `android/app/build.gradle`
#      points the release build type at `signingConfigs.debug`, so a plain
#      `assembleRelease` produces a debug-signed APK that installs happily and
#      can never be upgraded by a real release.
#   2. It points at localhost, Clerk is missing, or dark maps watermark.
#      `EXPO_PUBLIC_*` values are inlined by Babel when the JS bundle is built,
#      not read at runtime, so if the variable was not in the environment of
#      the bundling command the app silently falls back to the
#      dev-server/loopback base in `lib/api.ts`. The Clerk publishable key is
#      baked the same way: extra at prebuild, and a static
#      process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY read in lib/clerk.ts so
#      Babel can still inline the value at Gradle time. The CARTO basemap key
#      is the same class of bake: without it, dark maps render
#      "API KEY REQUIRED".
#
# Neither is visible from the build log, so both are asserted here against the
# actual artifact. Nothing this script prints contains a password, a key, or
# the API URL — a certificate fingerprint is public (it ships inside the APK).
#
# Aligns with client/rider on the identifier scan: only a surviving
# `EXPO_PUBLIC_API_URL` name means the URL was not inlined. Operator-facing
# copy may still mention other env names even after their values baked.
#
# Usage:
#   ANDROID_KEYSTORE_PATH=… ANDROID_KEYSTORE_PASSWORD=… ANDROID_KEY_ALIAS=… \
#   EXPO_PUBLIC_API_URL=… EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=… \
#   EXPO_PUBLIC_CARTO_API_KEY=… \
#   scripts/verify-release-apk.sh path/to/app-release.apk

set -euo pipefail

apk="${1:-}"
[ -n "$apk" ] || { echo "usage: $0 <apk>" >&2; exit 2; }
[ -f "$apk" ] || { echo "FAIL: no APK at $apk" >&2; exit 1; }

fail() { echo "FAIL: $*" >&2; exit 1; }

require_env() {
  local name="$1"
  [ -n "${!name:-}" ] || fail "$name is not set"
}

require_env ANDROID_KEYSTORE_PATH
require_env ANDROID_KEYSTORE_PASSWORD
require_env ANDROID_KEY_ALIAS
require_env EXPO_PUBLIC_API_URL
require_env EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
require_env EXPO_PUBLIC_CARTO_API_KEY

case "$EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY" in
  pk_live_*) ;;
  *) fail "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not a production pk_live_ key" ;;
esac

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# --- locate apksigner -------------------------------------------------------

find_apksigner() {
  local sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}" candidate
  if [ -n "$sdk" ] && [ -d "$sdk/build-tools" ]; then
    candidate="$(find "$sdk/build-tools" -maxdepth 2 -name apksigner -type f |
      sort -V | tail -1)"
    [ -n "$candidate" ] && { echo "$candidate"; return; }
  fi
  command -v apksigner || return 1
}

apksigner="$(find_apksigner)" || fail "apksigner not found (need the Android SDK build-tools)"

# --- 1. signed with the release key, not the debug key ----------------------

"$apksigner" verify "$apk" >/dev/null 2>"$work/verify.err" ||
  fail "apksigner could not verify the APK signature: $(cat "$work/verify.err")"

"$apksigner" verify --print-certs "$apk" >"$work/certs.txt"

if grep -qi 'CN=Android Debug' "$work/certs.txt"; then
  fail "APK is signed with the Android debug key"
fi

apk_digest="$(grep -im1 'certificate SHA-256 digest' "$work/certs.txt" |
  awk '{print $NF}' | tr 'A-F' 'a-f')"
[ -n "$apk_digest" ] || fail "apksigner printed no SHA-256 certificate digest"

# keytool reads the store password from stdin, keeping it out of the process list.
printf '%s\n' "$ANDROID_KEYSTORE_PASSWORD" |
  keytool -list -v -keystore "$ANDROID_KEYSTORE_PATH" -alias "$ANDROID_KEY_ALIAS" \
    >"$work/keystore.txt" 2>"$work/keystore.err" ||
  fail "keytool could not read alias '$ANDROID_KEY_ALIAS' from the keystore"

key_digest="$(grep -im1 'SHA256:' "$work/keystore.txt" |
  awk '{print $2}' | tr -d ':' | tr 'A-F' 'a-f')"
[ -n "$key_digest" ] || fail "keytool printed no SHA-256 fingerprint"

[ "$apk_digest" = "$key_digest" ] ||
  fail "APK is signed by a different certificate than alias '$ANDROID_KEY_ALIAS'"

echo "OK: signed by alias '$ANDROID_KEY_ALIAS' (cert SHA-256 $apk_digest)"

# --- 2. the deployed API URL, Clerk live key, and CARTO tile key are baked ---

bundle="assets/index.android.bundle"
unzip -p "$apk" "$bundle" >"$work/bundle.bin" 2>/dev/null ||
  fail "$bundle is missing from the APK"
[ -s "$work/bundle.bin" ] || fail "$bundle is empty"

grep -aqF -- "$EXPO_PUBLIC_API_URL" "$work/bundle.bin" ||
  fail "the deployed API URL is not in $bundle — EXPO_PUBLIC_API_URL was not set for the build step, so this APK points at loopback"

# A surviving EXPO_PUBLIC_API_URL identifier means Babel did not inline the
# URL. Other EXPO_PUBLIC_* names may appear in operator-facing error copy
# even when their values were inlined — do not treat those as a failed bake.
if grep -aqF -- 'EXPO_PUBLIC_API_URL' "$work/bundle.bin"; then
  fail "the variable name survives in $bundle — the value was not inlined at bundle time"
fi

grep -aqF -- "$EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY" "$work/bundle.bin" ||
  fail "the production Clerk publishable key is not in $bundle"

# Do not print the CARTO key. lib/cartoTiles.ts builds
# https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=<token>
grep -aqF -- 'basemaps.cartocdn.com' "$work/bundle.bin" ||
  fail "the CARTO tile host is not in $bundle"

grep -aqF -- "$EXPO_PUBLIC_CARTO_API_KEY" "$work/bundle.bin" ||
  fail "the CARTO API key is not in $bundle — EXPO_PUBLIC_CARTO_API_KEY was not set for the build step"

echo "OK: the deployed API URL, Clerk production key, and CARTO tile key are inlined in $bundle"
echo "OK: $(basename "$apk") is a real signed release build"
