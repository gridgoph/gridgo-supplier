import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useThemeColors } from "@/hooks/useTheme";

/**
 * One pass of the highlight, in milliseconds.
 *
 * The 160–240ms budget governs transitions — a thing moving from one state to
 * another, where a slow move reads as lag. This is ambient: it says "still
 * working" for as long as the wait lasts. At a second a pass it reads as
 * considered; run at transition speed it would strobe, which is why an earlier
 * pass here reached for a still placeholder instead. A sweep at this period is
 * neither.
 */
const SHIMMER_PERIOD = 1000;

/** Ids must be unique per gradient; `url(#id)` cannot carry React's colons. */
let gradientSeq = 0;

/**
 * The highlight that travels across a placeholder.
 *
 * A soft band rather than a hard edge, painted in the elevated surface token —
 * white over the grey in Light, #2A2A2A over #1E1E1E in Dark — so it reads as
 * light moving over the shape rather than a second shape on top of it.
 *
 * With reduced motion on, the placeholder stays and the sweep does not run.
 * Nothing here carries state, so removing the motion removes nothing.
 */
function Shimmer() {
  const colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [gradientId] = useState(() => `gg-shimmer-${(gradientSeq += 1)}`);
  const progress = useSharedValue(0);

  const band = Math.max(width * 0.7, 48);

  useEffect(() => {
    if (reduceMotion || width === 0) return;
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: SHIMMER_PERIOD, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [progress, reduceMotion, width]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: -band + progress.value * (width + band) }],
  }));

  return (
    <View
      testID="skeleton-sweep"
      style={StyleSheet.absoluteFill}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      pointerEvents="none"
    >
      {reduceMotion || width === 0 ? null : (
        <Animated.View
          style={[{ position: "absolute", bottom: 0, top: 0, width: band }, style]}
        >
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={colors.surfaceHigh} stopOpacity={0} />
                <Stop offset="0.5" stopColor={colors.surfaceHigh} stopOpacity={1} />
                <Stop offset="1" stopColor={colors.surfaceHigh} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}

type BlockProps = {
  /** Tailwind height/width classes for one placeholder bar. */
  className?: string;
};

/**
 * A placeholder in the shape of the thing that is loading.
 *
 * A bare spinner tells a shop nothing about what is coming; a skeleton keeps the
 * page's own rhythm so content lands where the eye already is — and so the page
 * does not grow under the finger the moment it arrives.
 */
export function SkeletonBlock({ className = "h-4 w-full" }: BlockProps) {
  return (
    <View className={`overflow-hidden rounded-field bg-surface-variant ${className}`}>
      <Shimmer />
    </View>
  );
}

/**
 * The shape of a job card while it loads: title, meta, status, spec lines.
 */
export function JobCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <View className="gg-card gap-3" accessibilityElementsHidden>
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-2">
          <SkeletonBlock className="h-5 w-3/4" />
          <SkeletonBlock className="h-3 w-2/5" />
        </View>
        <SkeletonBlock className="h-6 w-24 rounded-pill" />
      </View>
      {compact ? null : (
        <View className="gap-3 pt-1">
          <SkeletonBlock className="h-3 w-full" />
          <SkeletonBlock className="h-3 w-5/6" />
          <SkeletonBlock className="h-3 w-2/3" />
        </View>
      )}
    </View>
  );
}

/** The shape of a dense agenda line. */
export function RowSkeleton() {
  return (
    <View
      className="flex-row items-center gap-3 rounded-field border border-outline bg-surface px-3 py-3"
      accessibilityElementsHidden
    >
      <SkeletonBlock className="h-3 w-12" />
      <View className="min-w-0 flex-1 gap-2">
        <SkeletonBlock className="h-4 w-2/3" />
        <SkeletonBlock className="h-3 w-1/3" />
      </View>
      <SkeletonBlock className="h-6 w-20 rounded-pill" />
    </View>
  );
}

/**
 * The shape of a section heading above a list, so the list below it does not
 * shift down by a line the moment the real headings arrive.
 */
export function SectionHeaderSkeleton() {
  return (
    <View className="flex-row items-center gap-2 py-1" accessibilityElementsHidden>
      <SkeletonBlock className="h-3 w-24" />
    </View>
  );
}

type ListProps = {
  /** What is loading, said plainly, for screen readers. */
  label: string;
  count?: number;
  variant?: "card" | "row";
  /** Card placeholders without the spec block underneath. */
  compact?: boolean;
  /** Draws the heading the real list is grouped under. */
  sectioned?: boolean;
};

/**
 * A loading list. Announces once for assistive technology and draws silent
 * placeholders — a screen reader should hear "Loading jobs", not eight bars.
 */
export function SkeletonList({
  label,
  count = 3,
  variant = "card",
  compact,
  sectioned = false,
}: ListProps) {
  return (
    <View
      className={variant === "row" ? "gap-2" : "gap-3"}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      {sectioned ? <SectionHeaderSkeleton /> : null}
      {Array.from({ length: count }, (_, index) =>
        variant === "row" ? (
          <RowSkeleton key={index} />
        ) : (
          <JobCardSkeleton key={index} compact={compact} />
        ),
      )}
    </View>
  );
}
