#!/usr/bin/env bash
# Map the phone's localhost ports to this machine over USB so GRIDGO does not
# depend on whichever Wi-Fi the laptop currently has.
set -euo pipefail

device="$(adb devices | awk 'NR>1 && $2=="device" { print $1; exit }')"
if [ -z "${device}" ]; then
  echo "usb-tunnel: plug the phone in over USB, then retry" >&2
  exit 1
fi

# The Android build asks for localhost:8081. This packager listens on 8082 so
# it does not collide with the client app, so 8081 on the phone must land here.
adb -s "${device}" reverse tcp:8081 tcp:8082
for port in 8082 8083 8787 9000; do
  adb -s "${device}" reverse "tcp:${port}" "tcp:${port}"
done

adb -s "${device}" reverse --list
