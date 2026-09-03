import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { type ThemeName } from "@/constants/theme";
import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import { loadBrandStings, type BrandStings } from "@/lib/brandSound";

/**
 * The opening. GRIDGO Supplier drawing itself, then handing the screen over.
 *
 * Ported beat for beat from the legacy Flutter app
 * (`printing_app/apps/mobile/lib/features/splash/screens/splash_screen.dart`),
 * which is where this sequence was designed and approved:
 *
 *   1. Nine dots light one at a time in a spiral from the bottom-left, each
 *      rising from a ghost to its own colour, with the intro sting under them.
 *   2. The top-right dot — the one the mark lights, the job on the grid —
 *      swells until it is the whole screen.
 *   3. GRIDGO fades up on that yellow field, on the outro sting.
 *   4. Everything fades, and the app is underneath.
 *
 * The swell is the one bold moment; nothing else on the screen competes with
 * it. The dots resolve to exactly the colours `GridgoMark` draws, so what the
 * grid finishes as is the mark itself rather than a lookalike.
 *
 * This is an overlay over the whole navigator, not a route. Session restore,
 * push handling and the launch ladder all run underneath it exactly as they do
 * without it — nothing about where a launch lands is decided here.
 */

/* ---------------------------------------------------------------------------
   Geometry — the GRIDGO mark's own grid.

   The same 26-unit diameter against a 9-unit gap `GridgoMark` and
   `SessionWait` draw, kept here as plain numbers for the same reason
   `SessionWait` keeps them: these are Views being animated, not SVG circles.
   --------------------------------------------------------------------------- */

const CENTRES = [15, 50, 85] as const;
const RADIUS = 13;
/** Edge length of the grid, from the legacy screen. */
const MARK_SIZE = 80;
/** Top-right cell — the dot the mark lights, and the one that takes the screen. */
const LIT_CELL = 2;

/**
 * Spiral from the bottom-left, as cell indices (row * 3 + column).
 * Up the left column, across the top, down through the middle, and round —
 * so the lit corner is the last to arrive and the swell follows straight on.
 */
const ORDER = [6, 3, 0, 1, 4, 7, 8, 5, 2] as const;
const LIT_STEP = ORDER.indexOf(LIT_CELL);

/* ---------------------------------------------------------------------------
   Timing. Every number is the legacy screen's.
   --------------------------------------------------------------------------- */

/** A beat on the empty canvas before the first dot. */
const LEAD_IN = 300;
/** Gap between one dot starting and the next. */
const DOT_STAGGER = 90;
/** How long one dot takes to arrive. */
const DOT_MS = 400;
/** How faint a dot is before it lights. */
const GHOST = 0.08;
/** The cascade's own clock, in milliseconds: last dot's start plus its run. */
const CASCADE_SPAN = (ORDER.length - 1) * DOT_STAGGER + DOT_MS;

/** The swell starts while the last dot is still arriving. */
const ENGULF_AT = LEAD_IN + (ORDER.length - 1) * DOT_STAGGER + 120;
const ENGULF_MS = 600;

const WORDMARK_AT = ENGULF_AT + 700;
const WORDMARK_MS = 350;

/** The wordmark holds, then the whole overlay goes. */
const FADE_AT = WORDMARK_AT + 1500;
const FADE_MS = 400;

/** Reduced motion gets the finished frame and a short look at it. */
const REDUCED_HOLD = 900;

/** Flutter's `Curves.easeIn` and `Curves.easeOut`, to the same control points. */
const EASE_IN = Easing.bezier(0.42, 0, 1, 1);
const EASE_OUT = Easing.bezier(0, 0, 0.58, 1);

function cellCentre(cell: number, size: number): { x: number; y: number } {
  return {
    x: (CENTRES[cell % 3] / 100) * size,
    y: (CENTRES[Math.floor(cell / 3)] / 100) * size,
  };
}

/** Flutter's `Curves.easeOutCubic`, for the worklets that need it per frame. */
function easeOutCubic(t: number): number {
  "worklet";
  return 1 - Math.pow(1 - t, 3);
}

/** How far into its own 400ms a dot is, given the shared cascade clock. */
function dotProgress(clock: number, step: number): number {
  "worklet";
  return Math.min(Math.max((clock - step * DOT_STAGGER) / DOT_MS, 0), 1);
}

type Props = {
  /** Called once, when the overlay has finished or been skipped. */
  onDone: () => void;
};

