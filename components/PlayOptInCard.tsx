import { useEffect } from "react";
import { ChevronRight, Rocket, X } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { PLAY_OPTIN_COPY } from "@/lib/playOptIn";

/**
 * Home's ask to become a Google Play tester, for an Android shop on the APK
 * that GRIDGO says to ask (`lib/playOptIn.ts`). One row in the tester card's
 * place and shape: the rocket, two short lines, the cross. No yellow — Home's
 * one yellow is the "+"; the flow screen carries the steps' yellow instead.
 *
 * `onShown` fires once the card is actually drawn.
 */
export function PlayOptInCard({
  onOpen,
  onDismiss,
  onShown,
}: {
  onOpen: () => void;
  onDismiss: () => void;
  onShown: () => void;
}) {
  const colors = useThemeColors();
  useEffect(() => {
    onShown();
    // Once per mount; the store sends it once per app session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View className="gg-card-flush flex-row items-center">
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={PLAY_OPTIN_COPY}
        className="min-w-0 flex-1 flex-row items-center gap-3 py-3 pl-4"
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        <View className="items-center justify-center rounded-pill bg-surface-variant" style={{ width: 36, height: 36 }}>
          <Rocket size={18} color={colors.textPrimary} strokeWidth={2} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-body font-bold text-text-primary" numberOfLines={1}>
            Help us launch GRIDGO on Play
          </Text>
          <Text className="text-caption text-text-secondary" numberOfLines={1}>
            Become a tester
          </Text>
        </View>
        <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
      </Pressable>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Not now"
        className="gg-touch items-center justify-center"
        style={({ pressed }) => ({ width: 44, height: 44, marginRight: 4, opacity: pressed ? 0.6 : 1 })}
      >
        <X size={18} color={colors.textMuted} strokeWidth={2} />
      </Pressable>
    </View>
  );
}
