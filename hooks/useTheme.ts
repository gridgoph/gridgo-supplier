import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";
import { Appearance } from "react-native";
import { colorScheme as cssColorScheme } from "react-native-css";

import { colors, type ThemeName } from "@/constants/theme";

/**
 * Theme preference and resolved theme colours.
 *
 * Light and Dark are the same product with different presentation. Follow the
 * system preference by default, with an in-app override persisted to
 * AsyncStorage so the choice survives relaunch.
 *
 * Screens should style with NativeWind classes — `bg-canvas`, `text-text-primary`
 * — which already resolve per theme. Use `useThemeColors` only where a class
 * cannot go: navigation themes, the status bar, map styles.
 */

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "gridgo.themePreference";

let preference: ThemePreference = "system";
let hydrated = false;
const listeners = new Set<() => void>();

function applyPreference(next: ThemePreference) {
  // react-native-web has no `setColorScheme`, so calling it unguarded throws
  // and the in-app override dies on the web build. The CSS layer below is what
  // actually switches the theme there; on iOS and Android this is what makes
  // native chrome follow the choice too.
  if (typeof Appearance.setColorScheme === "function") {
    Appearance.setColorScheme(next === "system" ? null : next);
  }

  // react-native-css keeps its own colour-scheme observable, seeded from
  // Appearance and updated by its change listener. Push the value directly so
  // the CSS layer switches on the same frame rather than waiting for the
  // native echo, which platforms deliver at different times.
  //
  // On the web build that setter delegates straight back to Appearance, so it
  // throws for the same reason. Nothing is broken by that — the page still
  // follows the system's own colour scheme — but an unhandled throw here would
  // take the Settings screen down with it.
  try {
    cssColorScheme.set(next === "system" ? Appearance.getColorScheme() : next);
  } catch {
    // No override on this platform; `prefers-color-scheme` still drives it.
  }
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function setThemePreference(next: ThemePreference) {
  if (next === preference) return;
  preference = next;
  applyPreference(next);
  notify();
  void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
    // Persistence is best-effort; the in-memory preference still applies.
  });
}

/** Load the stored preference once at app start. Safe to call repeatedly. */
export async function hydrateThemePreference(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === "system" || stored === "light" || stored === "dark") {
      preference = stored;
      applyPreference(stored);
      notify();
    }
  } catch {
    // Keep default system preference.
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getPreference() {
  return preference;
}

/** The user's choice: follow the system, or a pinned theme. */
export function useThemePreference() {
  return useSyncExternalStore(subscribe, getPreference, getPreference);
}

/** The theme actually in effect, after the preference is applied. */
export function useThemeName(): ThemeName {
  const scheme = useSyncExternalStore(
    (listener) => {
      const subscription = Appearance.addChangeListener(listener);
      return () => subscription.remove();
    },
    () => Appearance.getColorScheme(),
    () => Appearance.getColorScheme(),
  );

  return scheme === "dark" ? "dark" : "light";
}

/** Token values for the theme in effect. */
export function useThemeColors() {
  return colors[useThemeName()];
}

/** Call once from the root layout so the stored preference is applied early. */
export function useHydrateTheme() {
  useEffect(() => {
    void hydrateThemePreference();
  }, []);
}
