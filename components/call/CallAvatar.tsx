import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useThemeColors } from "@/hooks/useTheme";

const SIZE = 112;

/**
 * The rider, as the one letter GRIDGO lets the shop know them by. While a
 * call is ringing, two rings travel out from it — the one moving thing on the
 * screen, saying "this is still trying". Reduced motion keeps a still ring;
 * the status line under the name says the same in words either way.
 */
export function CallAvatar({ name, ringing, dimmed = false }: { name: string; ringing: boolean; dimmed?: boolean }) {
  const colors = useThemeColors();
  const initial = name.trim().charAt(0).toUpperCase() || "R";

  return (
    <View className="items-center justify-center" style={{ width: SIZE * 1.6, height: SIZE * 1.6 }} aria-hidden>
      {ringing ? (
        <>
          <Ring delay={0} color={colors.textMuted} />
          <Ring delay={900} color={colors.textMuted} />
        </>
      ) : null}
      <View
        className="items-center justify-center rounded-pill border border-outline bg-surface-high"
        style={{ width: SIZE, height: SIZE, opacity: dimmed ? 0.6 : 1 }}
      >
        <Text className="text-display text-text-primary" allowFontScaling={false} style={{ fontSize: 44, lineHeight: 52 }}>
          {initial}
        </Text>
      </View>
    </View>
  );
}

function Ring({ delay, color }: { delay: number; color: string }) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    progress.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false));
    return () => cancelAnimation(progress);
  }, [delay, progress, reduceMotion]);

  const style = useAnimatedStyle(() =>
    reduceMotion
      ? { opacity: delay === 0 ? 0.35 : 0, transform: [{ scale: 1.25 }] }
      : { opacity: 0.45 * (1 - progress.value), transform: [{ scale: 1 + 0.55 * progress.value }] },
  );

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: "absolute", width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 2, borderColor: color },
        style,
      ]}
    />
  );
}
