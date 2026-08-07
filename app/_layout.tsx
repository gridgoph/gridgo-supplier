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
import { useHydrateTheme, useThemeColors, useThemeName } from "@/hooks/useTheme";
import { isSignedIn, useSession } from "@/store/session";

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
  useHydrateTheme();
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
        <RootStack />
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * Session-driven root stack.
 *
 * `Stack.Protected` is the SDK 54 idiomatic guard: when the signed-in group’s
 * guard flips to false (logout, rejected role, 401), those screens are removed
 * from history — not merely covered — so Android back cannot re-enter them.
 * Login is the complementary half of the pair so the navigator always has an
 * unauthenticated landing route.
 */
function RootStack() {
  const user = useSession((s) => s.user);
  const token = useThemeColors();
  const signedIn = isSignedIn(user);

  return (
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
      {/* Launch redirect stays public so cold start always has an anchor. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />

      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn}>
        {/* The tab shell draws its own headers per tab. */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/*
          Pushed screens sit above the tab shell and must share the same guard —
          a tabs-only guard would leave job/payout/design-system reachable after
          sign-out. On iOS the native stack labels the back control with the
          previous screen's title; with no title the route group falls through
          as "(tabs)". These screens are reachable from more than one tab, so no
          single origin label is honest — use a bare chevron. The native back
          control keeps its accessible name for VoiceOver.
        */}
        <Stack.Screen
          name="job/[id]"
          options={{
            title: "Job",
            headerBackButtonDisplayMode: "minimal",
          }}
        />
        <Stack.Screen
          name="payout"
          options={{
            title: "Protected payment",
            headerBackButtonDisplayMode: "minimal",
          }}
        />
        <Stack.Screen
          name="design-system"
          options={{
            title: "Design system",
            headerBackButtonDisplayMode: "minimal",
          }}
        />
      </Stack.Protected>
    </Stack>
  );
}
