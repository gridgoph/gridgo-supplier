import AsyncStorage from "@react-native-async-storage/async-storage";
import { createJSONStorage, type StateStorage } from "zustand/middleware";

/**
 * Persistence boundary for Zustand stores.
 *
 * AsyncStorage is used in every real runtime (native and browser). Only the
 * web static render, where there is no `window`, gets inert storage — gating on
 * `Platform.OS` instead would silently drop persistence on web devices.
 */
const serverStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

export function createPersistStorage<State>() {
  return createJSONStorage<State>(() =>
    typeof window === "undefined" ? serverStorage : AsyncStorage,
  );
}
