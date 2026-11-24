import { Text } from "react-native";
import { Pressable } from "@/components/Pressable";
import { ChevronRight } from "lucide-react-native";

import { useThemeColors } from "@/hooks/useTheme";

/** A quiet door to another page: All jobs, Schedule. */
export function LinkPill({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="gg-touch flex-row items-center gap-1 rounded-pill border border-outline bg-surface px-4"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      testID={testID}
    >
      <Text className="text-body font-medium text-text-primary">{label}</Text>
      <ChevronRight size={16} color={colors.textMuted} aria-hidden />
    </Pressable>
  );
}
