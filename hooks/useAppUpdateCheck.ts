import Constants, { ExecutionEnvironment } from "expo-constants";
import { router } from "expo-router";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";

import { describeInstalledBuild, installedBuild, type Build } from "@/lib/appUpdate";
import {
  appUpdateHydrated,
  checkForUpdate,
  logUpdateCheck,
  recordLaunch,
  setUpdateSheetOpen,
  useAppUpdate,
} from "@/store/appUpdate";
import { afterNativePresentation } from "@/store/sheets";

/**
 * The build on this phone, or `null` when there is nothing to compare —
 * a development build and Expo Go, unless
 * `EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE` names one (development only).
 *
 * The env read is the literal member expression on purpose: Expo inlines
 * `process.env.EXPO_PUBLIC_*` only in that spelling.
 */
export function resolveInstalledBuild(): Build | null {
  const expoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  const input = {
    versionCode: Constants.expoConfig?.android?.versionCode,
    versionName: Constants.expoConfig?.version,
    releaseBuild: !__DEV__ && Platform.OS === "android" && !expoGo,
    forceVersionCode: process.env.EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE,
    dev: __DEV__,
    expoGo,
  };
  const build = installedBuild(input);
  logUpdateCheck(describeInstalledBuild(input, build));
  return build;
}

/** One launch per JS runtime, however often the root effect re-runs. */
let launchRecorded = false;

/**
 * Checks for a newer APK at launch and on every return to the foreground
 * (throttled in `lib/appUpdate.ts`), and presents `app/app-update.tsx` when
 * there is something to say.
 *
 * The check starts at once; the sheet waits for `ready` — the opening has
 * finished and the session has settled — because the root stack is re-keyed
 * when a restored session arrives, and a sheet pushed before that would be torn
 * down with it.
 */
export function useAppUpdateCheck(ready: boolean): void {
  useEffect(() => {
    const installed = resolveInstalledBuild();
    if (!installed) return;

    let cancelled = false;
    void (async () => {
      await appUpdateHydrated();
      if (cancelled) return;
      if (!launchRecorded) {
        launchRecorded = true;
        recordLaunch(installed);
      }
      await checkForUpdate(installed, "launch");
    })();

    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void checkForUpdate(installed, "foreground");
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  const waiting = useAppUpdate((s) => s.completed !== null || s.offer !== null);
  const sheetOpen = useAppUpdate((s) => s.sheetOpen);

  useEffect(() => {
    if (!waiting || sheetOpen) return;
    if (!ready) {
      logUpdateCheck("the sheet is waiting for the opening and a settled session");
      return;
    }
    let cancelled = false;
    // Let a sheet that has just been dismissed finish leaving before the next
    // one (the offer queued behind "Update completed") is pushed.
    void afterNativePresentation().then(() => {
      const state = useAppUpdate.getState();
      if (cancelled || state.sheetOpen) return;
      if (state.completed === null && state.offer === null) return;
      logUpdateCheck("presenting the update sheet");
      setUpdateSheetOpen(true);
      router.push("/app-update");
    });
    return () => {
      cancelled = true;
    };
  }, [ready, waiting, sheetOpen]);
}
