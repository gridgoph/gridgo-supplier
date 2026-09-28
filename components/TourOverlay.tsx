import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { elevation } from "@/constants/theme";
import { useVisibleTourStep } from "@/hooks/useTourStep";
import { useThemeColors } from "@/hooks/useTheme";
import {
  canGoBack,
  nextLabel,
  fitHoleAbove,
  placeCard,
  stepPosition,
  type TourRect,
} from "@/lib/tour";
import { useAppUpdate } from "@/store/appUpdate";
import { usePushPrompt } from "@/store/pushPrompt";
import { useTour } from "@/store/tour";

/** Room around the lit control, so its own border is not cut in half. */
const HOLE_PAD = 6;
const HOLE_RADIUS = 16;
/** Wait for a pushed screen to finish sliding in before anything is drawn. */
const SETTLE_MS = 420;
const MOVE = { duration: 220, easing: Easing.out(Easing.cubic) };

/**
 * The first-run tour, drawn over whichever screen is up.
 *
 * It sits at the root beside the navigator rather than in each screen, so the
 * dim covers the stack header too and one component owns the whole look. The
 * screens only say which screen they are (`useTourScreen`) and which control is
 * lit (`TourTarget`).
 *
 * The lit control stays live — a tap on it does what it always does, and the
 * tour follows the shop to the next screen. The dim around it swallows taps,
 * so a stray thumb cannot scroll the control out from under its light. Skip is
 * on every card, and the system back works throughout: this is a view, not a
 * modal, and nothing here listens to the back button.
 *
 * There is no blur. The platform has no blur without a new native module, and
 * a gentle dim does the same job: it quiets everything except the one thing
 * being explained.
 */
