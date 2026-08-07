import "../global.css";

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
  type Theme,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { colors, type ThemeName, typography } from "@/constants/theme";
import { useAppFonts } from "@/hooks/useAppFonts";
import { useThemeColors, useThemeName } from "@/hooks/useTheme";

SplashScreen.preventAutoHideAsync();

/** React Navigation reads plain colours, so it gets them from the token file. */
function navigationTheme(scheme: ThemeName): Theme {
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const token = colors[scheme];

  return {
    ...base,
    dark: scheme === "dark",
    colors: {
      ...base.colors,
      background: token.canvas,
      card: token.surface,
      text: token.textPrimary,
      border: token.outline,
      primary: token.accent,
      notification: token.error,
    },
  };
}

export default function RootLayout() {
  const scheme = useThemeName();
  const token = useThemeColors();
  const fontsReady = useAppFonts();

  // Keeps the window behind the navigator on canvas, so theme changes and
  // screen transitions never flash the wrong background.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(token.canvas);
  }, [token.canvas]);

  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync();
  }, [fontsReady]);

  if (!fontsReady) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider value={navigationTheme(scheme)}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: token.surface },
            headerTintColor: token.textPrimary,
            headerTitleStyle: {
              fontSize: typography.h3.fontSize,
              fontFamily: typography.h3.fontFamily,
            },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: token.canvas },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          {/* The tab shell draws its own headers per tab. */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="design-system" options={{ title: "Design system" }} />
        </Stack>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
