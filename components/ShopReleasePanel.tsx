import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";

import { LATE_PRODUCTION_HREF } from "@/components/LatenessPanel";
import { StatusChip } from "@/components/StatusChip";
import type { ShopRelease } from "@/lib/shopRecovery";

/**
 * A job this shop let go — no answer in time, declined, or cancelled — while
 * the client chooses another shop or a refund.
 *
 * Calm and final. The job is still on the shop's list only because GRIDGO
 * keeps it there until the client answers, so the panel says to leave it, and
 * the one thing the shop can still look at is how it reads on the record.
 */
export function ShopReleasePanel({ release }: { release: ShopRelease }) {
  return (
    <View className="gg-card gap-3" testID="shop-release">
      <View className="flex-row">
        <StatusChip tone={release.chip.tone} label={release.chip.label} icon={release.chip.icon} />
      </View>
      <View className="gap-1">
        <Text className="text-body-lg font-medium text-text-primary">{release.title}</Text>
        <Text className="text-body text-text-secondary">{release.body}</Text>
      </View>
      <Pressable
        onPress={() => router.push(LATE_PRODUCTION_HREF)}
        accessibilityRole="link"
        className="gg-touch justify-center self-start"
      >
        <Text className="text-button text-brand">See it on your shop&apos;s record</Text>
      </Pressable>
    </View>
  );
}
