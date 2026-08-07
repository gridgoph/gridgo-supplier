import { useSyncExternalStore } from "react";
import { Appearance } from "react-native";
import { colorScheme as cssColorScheme } from "react-native-css";

import { colors, type ThemeName } from "@/constants/theme";

/**
 * Theme preference and resolved theme colours.
 *
 * Light and Dark are the same product with different presentation. Follow the
 * system preference by default, with an in-app override.
 *
 * Screens should style with NativeWind classes — `bg-canvas`, `text-text-primary`
 * — which already resolve per theme. Use `useThemeColors` only where a class
 * cannot go: navigation themes, the status bar, map styles.
 *
 * The preference lives in module state for now. It moves into the Zustand
 * theme store, persisted with AsyncStorage, when state management lands.
 */

export type ThemePreference = "system" | "light" | "dark";

let preference: ThemePreference = "system";
const listeners = new Set<() => void>();

function applyPreference(next: ThemePreference) {
  Appearance.setColorScheme(next === "system" ? null : next);

  // react-native-css keeps its own colour-scheme observable, seeded from
  // Appearance and updated by its change listener. Push the value directly so
  // the CSS layer switches on the same frame rather than waiting for the
  // native echo, which platforms deliver at different times.
  cssColorScheme.set(next === "system" ? Appearance.getColorScheme() : next);
}

export function setThemePreference(next: ThemePreference) {
  if (next === preference) return;
  preference = next;
  applyPreference(next);
  listeners.forEach((listener) => listener());
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
