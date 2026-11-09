import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { useEffect } from "react";
import { Alert, AppState } from "react-native";

import { installChannel } from "@/lib/buildDistribution";
import { loadPlayUpdate } from "@/lib/playUpdate";

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
// A newly installed version gets its own first check, even within four hours.
const CHECK_KEY = `gridgo:play-update-check:${Constants.expoConfig?.android?.versionCode ?? 0}`;

/** Play owns consent and download. GRIDGO only asks before restarting. */
export function usePlayUpdateCheck(ready: boolean): void {
  useEffect(() => {
    if (!ready || installChannel() !== "play") return;

    let disposed = false;
    let checking = false;
    let lastCheck: number | null = null;
    let downloaded = false;
    let prompted = false;
    let nativeSubscription: { remove(): void } | undefined;
    let updates: ReturnType<typeof loadPlayUpdate> = null;

    function promptRestart() {
      if (disposed || !downloaded || prompted || AppState.currentState !== "active") return;
      prompted = true;
      Alert.alert("Update ready", "Restart to finish updating.", [
        { text: "Later", style: "cancel" },
        {
          text: "Restart now",
          onPress: () => { void updates?.completeUpdate().catch(() => undefined); },
        },
      ]);
    }

    async function check() {
      if (disposed || checking || AppState.currentState !== "active") return;
      checking = true;
      try {
        if (lastCheck === null) {
          const saved = await AsyncStorage.getItem(CHECK_KEY);
          const value = saved === null ? NaN : Number(saved);
          if (Number.isFinite(value)) lastCheck = value;
        }
        if (disposed) return;
        const now = Date.now();
        if (lastCheck !== null && now >= lastCheck && now - lastCheck < CHECK_INTERVAL_MS) return;
        // Record attempts too: unavailable Play and failures must not loop.
        lastCheck = now;
        await AsyncStorage.setItem(CHECK_KEY, String(now));
        if (disposed) return;
        if (!updates) {
          updates = loadPlayUpdate();
          nativeSubscription = updates?.addListener("downloaded", () => {
            downloaded = true;
            promptRestart();
          });
        }
        if (!updates) return;
        const info = await updates.checkForUpdate();
        if (disposed) return;
        if (info.downloaded) {
          downloaded = true;
          promptRestart();
        } else if (info.available && info.flexibleAllowed && AppState.currentState === "active") {
          await updates.startFlexibleUpdate();
        }
      } catch {
        // Offline, not owned by Play, Expo Go, or a cancelled/failed update:
        // none of these should interrupt the app or open another store page.
      } finally {
        checking = false;
      }
    }

    void check();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        promptRestart();
        void check();
      }
    });
    return () => {
      disposed = true;
      subscription.remove();
      nativeSubscription?.remove();
    };
  }, [ready]);
}
