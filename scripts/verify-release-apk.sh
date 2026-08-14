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
#   2. It points at localhost. `EXPO_PUBLIC_*` values are inlined by Babel when
#      the JS bundle is built, not read at runtime, so if the variable was not
#      in the environment of the bundling command the app silently falls back
#      to the dev-server/loopback base in `lib/api.ts`.
#
# Neither is visible from the build log, so both are asserted here against the
# actual artifact. Nothing this script prints contains a password, a key, or
# the API URL — a certificate fingerprint is public (it ships inside the APK).
#
# Usage:
#   ANDROID_KEYSTORE_PATH=… ANDROID_KEYSTORE_PASSWORD=… ANDROID_KEY_ALIAS=… \
#   EXPO_PUBLIC_API_URL=… scripts/verify-release-apk.sh path/to/app-release.apk

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

# --- 2. the deployed API URL is baked into the bundle -----------------------

bundle="assets/index.android.bundle"
unzip -p "$apk" "$bundle" >"$work/bundle.bin" 2>/dev/null ||
  fail "$bundle is missing from the APK"
[ -s "$work/bundle.bin" ] || fail "$bundle is empty"

grep -aqF -- "$EXPO_PUBLIC_API_URL" "$work/bundle.bin" ||
  fail "the deployed API URL is not in $bundle — EXPO_PUBLIC_API_URL was not set for the build step, so this APK points at loopback"

grep -aqF -- "$EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY" "$work/bundle.bin" ||
  fail "the production Clerk publishable key is not in $bundle"

# Not just the URL's own name: this app also reads EXPO_PUBLIC_API_PORT, and
# Babel inlines every EXPO_PUBLIC_* read — an unset one becomes `undefined`.
# So a surviving name of any kind means the inlining did not happen and the
# whole mechanism this build depends on is not running.
if survivor="$(grep -aoE 'EXPO_PUBLIC_[A-Z0-9_]*' "$work/bundle.bin" | sort -u | head -3)" &&
  [ -n "$survivor" ]; then
  fail "these variable names survive in $bundle, so nothing was inlined at bundle time: $(echo "$survivor" | tr '\n' ' ')"
fi

echo "OK: the deployed API URL and Clerk production key are inlined, and no EXPO_PUBLIC_* name survives $bundle"
echo "OK: $(basename "$apk") is a real signed release build"
