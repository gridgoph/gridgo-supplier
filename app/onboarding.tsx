import { router, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GridgoLogo } from "@/components/GridgoLogo";
import { OnboardingMark } from "@/components/OnboardingMark";
import { PaginationDots } from "@/components/PaginationDots";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { onboardingSlides, type OnboardingArt } from "@/data/onboarding";
import { resolveOnboardingExit } from "@/lib/onboardingExit";
import { estimatePagerHeight } from "@/lib/onboardingStage";

/**
 * Supplier onboarding.
 *
 * Three pages: jobs, produce, payout. Each beat is a PNG the captain picked,
 * loaded through `images.onboarding` — not a scene SVG.
 *
 * Entry points: first-run / public (`/onboarding`) and Settings replay
 * (`/onboarding?from=settings`). Exit is explicit via `resolveOnboardingExit`
 * — never dependent on navigation history alone.
 */

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { width, height: windowHeight } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const params = useLocalSearchParams<{ from?: string | string[] }>();
  const from = Array.isArray(params.from) ? params.from[0] : params.from;

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);
  const [measuredPager, setMeasuredPager] = useState(0);
  const pagerHeight =
    measuredPager > 0
      ? measuredPager
      : estimatePagerHeight(windowHeight, insets.top, insets.bottom);
  const last = onboardingSlides.length - 1;

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  function onMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  }

  function goTo(next: number) {
    scrollRef.current?.scrollTo({ x: next * width, animated: !reducedMotion });
    setIndex(next);
  }

  function dismiss() {
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

  function onPagerLayout(event: LayoutChangeEvent) {
    const next = event.nativeEvent.layout.height;
    setMeasuredPager((current) => (current === next ? current : next));
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <View className="gg-page flex-row items-center justify-between py-3">
        <GridgoLogo size={40} role="supplier" />
        <Pressable
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
          className="gg-touch items-end justify-center"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <Text className="text-button text-text-secondary">Skip</Text>
        </Pressable>
      </View>

      <View className="flex-1" onLayout={onPagerLayout}>
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          onMomentumScrollEnd={onMomentumScrollEnd}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
          bounces={false}
        >
          {onboardingSlides.map((slide, slideIndex) => (
            <Slide
              key={slide.id}
              active={slideIndex === index}
              index={slideIndex}
              art={slide.art}
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

      {/*
        The dots belong to the button, not to the empty space above it.
        Centred and pulled in tight, they read as one control.
      */}
      <View className="gg-page gap-2 pb-2 pt-3">
        <View className="items-center">
          <PaginationDots
            count={onboardingSlides.length}
            activeIndex={index}
            scrollX={scrollX}
            width={width}
            onPress={goTo}
          />
        </View>
        <PrimaryButton
          label={onboardingSlides[index].cta}
          onPress={() => (index === last ? dismiss() : goTo(index + 1))}
        />
      </View>
    </Screen>
  );
}

type SlideProps = {
  active: boolean;
  index: number;
  art: OnboardingArt;
  step: string;
  title: string;
  body: string;
  scrollX: SharedValue<number>;
  width: number;
  height: number;
};

/**
 * One page: the shop picture, then the ticket number, then the words.
 * No hairline — the art and the copy already sit as one beat.
 */
function Slide({
  active,
  index,
  art,
  step,
  title,
  body,
  scrollX,
  width,
  height,
}: SlideProps) {
  const reducedMotion = useReducedMotion();

  const style = useAnimatedStyle(() => {
    if (reducedMotion) return { opacity: 1 };
    const page = width > 0 ? scrollX.value / width : 0;
    return { opacity: Math.max(0, 1 - Math.abs(page - index)) };
  });

  return (
    <Animated.View
      aria-hidden={!active}
      style={[{ width, height: height > 0 ? height : undefined }, style]}
    >
      <View className="min-h-0 flex-1">
        <OnboardingMark name={art} />
      </View>
      <View className="gg-page pb-1">
        <Text className="text-overline text-text-muted">{step}</Text>
        <Text className="mt-1.5 text-h1 text-text-primary" accessibilityRole="header">
          {title}
        </Text>
        <Text className="mt-2 text-body-lg text-text-secondary">{body}</Text>
      </View>
    </Animated.View>
  );
}
