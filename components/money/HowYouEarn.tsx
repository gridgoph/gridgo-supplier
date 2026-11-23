import { Text, View } from "react-native";

import { howYouEarnLines, type ShopMoneySchedule } from "@/lib/shopMoney";

/**
 * Three lines on how a shop earns and when GRIDGO pays it, in sign-up and on
 * Money. The words come from GRIDGO's schedule; without one nothing is drawn,
 * so no shop is told about daily payouts GRIDGO is not running.
 */
export function HowYouEarn({ schedule }: { schedule: ShopMoneySchedule | null }) {
  const lines = howYouEarnLines(schedule);
  if (!lines) return null;
  return (
    <View className="gg-panel gap-2" testID="how-you-earn">
      <Text className="text-body font-medium text-text-primary">How you earn</Text>
      {lines.map((line) => (
        <View key={line} className="flex-row gap-2">
          <Text className="text-body text-text-muted" aria-hidden>
            •
          </Text>
          <Text className="min-w-0 flex-1 text-body text-text-secondary">{line}</Text>
        </View>
      ))}
    </View>
  );
}
