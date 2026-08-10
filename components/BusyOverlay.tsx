import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";

import { motion } from "@/constants/theme";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  visible: boolean;
  /** What is being done, in the shop's words. Read aloud while it runs. */
  label: string;
};

/**
 * Work the shop must wait for, over the screen it started from.
 *
 * A skeleton is for content that has not arrived; this is the other case — the
 * screen is already there and correct, and something is being committed to
 * GRIDGO across several requests. Blanking it into placeholders would throw away
 * what the shop is looking at, so the screen stays and a scrim states the wait
 * and swallows a second tap on the same action.
 */
export function BusyOverlay({ visible, label }: Props) {
  const colors = useThemeColors();
  const reduceMotion = useReducedMotion();

  if (!visible) return null;

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(motion.fast)}
      style={StyleSheet.absoluteFill}
      className="items-center justify-center bg-scrim"
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <View className="gg-card min-w-40 items-center gap-3">
        <ActivityIndicator color={colors.textPrimary} />
        <Text className="text-center text-body text-text-primary">{label}</Text>
      </View>
    </Animated.View>
  );
}
