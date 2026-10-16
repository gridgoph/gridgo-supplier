import type { Stack } from "expo-router";
import { HeaderBackButton } from "expo-router/react-navigation";
import { createElement, type ComponentProps } from "react";
import { Platform } from "react-native";

import { nativeHeaderInsetOptions } from "@/lib/nativeHeaderInsets";

import { colors, radius, typography, type ThemeName } from "@/constants/theme";

type ScreenOptions = ComponentProps<typeof Stack>["screenOptions"];
type StackOptions = Exclude<NonNullable<ScreenOptions>, (...args: never[]) => unknown>;
type ScreenOptionsArgs = Parameters<Extract<NonNullable<ScreenOptions>, (...args: never[]) => unknown>>[0];
type ScreenProps = ComponentProps<typeof Stack.Screen>;
type SingleScreenOptions = NonNullable<ScreenProps["options"]>;

/**
 * Header chrome for every stack in the app.
 *
 * The root stack and the nested job stack must look identical, so the options
 * are written once here rather than copied into each `_layout`.
 */
export function stackScreenOptions(scheme: ThemeName, topInset: number): StackOptions {
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
 * Header chrome for a stack nested under the root one (the job, a listing,
 * the service catalogue).
 *
 * The first screen of a nested stack has no sibling behind it. Android's
 * toolbar walks up to the parent stack and draws its arrow anyway; iOS's
 * navigation bar only draws a back item for a screen below it in the *same*
 * stack, so a job or listing opened from a tab had no way back on an iPhone.
 * There, and only there, that first screen borrows the platform's bare
 * chevron and pops the parent — the same control `(auth)/signup` gives its
 * first step. A deep link with nothing behind it still gets none.
 */
export function nestedStackScreenOptions(scheme: ThemeName, topInset: number) {
  const options = stackScreenOptions(scheme, topInset);
  return ({ navigation, route }: ScreenOptionsArgs): StackOptions => {
    if (Platform.OS !== "ios" || navigation.getState().routes[0]?.key !== route.key) return options;
    return {
      ...options,
      headerLeft: ({ canGoBack, tintColor }) =>
        canGoBack
          ? createElement(HeaderBackButton, {
              tintColor,
              displayMode: "minimal",
              onPress: () => navigation.goBack(),
            })
          : null,
    };
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
 * The sheet paints its own surface (`components/SheetSurface`). On iOS the
 * container is painted the same colour: a `fitToContents` detent measures the
 * content, and UIKit then grows the sheet by the home-indicator inset below it.
 * react-native-screens hands `contentStyle`'s background to that whole native
 * sheet on iOS, so a transparent one let the system sheet show through as a
 * darker band under the surface. Android keeps it transparent so the surface
 * is what shows through the bottom sheet's rounded corners.
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
    contentStyle: { backgroundColor: Platform.OS === "ios" ? token.surface : "transparent" },
    // Android's bottom sheet paints its own container; keep it off the canvas
    // colour so the surface below is what shows through the rounded corners.
    navigationBarColor: token.surface,
  };
}
