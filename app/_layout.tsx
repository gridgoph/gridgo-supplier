import "../global.css";

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
  type Theme,
} from "@react-navigation/native";
import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import Constants from "expo-constants";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";

import { ToastHost } from "@/components/ToastHost";
import { ClerkSessionBridge } from "@/components/ClerkSessionBridge";
import { colors, type ThemeName } from "@/constants/theme";
import { useAlertStream } from "@/hooks/useAlertStream";
import { useAppFonts } from "@/hooks/useAppFonts";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useHydrateTheme, useThemeColors, useThemeName } from "@/hooks/useTheme";
import { sheetScreenOptions, stackScreenOptions } from "@/lib/navigationOptions";
import { resolveClerkPublishableKey } from "@/lib/clerk";
import { isMatchable, isSignedIn, useSession } from "@/store/session";

SplashScreen.preventAutoHideAsync();

const publishableKey = resolveClerkPublishableKey(
  Constants.expoConfig?.extra?.clerkPublishableKey,
  __DEV__,
);

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
    // Without the metrics the platform already knows at launch, the provider
    // renders nothing until native reports its insets — one empty frame between
    // the splash screen going and the first screen arriving.
    // Gesture Handler needs its own root above everything that uses a gesture,
    // and on Android nothing it draws responds to touch without one. The alert
    // list's swipe-to-clear is the first gesture in this app that is ours
    // rather than the navigator's.
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ClerkSessionBridge>
        <GestureHandlerRootView style={{ flex: 1 }}>
            {/*
              One keyboard, one behaviour. Without this provider the two
              platforms disagree about what a keyboard even is — Android
              resizes the window and iOS does not — and every screen has to
              hold a `Platform.OS` split it can only get right on one of them.
              With it, Android stops resizing and both platforms report the
              same frame-by-frame keyboard geometry, which is what
              `components/FormScrollView` and the two shells are built on.

              `preserveEdgeToEdge` matters here: this app is edge-to-edge on
              Android (Android 15 enforces it), the tab bar's geometry is
              measured against that, and the module must not quietly take it
              away.
            */}
          <KeyboardProvider statusBarTranslucent navigationBarTranslucent preserveEdgeToEdge>
            <SafeAreaProvider initialMetrics={initialWindowMetrics}>
              <ThemeProvider value={navigationTheme(scheme)}>
                <RootStack />
                {/*
                  Above the navigator so an alert can arrive on any screen,
                  and at the top of it so it can never sit on the action a
                  screen wants pressed — see `components/ToastHost`.
                */}
                <ToastHost />
                <StatusBar style={scheme === "dark" ? "light" : "dark"} />
              </ThemeProvider>
            </SafeAreaProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </ClerkSessionBridge>
    </ClerkProvider>
  );
}

/**
 * Session-driven root stack.
 *
 * `Stack.Protected` is the SDK 54 idiomatic guard: when a group's guard flips
 * to false (logout, rejected role, 401), those screens are removed from history
 * — not merely covered — so Android back cannot re-enter them.
 *
 * There are three states here, not two. A shop can sign itself up, so it can be
 * signed in and still not be one GRIDGO sends work to; that shop gets the
 * accreditation screen rather than a tab shell whose every tab would be empty
 * for a reason none of them explains. Settings stays reachable from both so a
 * waiting shop is not locked out of its own theme and sign-out.
 */
