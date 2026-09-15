import type { Stack } from "expo-router";
import type { ComponentProps } from "react";
import { Platform } from "react-native";

import { nativeHeaderInsetOptions } from "@/lib/nativeHeaderInsets";

import { colors, radius, typography, type ThemeName } from "@/constants/theme";

type ScreenOptions = ComponentProps<typeof Stack>["screenOptions"];
type ScreenProps = ComponentProps<typeof Stack.Screen>;
type SingleScreenOptions = NonNullable<ScreenProps["options"]>;

/**
 * Header chrome for every stack in the app.
 *
 * The root stack and the nested job stack must look identical, so the options
 * are written once here rather than copied into each `_layout`.
 */
export function stackScreenOptions(scheme: ThemeName, topInset: number): ScreenOptions {
  const token = colors[scheme];
  return {
    ...nativeHeaderInsetOptions(Platform.OS, topInset),
    headerStyle: { backgroundColor: token.surface },
    headerTintColor: token.textPrimary,
    headerTitleStyle: {
      fontSize: typography.h3.fontSize,
      fontFamily: typography.h3.fontFamily,
    },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: token.canvas },
    /*
      These screens are reachable from more than one tab, so no single origin
      label is honest — iOS gets a bare chevron, which keeps its accessible
      name for VoiceOver.
    */
    headerBackButtonDisplayMode: "minimal",
    // Same freeze crash as the tab wall: a listing editor under a confirm
    // sheet must stay a live native tree so taking the listing off does not
    // unmount photos inside a frozen screen.
    freezeOnBlur: false,
  };
}

/**
 * A sheet presented by the navigator rather than an overlay drawn by a screen.
 *
 * `formSheet` hands the platform the presentation: iOS gets a UIKit sheet with
 * detents, Android gets a Material bottom sheet. Both bring spring physics that
 * track the finger, drag-to-dismiss, the back gesture, a real scrim, and the
 * system's own reduced-motion handling — none of which a hand-rolled `<Modal>`
 * has. `fitToContents` keeps a short question short: a two-line confirmation
 * must never open full height.
 *
 * The sheet paints its own surface (`components/SheetSurface`), so the screen
 * container behind it stays transparent and the sheet's corners stay round.
 */
export function sheetScreenOptions(scheme: ThemeName): SingleScreenOptions {
  const token = colors[scheme];
  return {
    presentation: "formSheet",
    headerShown: false,
    sheetAllowedDetents: "fitToContents",
    sheetGrabberVisible: true,
    sheetCornerRadius: radius.card,
    sheetElevation: 24,
    contentStyle: { backgroundColor: "transparent" },
    // Android's bottom sheet paints its own container; keep it off the canvas
    // colour so the surface below is what shows through the rounded corners.
    navigationBarColor: token.surface,
  };
}
