# GRIDGO Play updates

A small Android-only Expo module wrapping Google's `app-update:2.1.0` library.
It offers only the flexible flow. Download completion emits `downloaded`;
`completeUpdate` is called only after the shop chooses **Restart now**.
Errors return to JS, where they are silent. There is no Store redirect.

Expo SDK 57 discovers local modules under `modules/` automatically through
`expo-module.config.json`. The existing release workflow's `expo prebuild`
and Gradle steps include this module without a config plugin or workflow
change. There is no Apple implementation. Native Play objects and listeners
are created only on the first method call; `lib/playUpdate.ts` resolves the
module only when `installChannel()` is `play`.

`hooks/usePlayUpdateCheck.ts` checks after the launch intro and on foreground,
at most once per four hours, including across app launches. The timestamp is
per installed version. A completed download is recovered on the next eligible
check; a download completed while this process is alive prompts on foreground.

Why local: `expo-in-app-updates@0.12.0` automatically completes flexible
updates and redirects to the Store on failure. Its current `0.13.x` release
targets Expo SDK 58+. `sp-react-native-in-app-updates@2.0.0` does not expose
`installStatus()` when checking, so it cannot recover a downloaded flexible
update after process death. This module uses the installed SDK 57 Expo Modules
API and preserves explicit restart consent without patching either package.

References:
- [Google's flexible update flow](https://developer.android.com/guide/playcore/in-app-updates/kotlin-java#flexible)
- [Expo local modules and autolinking](https://docs.expo.dev/modules/autolinking/)

A real check needs a Play-installed build owned by an eligible tester, a higher
version code available on that tester's track, and matching Play signing.
Jest mocks the native boundary; it cannot verify Play rollout eligibility,
consent UI, downloads, or installation.
