import { Phone } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { pickupCallEntry } from "@/lib/orderCall";

/**
 * The way to call the rider collecting this job, under the Message row and
 * drawn the same way: charcoal, never yellow, because the job's own next step
 * keeps the screen's one yellow button. A build without the calling module
 * (Expo Go) still draws the row, quieter, and says where the app that can
 * call is.
 */
export function PickupCallRow({
  riderFirstName,
  supported,
  onPress,
}: {
  riderFirstName: string | null;
  supported: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const entry = pickupCallEntry(riderFirstName, supported);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={entry.accessibilityLabel}
      accessibilityHint={entry.detail}
      testID="pickup-call-row"
      className="gg-touch flex-row items-center gap-3 py-2"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-pill"
        style={{ backgroundColor: supported ? colors.accent : colors.surfaceVariant }}
      >
        <Phone size={18} color={supported ? colors.accentOn : colors.textSecondary} strokeWidth={2} aria-hidden />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body font-medium text-text-primary">{entry.title}</Text>
        <Text className="text-caption text-text-muted">{entry.detail}</Text>
      </View>
    </Pressable>
  );
}
