import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { motion } from "@/constants/theme";

type BlockProps = {
  /** Tailwind height/width classes for one placeholder bar. */
  className?: string;
};

/**
 * A placeholder in the shape of the thing that is loading.
 *
 * A bare spinner tells a shop nothing about what is coming; a skeleton keeps the
 * page's own rhythm so content lands where the eye already is. The pulse is the
 * only motion, it is slow, and reduced motion turns it off rather than removing
 * the placeholder.
 */
export function SkeletonBlock({ className = "h-4 w-full" }: BlockProps) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0.6);

  useEffect(() => {
    if (reduceMotion) {
      pulse.value = 0.6;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: motion.slow * 4, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [pulse, reduceMotion]);

  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      style={style}
      className={`rounded-field bg-surface-variant ${className}`}
    />
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

type ListProps = {
  /** What is loading, said plainly, for screen readers. */
  label: string;
  count?: number;
  variant?: "card" | "row";
  /** Card placeholders without the spec block underneath. */
  compact?: boolean;
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
}: ListProps) {
  return (
    <View
      className={variant === "row" ? "gap-2" : "gap-3"}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
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