export function BrandIntro({ onDone }: Props) {
  const colors = useThemeColors();
  const scheme = useThemeName();
  // Read through the context rather than `useSafeAreaInsets`, which throws
  // when no provider is above it. This overlay is the last thing between a
  // person and the app, so it must render wherever it is mounted; with no
  // provider the launch line simply sits on the raw bottom edge.
  const insets = useContext(SafeAreaInsetsContext);
  const reducedMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();

  // Skipping and finishing are the same ending, and the launch underneath must
  // only be uncovered once.
  const spent = useRef(false);
  const stingsRef = useRef<BrandStings | null>(null);
  const webSoundArmed = useRef(false);
  const [blocking, setBlocking] = useState(true);
  const finish = useCallback(() => {
    if (spent.current) return;
    spent.current = true;
    setBlocking(false);
    onDone();
  }, [onDone]);
  const onOverlayPress = useCallback(() => {
    // Browsers block HTMLMediaElement.play() until a tap. The first tap
    // therefore arms the sting without skipping, so the opening still plays.
    // Once the overlay has faded it must not swallow welcome-screen presses.
    if (Platform.OS === "web" && !webSoundArmed.current) {
      webSoundArmed.current = true;
      stingsRef.current?.armFromGesture();
      return;
    }
    finish();
  }, [finish]);

  const cascade = useSharedValue(0);
  const engulf = useSharedValue(0);
  const wordmark = useSharedValue(0);
  const shell = useSharedValue(1);

  const markLeft = (width - MARK_SIZE) / 2;
  const markTop = (height - MARK_SIZE) / 2;
  const dotRadius = (RADIUS / 100) * MARK_SIZE;
  const lit = cellCentre(LIT_CELL, MARK_SIZE);
  const litX = markLeft + lit.x;
  const litY = markTop + lit.y;

  /*
    The swelling circle is laid out at the size it *ends* on and scaled down to
    dot size, never laid out at dot size and scaled up.

    That is the whole difference between this reading as a smooth wipe and
    reading as a coarse one. A view blown up ~50x is drawn from a shape sized
    for a 21pt dot, and every edge in it is magnified with it; the same view
    laid out full-size and scaled *down* is drawn at its own size and only ever
    reduced, which is the direction that stays clean. It also means the final
    frame — the one the wordmark sits on — is at scale 1, so the yellow field
    is exactly a full-bleed circle rather than a stretched one.
  */
  const reach = Math.hypot(
    Math.max(litX, width - litX),
    Math.max(litY, height - litY),
  );
  /** Diameter at full spread: past the furthest corner, with a margin. */
  const fieldSize = reach * 2 * 1.04;
  /** The scale at which that circle is exactly one dot wide. */
  const dotUnit = (dotRadius * 2) / fieldSize;

  useEffect(() => {
    if (reducedMotion) {
      // No cascade and no swell — the destination, held long enough to read,
      // with the sting that belongs to it.
      cascade.value = CASCADE_SPAN;
      engulf.value = 1;
      wordmark.value = 1;

      const arrival = loadBrandStings();
      stingsRef.current = arrival;
      arrival?.outro();

      shell.value = withDelay(
        REDUCED_HOLD,
        withTiming(0, { duration: FADE_MS, easing: EASE_IN }, () => {
          runOnJS(finish)();
        }),
      );
      const endAt = setTimeout(finish, REDUCED_HOLD + FADE_MS);
      return () => {
        clearTimeout(endAt);
        stingsRef.current = null;
        arrival?.release();
      };
    }

    // Decoded before the first dot, so a cue is a play call and not a load.
    const stings = loadBrandStings();
    stingsRef.current = stings;
    const cues = [
      setTimeout(() => stings?.intro(), LEAD_IN),
      setTimeout(() => stings?.outro(), WORDMARK_AT),
    ];

    // One linear clock for the cascade; each dot reads its own slice of it.
    cascade.value = withDelay(
      LEAD_IN,
      withTiming(CASCADE_SPAN, { duration: CASCADE_SPAN, easing: Easing.linear }),
    );
    engulf.value = withDelay(
      ENGULF_AT,
      withTiming(1, { duration: ENGULF_MS, easing: EASE_IN }),
    );
    wordmark.value = withDelay(
      WORDMARK_AT,
      withTiming(1, { duration: WORDMARK_MS, easing: EASE_OUT }),
    );
    // The overlay's own fade carries the ending, so there is no second timer
    // that could finish out of step with what is on screen.
    shell.value = withDelay(
      FADE_AT,
      withTiming(0, { duration: FADE_MS, easing: EASE_IN }, () => {
        runOnJS(finish)();
      }),
    );
    // Reanimated's finishing callback is not reliable on web; without this
    // the invisible overlay stays mounted and eats every tap on welcome.
    const endAt = setTimeout(finish, FADE_AT + FADE_MS);

    return () => {
      for (const cue of cues) clearTimeout(cue);
      clearTimeout(endAt);
      stingsRef.current = null;
      // A skip cuts the sound with the picture.
      stings?.release();
    };
  }, [cascade, engulf, finish, reducedMotion, shell, wordmark]);

  const shellStyle = useAnimatedStyle(() => ({ opacity: shell.value }));

  /*
    One view plays both the lit dot and the field it becomes: it arrives on the
    cascade like its eight neighbours, then keeps growing. Handing the swell to
    a second circle meant that circle appearing at full strength on the frame
    the swell began, which is a visible pop on the beat that matters most.
  */
  const fieldStyle = useAnimatedStyle(() => {
    const arrival = easeOutCubic(dotProgress(cascade.value, LIT_STEP));
    const size = 0.4 + 0.6 * arrival;
    const spread = 1 + engulf.value * (1 / dotUnit - 1);
    return {
      opacity: GHOST + (1 - GHOST) * arrival,
      transform: [{ scale: dotUnit * size * spread }],
    };
  });

  const wordmarkStyle = useAnimatedStyle(() => ({ opacity: wordmark.value }));

  return (
    <Animated.View
      pointerEvents={blocking ? "box-none" : "none"}
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: colors.canvas, zIndex: 100 },
        shellStyle,
      ]}
    >
      <IntroStatusBar scheme={scheme} />
      <Pressable
        pointerEvents={blocking ? "auto" : "none"}
        style={StyleSheet.absoluteFill}
        onPress={onOverlayPress}
        // One element, one announcement, and an honest way past it: a screen
        // reader lands on "GRIDGO" and is told the tap skips the opening.
        accessibilityRole="button"
        accessibilityLabel="GRIDGO Supplier"
        accessibilityHint={
          Platform.OS === "web"
            ? "Plays the opening sound. Tap again to skip."
            : "Skips the opening animation"
        }
      >
        <View
          style={{
            position: "absolute",
            left: markLeft,
            top: markTop,
            width: MARK_SIZE,
            height: MARK_SIZE,
          }}
        >
          {ORDER.filter((cell) => cell !== LIT_CELL).map((cell) => (
            <Dot
              key={cell}
              step={ORDER.indexOf(cell)}
              cascade={cascade}
              radius={dotRadius}
              centre={cellCentre(cell, MARK_SIZE)}
              // Exactly what `GridgoMark` draws, so the finished grid is the
              // mark and not something that resembles it.
              color={cell % 3 < 2 ? colors.accent : colors.textMuted}
            />
          ))}
        </View>

        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              left: litX - fieldSize / 2,
              top: litY - fieldSize / 2,
              width: fieldSize,
              height: fieldSize,
              borderRadius: fieldSize / 2,
              backgroundColor: colors.brandLogo,
            },
            fieldStyle,
          ]}
        />

        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, wordmarkStyle]}
        >
          <View className="flex-1 items-center justify-center">
            {/*
              Satoshi Bold at 48/6, the legacy screen's own cut and tracking.
              Not `font-brand`: that is Satoshi Black, a heavier face than the
              mark this is the full-size version of.
            */}
            <Text
              className="font-bold text-action-yellow-on"
              style={{ fontSize: 48, letterSpacing: 6 }}
            >
              GRID<Text className="text-action-yellow-on-muted">GO</Text>
            </Text>
            {/*
              Three apps share this opening, so the role is what tells a person
              which one they just launched. It carries the weight the lockup
              gives it beside the wordmark, set as an eyebrow because here it
              sits under GRIDGO rather than next to it.
            */}
            <Text
              className="text-overline text-action-yellow-on-muted"
              style={{ marginTop: 10 }}
            >
              SUPPLIER
            </Text>
          </View>
          <View
            className="absolute left-0 right-0 items-center"
            style={{ bottom: (insets?.bottom ?? 0) + 12 }}
          >
            <Text className="text-overline text-action-yellow-on-muted">
              MAPPING THE FUTURE OF PRINTING
            </Text>
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/**
 * The status bar, on its own.
 *
 * Its icons have to turn dark once the field is yellow, whatever the theme
 * underneath is. Owning that flip here rather than in `BrandIntro` keeps the
 * re-render it causes down to this one leaf: the overlay itself then renders
 * once and never again while the animation runs, so nothing competes with the
 * swell for the frame it lands on.
 */
function IntroStatusBar({ scheme }: { scheme: ThemeName }) {
  const [onYellow, setOnYellow] = useState(false);

  useEffect(() => {
    const flip = setTimeout(() => setOnYellow(true), ENGULF_AT + ENGULF_MS * 0.5);
    return () => clearTimeout(flip);
  }, []);

  return <StatusBar style={onYellow || scheme !== "dark" ? "dark" : "light"} />;
}

/**
 * One quiet dot, reading its own slice of the shared cascade clock.
 *
 * Scale and opacity together: the legacy screen lerps a ghost tint up to the
 * dot's final colour, which on either canvas is the same arrival as fading the
 * final colour in from `GHOST`, and this way the colour is stated once.
 */
function Dot({
  step,
  cascade,
  radius,
  centre,
  color,
}: {
  step: number;
  cascade: SharedValue<number>;
  radius: number;
  centre: { x: number; y: number };
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const arrival = easeOutCubic(dotProgress(cascade.value, step));
    return {
      opacity: GHOST + (1 - GHOST) * arrival,
      transform: [{ scale: 0.4 + 0.6 * arrival }],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: centre.x - radius,
          top: centre.y - radius,
          width: radius * 2,
          height: radius * 2,
          borderRadius: radius,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}