function RootStack() {
  const user = useSession((s) => s.user);
  const identity = useSession((s) => s.identity);
  const scheme = useThemeName();
  const signedIn = isSignedIn(user);
  const matchable = signedIn && isMatchable(user);
  const accessBlocked =
    identity.kind === "unassigned" ||
    identity.kind === "mismatch" ||
    identity.kind === "error";
  const signedOut = !signedIn && identity.kind === "signed_out";

  // Live alerts for as long as there is a session to receive them.
  useAlertStream(signedIn);
  // The third delivery leg: the same alerts, on the phone, with GRIDGO closed.
  // Mounted here so registration, token rotation and a tapped alert are wired
  // once. It never raises the permission dialog — only `PushEnableCard` does
  // that, and only from a tap.
  usePushNotifications();

  return (
    <Stack screenOptions={stackScreenOptions(scheme)}>
      {/* Launch redirect stays public so cold start always has an anchor. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      {/* Clerk's default browser-SSO return must stay reachable before activation. */}
      <Stack.Screen name="sso-callback" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />

      <Stack.Protected guard={signedOut}>
        <Stack.Screen name="(auth)/welcome" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/login" options={{ title: "Sign in" }} />
        <Stack.Screen name="(auth)/accept-invitation" options={{ title: "Invitation" }} />
        <Stack.Screen name="(auth)/recover-password" options={{ title: "Recover password" }} />
        <Stack.Screen name="(auth)/signup" options={{ headerShown: false, title: "Sign up" }} />
      </Stack.Protected>

      <Stack.Protected guard={accessBlocked}>
        <Stack.Screen name="access" options={{ headerShown: false, title: "Supplier access" }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && !matchable}>
        <Stack.Screen
          name="accreditation"
          options={{ headerShown: false, title: "Accreditation" }}
        />
      </Stack.Protected>

      <Stack.Protected guard={signedIn}>
        <Stack.Screen
          name="settings"
          options={{
            title: "Settings",
            headerBackButtonDisplayMode: "minimal",
          }}
        />
        {/*
          The shop's pin is reachable from both signed-in states on purpose: a
          shop waiting on accreditation is exactly the shop most likely to have
          put its pin on the wrong corner, and making it wait for approval to
          fix that would price its first jobs wrong.
        */}
        <Stack.Screen
          name="shop-location"
          options={{
            title: "Where you print",
            headerBackButtonDisplayMode: "minimal",
          }}
        />
        {/*
          Sheets the app asks for and waits on. Both are routes so the platform
          owns the presentation — see `sheetScreenOptions`. They sit with the
          signed-in guard rather than the matchable one because a waiting shop
          confirms moving its pin the same way an accredited one does.
        */}
        <Stack.Screen name="confirm" options={sheetScreenOptions(scheme)} />
        <Stack.Screen name="pick-date" options={sheetScreenOptions(scheme)} />
      </Stack.Protected>

      <Stack.Protected guard={matchable}>
        {/*
          The tab shell draws its own headers per tab. It still needs a title:
          a pushed screen's back control falls back to the previous route's
          name, and "(tabs)" is not something a person should ever hear.
        */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "GRIDGO" }} />
        {/*
          Pushed screens sit above the tab shell and must share the same guard —
          a tabs-only guard would leave job/payout/design-system reachable after
          sign-out. On iOS the native stack labels the back control with the
          previous screen's title; with no title the route group falls through
          as "(tabs)". These screens are reachable from more than one tab, so no
          single origin label is honest — use a bare chevron. The native back
          control keeps its accessible name for VoiceOver.
        */}
        {/* The job stack draws its own headers for the workspace and its flows. */}
        <Stack.Screen name="job/[id]" options={{ headerShown: false }} />
        <Stack.Screen
          name="payout"
          options={{
            title: "Earnings",
            headerBackButtonDisplayMode: "minimal",
          }}
        />
        <Stack.Screen
          name="capacity"
          options={{
            title: "Capacity & closures",
            headerBackButtonDisplayMode: "minimal",
          }}
        />
        {/* The catalogue draws its own headers for the list and one category. */}
        <Stack.Screen name="services" options={{ headerShown: false }} />
        {/*
          A closure used to be presented as a modal, which is why it drew its
          own "Cancel" in the header — a modal is dismissed, not navigated back
          from. The captain wants the chevron every other screen in this app
          has, and nothing here needed the modal: both entry points push it, it
          has no dismiss guard, and its date picker is its own sheet route
          either way. So it is an ordinary pushed screen and takes the stack's
          own back control, rather than a modal wearing a chevron it should not
          have.
        */}
        <Stack.Screen
          name="shop-closure"
          options={{
            title: "Shop closure",
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