export function TourOverlay({ ready }: { ready: boolean }) {
  const { accountId, progress, step } = useVisibleTourStep();
  const measured = useTour((s) => (step ? s.rects[step.id] : undefined));
  const { width, height } = useWindowDimensions();
  // A control scrolled out of view has nothing to light; the card still
  // explains it, pinned to the bottom.
  const rect = measured && onScreen(measured, width, height) ? measured : undefined;
  // One sheet at a time: the notifications explainer and the update sheet
  // both open over Home, and the tour waits for either to leave.
  const otherPrompt = usePushPrompt((s) => s.sheetOpen);
  const updatePrompt = useAppUpdate(
    (s) => s.sheetOpen || s.completed !== null || s.offer !== null,
  );
  const settled = useTour((s) => s.settled);
  const insets = useSafeAreaInsets();
  const [cardHeight, setCardHeight] = useState(0);

  const stepId = step?.id ?? null;
  useEffect(() => {
    useTour.getState().settle(null);
    if (!stepId) return;
    const timer = setTimeout(() => useTour.getState().settle(stepId), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [stepId]);

  const showing =
    ready &&
    !otherPrompt &&
    !updatePrompt &&
    accountId != null &&
    step != null &&
    progress?.status === "active" &&
    settled === step.id;

  useEffect(() => {
    if (showing && step) AccessibilityInfo.announceForAccessibility(`${step.title}. ${step.body}`);
  }, [showing, step]);

  if (!showing || !step || !accountId || progress?.status !== "active") return null;

  const padded = rect ? holeFor(rect, width, height) : null;
  const place = placeCard({
    target: padded,
    cardHeight,
    windowHeight: height,
    insetTop: insets.top,
    insetBottom: insets.bottom,
  });
  const hole = padded && place.side === "pinned" ? fitHoleAbove(padded, place.top) : padded;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Spotlight hole={hole} />
      <TourCard
        key={step.id}
        hole={hole}
        place={place}
        measured={cardHeight > 0}
        onMeasure={setCardHeight}
        title={step.title}
        body={step.body}
        position={stepPosition(progress)}
        nextText={nextLabel(progress)}
        backable={canGoBack(progress)}
        onNext={() => useTour.getState().next(accountId)}
        onBack={() => useTour.getState().back(accountId)}
        onSkip={() => useTour.getState().skip(accountId)}
      />
    </View>
  );
}

function onScreen(rect: TourRect, width: number, height: number): boolean {
  return rect.y < height && rect.y + rect.height > 0 && rect.x < width && rect.x + rect.width > 0;
}

function holeFor(rect: TourRect, width: number, height: number): TourRect {
  const x = Math.max(0, rect.x - HOLE_PAD);
  const y = Math.max(0, rect.y - HOLE_PAD);
  return {
    x,
    y,
    width: Math.min(width, rect.x + rect.width + HOLE_PAD) - x,
    height: Math.min(height, rect.y + rect.height + HOLE_PAD) - y,
  };
}

/**
 * The dim with a soft-edged hole in it.
 *
 * The hole is a view with an enormous border: the border is the dim, the empty
 * middle is the cut-out, and its inner corners are the hole's rounded corners.
 * Plain views, so it moves on the UI thread through Reanimated and renders the
 * same on Android, iOS and web without a mask. A thin light ring and a fainter
 * halo outside it are what make the edge read as lit rather than punched.
 */
function Spotlight({ hole }: { hole: TourRect | null }) {
  const colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const border = Math.max(width, height) * 2;

  const x = useSharedValue(hole?.x ?? 0);
  const y = useSharedValue(hole?.y ?? 0);
  const w = useSharedValue(hole?.width ?? 0);
  const h = useSharedValue(hole?.height ?? 0);

  useEffect(() => {
    if (!hole) return;
    const move = (value: typeof x, to: number) => {
      value.value = reduceMotion ? to : withTiming(to, MOVE);
    };
    move(x, hole.x);
    move(y, hole.y);
    move(w, hole.width);
    move(h, hole.height);
  }, [hole?.x, hole?.y, hole?.width, hole?.height, reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  const dimStyle = useAnimatedStyle(() => ({
    left: x.value - border,
    top: y.value - border,
    width: w.value + border * 2,
    height: h.value + border * 2,
  }));
  const ringStyle = useAnimatedStyle(() => ({
    left: x.value,
    top: y.value,
    width: w.value,
    height: h.value,
  }));
  const haloStyle = useAnimatedStyle(() => ({
    left: x.value - 4,
    top: y.value - 4,
    width: w.value + 8,
    height: h.value + 8,
  }));

  if (!hole) {
    return (
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.tourScrim }]}
        onStartShouldSetResponder={() => true}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      />
    );
  }

  const below = hole.y + hole.height;
  const right = hole.x + hole.width;

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.fixed,
          {
            borderWidth: border,
            borderRadius: HOLE_RADIUS + border,
            borderColor: colors.tourScrim,
          },
          dimStyle,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.fixed,
          { borderWidth: 4, borderRadius: HOLE_RADIUS + 4, borderColor: colors.tourRing, opacity: 0.22 },
          haloStyle,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.fixed,
          { borderWidth: 2, borderRadius: HOLE_RADIUS, borderColor: colors.tourRing },
          ringStyle,
        ]}
      />
      {/* The dim takes taps; the hole does not. Four plain blocks around it. */}
      <Absorb left={0} top={0} width={width} height={hole.y} />
      <Absorb left={0} top={below} width={width} height={Math.max(0, height - below)} />
      <Absorb left={0} top={hole.y} width={hole.x} height={hole.height} />
      <Absorb left={right} top={hole.y} width={Math.max(0, width - right)} height={hole.height} />
    </>
  );
}

function Absorb(frame: { left: number; top: number; width: number; height: number }) {
  if (frame.width <= 0 || frame.height <= 0) return null;
  return (
    <View
      style={[styles.fixed, frame]}
      onStartShouldSetResponder={() => true}
      importantForAccessibility="no"
      accessibilityElementsHidden
    />
  );
}

