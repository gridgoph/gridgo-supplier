import { Text, View } from "react-native";
import { Pressable } from "@/components/Pressable";
import { router } from "expo-router";

import { StatusChip } from "@/components/StatusChip";
import { formatPhp } from "@/lib/money";
import { waitingReasonLine, type WaitingPayout } from "@/lib/shopVerification";

/**
 * Staged payments waiting on verification (the ledger's `held` entries). The
 * stage itself on the job is not reshaped by GRIDGO, so this list is where a
 * shop learns the money is waiting, not lost. Owner only, like all of Money.
 */
export function WaitingPayoutList({ waiting }: { waiting: WaitingPayout[] }) {
  if (!waiting.length) return null;
  const total = waiting.reduce((sum, item) => sum + item.amountMinor, 0);
  return (
    <View className="gg-card gap-1" testID="waiting-payouts">
      <View className="flex-row items-center justify-between gap-3 pb-1">
        <Text className="text-body font-bold text-text-primary">Waiting to be paid</Text>
        <Text className="text-body font-bold text-text-primary">{formatPhp(total)}</Text>
      </View>
      {waiting.map((item) => (
        <Pressable
          key={item.key}
          disabled={!item.orderId}
          onPress={() => item.orderId && router.push({ pathname: "/job/[id]", params: { id: item.orderId } })}
          accessibilityRole={item.orderId ? "button" : "text"}
          className="gg-touch flex-row items-center gap-3 border-t border-outline-subtle py-2"
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <View className="min-w-0 flex-1 gap-1">
            <View className="flex-row">
              <StatusChip tone="neutral" icon="clock" label="Waiting" />
            </View>
            <Text className="text-caption text-text-secondary">{waitingReasonLine(item.reason)}</Text>
          </View>
          <Text className="text-body font-medium text-text-primary">{formatPhp(item.amountMinor)}</Text>
        </Pressable>
      ))}
    </View>
  );
}
