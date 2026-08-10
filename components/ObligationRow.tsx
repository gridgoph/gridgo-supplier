import { ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { formatPhp } from "@/lib/api";
import type { Obligation } from "@/lib/homeBoard";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  obligation: Obligation;
  onPress: () => void;
};

/**
 * One thing the shop owes today, under the one it owes most.
 *
 * Compact on purpose: the first obligation gets a card and the screen's yellow
 * action, and these are the rest of the queue. A row still names the job, what
 * is owed, and — where the thing owed is a photograph that releases money —
 * exactly how much is waiting on it, because that is the fact that gets it
 * taken.
 */
export function ObligationRow({ obligation, onPress }: Props) {
  const colors = useThemeColors();
  const late = obligation.urgency === "overdue";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${obligation.actionLabel} — ${obligation.title}`}
      className="gg-touch flex-row items-center gap-3 rounded-card border border-outline bg-surface px-4 py-3"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body font-medium text-text-primary" numberOfLines={1}>
          {obligation.title}
        </Text>
        <Text
          className={late ? "text-caption text-error" : "text-caption text-text-muted"}
          numberOfLines={2}
        >
          {obligation.kind === "proof" && obligation.amountMinor != null
            ? `${formatPhp(obligation.amountMinor)} waits on this photo`
            : obligation.detail}
        </Text>
      </View>
      <Text className="text-caption text-text-secondary">{obligation.actionLabel}</Text>
      <ChevronRight size={18} color={colors.textMuted} accessibilityElementsHidden />
    </Pressable>
  );
}
