import { BadgeCheck } from "lucide-react-native";
import { Text, View } from "react-native";
import { Pressable } from "@/components/Pressable";
import { router, type Href } from "expo-router";

import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import type { VerifyNotice } from "@/lib/shopVerification";

/**
 * The short verification note on To do and Money (`lib/shopVerification.ts`
 * writes the words). Never yellow: on To do the yellow belongs to the day's
 * work, and on Money nothing here is the screen's main action. The button is
 * charcoal, the countdown chip appears only in the last seven days, and a
 * pause is the only thing drawn in the warning tone.
 */
export function VerifyNoticeCard({ notice, testID }: { notice: VerifyNotice; testID?: string }) {
  const colors = useThemeColors();
  const paused = notice.tone === "warning";

  return (
    <View
      className={paused ? "gg-card gap-3 border-warning" : "gg-card gap-3"}
      testID={testID}
      accessibilityRole="summary"
    >
      <View className="flex-row items-start gap-3">
        <View className="pt-0.5">
          <BadgeCheck size={20} color={paused ? colors.warning : colors.success} strokeWidth={2} aria-hidden />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-body font-bold text-text-primary">{notice.title}</Text>
          <Text className="text-body text-text-secondary">{notice.body}</Text>
        </View>
      </View>
      {paused || notice.chip || notice.action ? (
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <View className="flex-row">
            {paused ? (
              <StatusChip tone="warning" icon="circle-pause" label="New orders paused" />
            ) : notice.chip ? (
              <StatusChip tone="neutral" icon="clock" label={notice.chip} />
            ) : null}
          </View>
          {notice.action ? (
            <Pressable
              onPress={() => router.push("/verify" as Href)}
              accessibilityRole="button"
              className="gg-touch flex-row items-center rounded-pill bg-accent px-4"
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
              testID={testID ? `${testID}-action` : undefined}
            >
              <Text className="text-button text-accent-on">{notice.action}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
