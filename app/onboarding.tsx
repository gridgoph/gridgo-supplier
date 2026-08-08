import { router, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { GridgoLogo } from "@/components/GridgoLogo";
import { PaginationDots } from "@/components/PaginationDots";
import { PrimaryButton } from "@/components/PrimaryButton";
import {
  illustrations,
  type IllustrationName,
  type IllustrationPalette,
} from "@/components/illustrations";
import { onboardingSlides } from "@/data/onboarding";
import { useThemeColors } from "@/hooks/useTheme";
import { resolveOnboardingExit } from "@/lib/onboardingExit";

/**
 * Supplier onboarding.
 *
 * Full-height horizontal pager over a fixed illustration stack. The art sits
 * behind the pager (pointerEvents none) and drifts at 40% of the text speed
 * with a cross-fade between beats — so a swipe lands anywhere in the content
 * area, not only on the short text band.
 *
 * Entry points:
 * - First launch / deep link: dismiss to the app launcher.
 * - Settings replay (`?from=settings`): return to Settings explicitly.
 */

const HERO_MAX = 360;

export default function OnboardingScreen() {
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const params = useLocalSearchParams<{ from?: string | string[] }>();
  const from = Array.isArray(params.from) ? params.from[0] : params.from;

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);
  // Horizontal ScrollView children do not stretch by flex — measure the
  // content region so every page is full height and swipes land on the art.
  const [pagerHeight, setPagerHeight] = useState(0);

  // `useWindowDimensions` reports 0 on the first web paint, and a negative
  // width is not a valid SVG dimension. Clamp rather than let it through.
  const heroWidth = Math.max(0, Math.min(width - 32, HERO_MAX));
  const last = onboardingSlides.length - 1;

  const palette = {
    ink: colors.accent,
    shade: colors.textSecondary,
    mid: colors.textMuted,
    tint: colors.outline,
    highlight: colors.surface,
  };

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  // The CTA label is React state, so it cannot read the shared value. Settle
  // it once per page rather than on every frame.
  function onMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  }

  function goTo(next: number) {
    scrollRef.current?.scrollTo({ x: next * width, animated: !reducedMotion });
    setIndex(next);
  }

  function dismiss() {
    // Explicit exits — do not rely on stack history alone.
    const exit = resolveOnboardingExit(from, router.canGoBack());
    if (exit === "settings") {
      router.replace("/settings" as Href);
      return;
    }
    if (exit === "back") {
      router.back();
      return;
    }
    router.replace("/");
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "bottom"]}>
      {/* Header sits above the pager so Skip is never swallowed by the scroller. */}
      <View className="gg-page flex-row items-center justify-between py-3" style={{ zIndex: 2 }}>
        <GridgoLogo />
        <Pressable
          onPress={dismiss}
          accessibilityRole="button"
          className="gg-touch items-end justify-center"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <Text className="text-button text-text-secondary">Skip</Text>
        </Pressable>
      </View>

      {/*
        Content: art behind, full-height pager in front. Swipes on the hero,
        empty space, or the text all page. Footer stays outside so dots and
        the CTA remain tappable without fighting the scroller.
      */}
      <View
        className="flex-1"
        onLayout={(event) => setPagerHeight(event.nativeEvent.layout.height)}
      >
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          {onboardingSlides.map((slide, slideIndex) => (
            <Hero
              key={slide.id}
              index={slideIndex}
              art={slide.art}
              scrollX={scrollX}
              width={width}
              heroWidth={heroWidth}
              palette={palette}
            />
          ))}
        </View>

        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          onMomentumScrollEnd={onMomentumScrollEnd}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
          // Horizontal only — never introduce a vertical scroll on this screen.
          bounces={false}
        >
          {onboardingSlides.map((slide, slideIndex) => (
            <Slide
              key={slide.id}
              active={slideIndex === index}
              index={slideIndex}
              step={slide.step}
              title={slide.title}
              body={slide.body}
              scrollX={scrollX}
              width={width}
              height={pagerHeight}
            />
          ))}
        </Animated.ScrollView>
      </View>

      <View className="gg-page gap-4 pb-2 pt-5" style={{ zIndex: 2 }}>
        <PaginationDots
          count={onboardingSlides.length}
          activeIndex={index}
          scrollX={scrollX}
          width={width}
          onPress={goTo}
        />
        <PrimaryButton
          label={onboardingSlides[index].cta}
          onPress={() => (index === last ? dismiss() : goTo(index + 1))}
        />
      </View>
    </SafeAreaView>
  );
}

type HeroProps = {
  index: number;
  art: IllustrationName;
  scrollX: SharedValue<number>;
  width: number;
  heroWidth: number;
  palette: IllustrationPalette;
};

/**
 * One piece of art, fading and drifting as its slide comes into view.
 *
 * All three are stacked and absolutely positioned rather than living inside
 * the pager. That is what lets them travel at 40% of the text's speed, and it
 * keeps the swap between beats a cross-fade rather than a hard cut.
 */
function Hero({ index, art, scrollX, width, heroWidth, palette }: HeroProps) {
  const reducedMotion = useReducedMotion();
  const { Component, aspect } = illustrations[art];

  const style = useAnimatedStyle(() => {
    const page = width > 0 ? scrollX.value / width : 0;

    // Reduced motion means no drift and no cross-fade — the art cuts between
    // beats, the way the dots and the text pages already do. Zeroing the
    // translation alone would still leave two pieces dissolving into each
    // other on every swipe.
    if (reducedMotion) {
      return { opacity: Math.round(page) === index ? 1 : 0, transform: [{ translateX: 0 }] };
    }

    const delta = page - index;

    return {
      // Fades out over a little less than a full page, so two pieces never
      // sit on top of each other at half strength.
      opacity: Math.max(0, 1 - Math.abs(delta) * 1.6),
      transform: [{ translateX: -delta * width * 0.4 }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        // Sit the art in the upper half so it clears the text band below.
        { alignItems: "center", justifyContent: "center", paddingBottom: 120 },
        style,
      ]}
    >
      <Component width={heroWidth} height={heroWidth / aspect} palette={palette} />
    </Animated.View>
  );
}

type SlideProps = {
  /** The settled page, not the scroll position. Drives accessibility only. */
  active: boolean;
  index: number;
  step: string;
  title: string;
  body: string;
  scrollX: SharedValue<number>;
  width: number;
  /** Measured content-region height so the page fills the swipe area. */
  height: number;
};

/**
 * One text page. Full height so the pager captures gestures over the art as
 * well as the copy. Text anchors to the bottom of the content area.
 *
 * The hairline and the step number are the job-ticket language the
 * design-system route already uses, and the number is what states position
 * when motion is off.
 */
function Slide({ active, index, step, title, body, scrollX, width, height }: SlideProps) {
  const reducedMotion = useReducedMotion();

  const style = useAnimatedStyle(() => {
    if (reducedMotion) return { opacity: 1 };
    const page = width > 0 ? scrollX.value / width : 0;
    return { opacity: Math.max(0, 1 - Math.abs(page - index)) };
  });

  return (
    <Animated.View
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      style={[{ width, height: height > 0 ? height : undefined, justifyContent: "flex-end" }, style]}
    >
      <View className="gg-page gap-2 pb-2">
        <View className="gg-divider" />
        <Text className="pt-2 text-overline text-text-muted">{step}</Text>
        <Text className="text-h1 text-text-primary" accessibilityRole="header">
          {title}
        </Text>
        <Text className="text-body-lg text-text-secondary">{body}</Text>
      </View>
    </Animated.View>
  );
}
