import type { Stack } from "expo-router";
import type { ComponentProps } from "react";

import { colors, typography, type ThemeName } from "@/constants/theme";

type ScreenOptions = ComponentProps<typeof Stack>["screenOptions"];

/**
 * Header chrome for every stack in the app.
 *
 * The root stack and the nested job stack must look identical, so the options
 * are written once here rather than copied into each `_layout`.
 */
export function stackScreenOptions(scheme: ThemeName): ScreenOptions {
  const token = colors[scheme];
  return {
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
  };
}
