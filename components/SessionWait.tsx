import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useThemeColors } from "@/hooks/useTheme";

/**
 * Identity crossing the door.
 *
 * Matching already owns the travelling yellow token — that is GRIDGO looking
 * for a printer. This wait is the other sentence: a person arriving or
 * leaving. The 3×3 is the same grid the mark is built from; only the lit
 * corner moves. Sign-in: the yellow job arrives on the top-right cell and
 * holds a pulse. Sign-out: it leaves. Nothing else on the screen competes.
 *
 * Copy is the action in the person's words. No spinner that could belong to
 * any app; no lockup (that stays on Welcome and Home).
 */

const CENTRES = [15, 50, 85] as const;
const RADIUS = 13;
/** Top-right cell — the dot the GRIDGO mark lights. */
const LIT_CELL = 2;

export type SessionWaitTone = "in" | "out";
export type SessionWaitRole = "client" | "supplier" | "rider";

const TITLE: Record<SessionWaitTone, string> = {
  in: "Signing you in",
  out: "Signing you out",
};

const LINE: Record<SessionWaitRole, Record<SessionWaitTone, string>> = {
  client: {
    in: "Taking your seat.",
    out: "Clearing this phone.",
  },
  supplier: {
    in: "Opening the floor.",
    out: "Closing the floor.",
  },
  rider: {
    in: "Heading out.",
    out: "Off the road.",
  },
};

type Props = {
  tone: SessionWaitTone;
  role: SessionWaitRole;
  /** Cover the whole window (root overlay). Default fills the current screen. */
  cover?: boolean;
  size?: number;
};

export function SessionWait({ tone, role, cover = false, size = 120 }: Props) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion() === true;
  const title = TITLE[tone];
  const line = LINE[role][tone];

  return (
    <View
      style={[
        cover ? StyleSheet.absoluteFill : { flex: 1 },
        {
          backgroundColor: colors.canvas,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 32,
          zIndex: cover ? 50 : undefined,
        },
      ]}
      pointerEvents="auto"
      accessibilityRole="progressbar"
      accessibilityLabel={`${title}. ${line}`}
    >
      <View className="items-center gap-8">
        <GridPulse tone={tone} size={size} reducedMotion={reducedMotion} />
        <View className="items-center gap-2">
          <Text className="text-center text-h2 font-bold text-text-primary">{title}</Text>
          <Text className="text-center text-body-lg text-text-secondary">{line}</Text>
        </View>
      </View>
    </View>
  );
}

function cellCentre(index: number, size: number): { x: number; y: number } {
  return {
    x: (CENTRES[index % 3] / 100) * size,
    y: (CENTRES[Math.floor(index / 3)] / 100) * size,
  };
}

function GridPulse({
  tone,
  size,
  reducedMotion,
}: {
  tone: SessionWaitTone;
  size: number;
  reducedMotion: boolean;
}) {
  const colors = useThemeColors();
  const radius = (RADIUS / 100) * size;
  const lit = cellCentre(LIT_CELL, size);
  const progress = useSharedValue(tone === "in" ? 0 : 1);

  useEffect(() => {
    if (reducedMotion) {
      progress.value = tone === "in" ? 1 : 0.35;
      return;
    }
    if (tone === "in") {
      progress.value = withSequence(
        withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }),
        withRepeat(
          withSequence(
            withTiming(0.72, { duration: 900, easing: Easing.inOut(Easing.quad) }),
            withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          ),
          -1,
          false,
        ),
      );
      return;
    }
    progress.value = withTiming(0, { duration: 720, easing: Easing.in(Easing.cubic) });
  }, [progress, reducedMotion, tone]);

  const token = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.35 + progress.value * 0.65 }],
  }));

  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden>
      {Array.from({ length: 9 }, (_, cell) => {
        const centre = cellCentre(cell, size);
        const isLit = cell === LIT_CELL;
        return (
          <View
            key={cell}
            style={{
              position: "absolute",
              left: centre.x - radius,
              top: centre.y - radius,
              width: radius * 2,
              height: radius * 2,
              borderRadius: radius,
              backgroundColor: isLit ? "transparent" : colors.outline,
            }}
          />
        );
      })}
      <Animated.View
        style={[
          {
            position: "absolute",
            left: lit.x - radius,
            top: lit.y - radius,
            width: radius * 2,
            height: radius * 2,
            borderRadius: radius,
            backgroundColor: colors.brandLogo,
          },
          token,
        ]}
      />
    </View>
  );
}