/**
 * The instruction: what this control is for, in a line or two, and the three
 * ways on. The yellow is Next's alone — the card is a bounded panel with one
 * primary action, and the lit control under the dim is already the loudest
 * thing on the screen.
 */
function TourCard({
  hole,
  place,
  measured,
  onMeasure,
  title,
  body,
  position,
  nextText,
  backable,
  onNext,
  onBack,
  onSkip,
}: {
  hole: TourRect | null;
  place: { top: number; side: "below" | "above" | "pinned" };
  measured: boolean;
  onMeasure: (height: number) => void;
  title: string;
  body: string;
  position: { index: number; count: number };
  nextText: string;
  backable: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const { width } = useWindowDimensions();

  // The notch points at the middle of the lit control, kept off the corners.
  const cardLeft = 16;
  const cardWidth = width - 32;
  const notchX = hole
    ? Math.min(Math.max(hole.x + hole.width / 2 - cardLeft - 8, 20), cardWidth - 36)
    : null;

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(200)}
      onLayout={(event) => onMeasure(event.nativeEvent.layout.height)}
      style={[
        styles.fixed,
        elevation.sheet,
        {
          left: cardLeft,
          width: cardWidth,
          top: place.top,
          opacity: measured ? 1 : 0,
        },
      ]}
    >
      <View className="gap-3 rounded-card border border-outline bg-surface p-4">
        <View className="flex-row items-center justify-between">
          <StepDots index={position.index} count={position.count} />
          <Pressable
            onPress={onSkip}
            accessibilityRole="button"
            accessibilityLabel="Skip the tour"
            className="gg-touch -mr-2 items-center justify-center px-2"
            style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
          >
            <Text className="text-button text-text-secondary">Skip</Text>
          </Pressable>
        </View>

        <View className="gap-1">
          <Text className="text-h3 text-text-primary">{title}</Text>
          <Text className="text-body text-text-secondary">{body}</Text>
        </View>

        <View className="flex-row justify-end gap-3 pt-1">
          {backable ? (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Back to the previous tip"
              className="gg-btn-secondary"
              style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
            >
              <Text className="text-button text-text-primary">Back</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onNext}
            accessibilityRole="button"
            accessibilityLabel={nextText === "Done" ? "Finish the tour" : nextText}
            className="gg-btn-primary min-w-24"
            style={({ pressed }) => (pressed ? { opacity: 0.9 } : undefined)}
          >
            <Text className="text-button text-action-yellow-on">{nextText}</Text>
          </Pressable>
        </View>
      </View>
      {/* After the card, so it paints over the card's own border. */}
      {notchX != null && place.side !== "pinned" ? (
        <View
          pointerEvents="none"
          style={[
            styles.notch,
            {
              left: notchX,
              backgroundColor: colors.surface,
              borderColor: colors.outline,
            },
            place.side === "below"
              ? { top: -8, borderTopWidth: 1, borderLeftWidth: 1 }
              : { bottom: -8, borderBottomWidth: 1, borderRightWidth: 1 },
          ]}
        />
      ) : null}
    </Animated.View>
  );
}

/**
 * Where the tour stands, as dots: done in ink, this one stretched to a pill,
 * the rest quiet. Width carries the position, so it reads in grayscale; the
 * label carries it for a screen reader. Not tappable — most steps live on
 * screens the tour will not take you to.
 */
function StepDots({ index, count }: { index: number; count: number }) {
  const colors = useThemeColors();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Tip ${index + 1} of ${count}`}
      className="flex-row items-center gap-1.5"
    >
      {Array.from({ length: count }, (_, dot) => (
        <View
          key={dot}
          style={{
            height: 6,
            width: dot === index ? 18 : 6,
            borderRadius: 3,
            backgroundColor:
              dot === index ? colors.accent : dot < index ? colors.textMuted : colors.outline,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fixed: { position: "absolute" },
  notch: {
    position: "absolute",
    width: 16,
    height: 16,
    transform: [{ rotate: "45deg" }],
    zIndex: 1,
  },
});
