import { MessageSquareHeart, X } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

/**
 * The Play feedback ask, in the tester card's place for a while.
 *
 * Optional and unrewarded: the card opens the store listing as a link and
 * closes with the cross. It never starts Google's in-app review — Google
 * forbids that from a tap.
 */
export function TesterFeedbackCard({ onOpen, onDismiss }: { onOpen: () => void; onDismiss: () => void }) {
  const colors = useThemeColors();
  return (
    <View className="gg-card-flush flex-row items-center">
      <Pressable
        onPress={onOpen}
        accessibilityRole="link"
        accessibilityLabel="Help us launch. Leave feedback on Google Play"
        className="min-w-0 flex-1 flex-row items-center gap-3 py-3 pl-4"
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        <View className="items-center justify-center rounded-pill bg-surface-variant" style={{ width: 36, height: 36 }}>
          <MessageSquareHeart size={18} color={colors.textPrimary} strokeWidth={2} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-body font-bold text-text-primary">Help us launch</Text>
          <Text className="text-caption text-text-secondary" numberOfLines={1}>
            Leave feedback on Google Play
          </Text>
        </View>
      </Pressable>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss the feedback request"
        className="gg-touch items-center justify-center"
        style={({ pressed }) => ({ width: 44, height: 44, marginRight: 4, opacity: pressed ? 0.6 : 1 })}
      >
        <X size={18} color={colors.textMuted} strokeWidth={2} />
      </Pressable>
    </View>
  );
}
