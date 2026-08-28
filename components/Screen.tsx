import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets, type Edge } from "react-native-safe-area-context";

import { useThemeColors } from "@/hooks/useTheme";

const ALL_EDGES: readonly Edge[] = ["top", "right", "bottom", "left"];

/**
 * The screen shell: full-bleed canvas, inset on the edges the screen asks for.
 *
 * Padding comes from `useSafeAreaInsets()`, not a measuring safe-area view.
 * The provider already knows the insets (seeded with `initialWindowMetrics`),
 * so reading them here is correct on the first frame of a push.
 */
export function Screen({
  edges = ALL_EDGES,
  children,
}: {
  /** Which insets to apply. Omit for all four. */
  edges?: readonly Edge[];
  children: ReactNode;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.canvas,
        paddingTop: edges.includes("top") ? insets.top : 0,
        paddingRight: edges.includes("right") ? insets.right : 0,
        paddingBottom: edges.includes("bottom") ? insets.bottom : 0,
        paddingLeft: edges.includes("left") ? insets.left : 0,
      }}
    >
      {children}
    </View>
  );
}
