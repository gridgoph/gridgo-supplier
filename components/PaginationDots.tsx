import { Pressable, View } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from "react-native-reanimated";

import { useThemeColors } from "@/hooks/useTheme";

/**
 * Slide position, in the same visual language as the GRIDGO mark: quiet dots
 * with one lit. The active dot stretches into a pill rather than only
 * changing colour, so position still reads in grayscale.
 *
 * The dots are an "active step" indicator, which is one of the few places the
 * system allows actionYellow outside a primary CTA.
 */

const DOT = 8;
const ACTIVE = 24;
/** 8px dot + 18px on every side clears the 44px minimum in both directions. */
const PAD = 18;
const TARGET = DOT + PAD * 2;

type Props = {
  count: number;
  /** Drives accessibility only. Animation reads `scrollX`. */
  activeIndex: number;
  /** Horizontal scroll offset in px. */
  scrollX: SharedValue<number>;
  /** Page width in px, so the offset can be read as a fractional page. */
  width: number;
  onPress: (index: number) => void;
};

export function PaginationDots({ count, activeIndex, scrollX, width, onPress }: Props) {
  return (
    // No gap: each dot's own 44px target is the spacing. Adding one on top
    // would push them a thumb-width apart.
    <View className="flex-row items-center" accessibilityRole="tablist">
      {Array.from({ length: count }, (_, index) => (
        <Dot
          key={index}
          index={index}
          count={count}
          selected={index === activeIndex}
          scrollX={scrollX}
          width={width}
          onPress={onPress}
        />
      ))}
    </View>
  );
}

type DotProps = {
  index: number;
  count: number;
  selected: boolean;
  scrollX: SharedValue<number>;
  width: number;
  onPress: (index: number) => void;
};

function Dot({ index, count, selected, scrollX, width, onPress }: DotProps) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();

  // Animated values cannot come from a class, so this is on the style
  // exception list.
  const style = useAnimatedStyle(() => {
    const page = width > 0 ? scrollX.value / width : 0;
    // 1 when this dot's page is centred, falling to 0 at its neighbours.
    // With reduced motion it snaps instead of easing.
    const weight = reducedMotion
      ? Math.round(page) === index
        ? 1
        : 0
      : Math.max(0, 1 - Math.abs(page - index));

    return {
      width: DOT + (ACTIVE - DOT) * weight,
      backgroundColor: interpolateColor(weight, [0, 1], [colors.outline, colors.actionYellow]),
    };
  });

  return (
    <Pressable
      onPress={() => onPress(index)}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={`Slide ${index + 1} of ${count}`}
      // The dot itself is 8px wide, and 8px is not a control. The target is a
      // fixed 44 square with the dot centred in it, which also stops the row
      // reflowing as the active dot stretches from 8 to 24.
      style={{ width: TARGET, height: TARGET, alignItems: "center", justifyContent: "center" }}
    >
      <Animated.View style={[{ height: DOT, borderRadius: DOT / 2 }, style]} />
    </Pressable>
  );
}
