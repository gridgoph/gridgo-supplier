import { Zap } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { EXPRESS_LABEL } from "@/lib/express";

/**
 * The one Express tag, on jobs placed under Express.
 *
 * A tag, not a status: it says how the deadline was promised, so it keeps the
 * neutral outline instead of a status colour and carries its meaning in the
 * bolt and the word. The bolt takes the info colour so the tag is findable on
 * a busy list without borrowing the yellow that belongs to the screen's one
 * action. It sits on its own line, apart from the status chips.
 */
export function ExpressChip() {
  const colors = useThemeColors();
  return (
    <View className="gg-chip" accessibilityRole="text">
      <Zap size={13} color={colors.info} strokeWidth={2} />
      <Text className="text-caption text-text-primary">{EXPRESS_LABEL}</Text>
    </View>
  );
}
