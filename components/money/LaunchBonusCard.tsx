import { Sparkles } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { formatPhp } from "@/lib/money";
import { launchBonusLine, type LaunchBonusSummary } from "@/lib/shopMoney";

/**
 * The launch-week bonus in total: what it has added, how much of the cap is
 * used, and when it ends. The bar is the cap, so a shop sees how close it is
 * without doing arithmetic. Each job's own bonus is on its row below.
 */
export function LaunchBonusCard({ summary, now = new Date() }: { summary: LaunchBonusSummary; now?: Date }) {
  const colors = useThemeColors();
  const used =
    summary.capMinor && summary.capMinor > 0
      ? Math.min(1, summary.totalMinor / summary.capMinor)
      : null;

  return (
    <View className="gg-card gap-3" testID="launch-bonus">
      <View className="flex-row items-start gap-3">
        <View className="pt-0.5">
          <Sparkles size={20} color={colors.success} strokeWidth={2} aria-hidden />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-baseline justify-between gap-3">
            <Text className="min-w-0 flex-1 text-body font-bold text-text-primary">
              Launch bonus
            </Text>
            <Text
              className="text-body-lg font-medium text-success"
              style={{ fontVariant: ["tabular-nums"] }}
              testID="launch-bonus-total"
            >
              +{formatPhp(summary.totalMinor)}
            </Text>
          </View>
          <Text className="text-body text-text-secondary" testID="launch-bonus-line">
            {launchBonusLine(summary, now)}
          </Text>
        </View>
      </View>
      {used != null && summary.capMinor != null ? (
        <View
          className="gap-1"
          accessible
          accessibilityLabel={`${formatPhp(summary.totalMinor)} of the ${formatPhp(summary.capMinor)} cap used`}
        >
          <View className="h-2 overflow-hidden rounded-pill bg-surface-variant">
            <View className="h-2 rounded-pill bg-success" style={{ width: `${used * 100}%` }} />
          </View>
          <Text className="text-caption text-text-muted">
            {formatPhp(summary.totalMinor)} of {formatPhp(summary.capMinor)} ·{" "}
            {summary.jobCount === 1 ? "1 job" : `${summary.jobCount} jobs`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
