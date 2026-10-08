import { ChevronRight, MessageCircle } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { pickupChatEntry, type PickupChatSummary } from "@/lib/pickupChat";

/**
 * The way into the conversation with the rider collecting this job. Charcoal,
 * never yellow: the job's own next step keeps the screen's one yellow button.
 * New messages are a count in words on a charcoal pill, the same badge the
 * Operations chat button wears.
 */
export function PickupChatRow({ chat, onPress }: { chat: PickupChatSummary; onPress: () => void }) {
  const colors = useThemeColors();
  const entry = pickupChatEntry(chat);
  const open = chat.status === "open";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={entry.accessibilityLabel}
      accessibilityHint={entry.detail}
      testID="pickup-chat-row"
      className="gg-touch flex-row items-center gap-3 py-2"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-pill"
        style={{ backgroundColor: open ? colors.accent : colors.surfaceVariant }}
      >
        <MessageCircle size={18} color={open ? colors.accentOn : colors.textSecondary} strokeWidth={2} aria-hidden />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        {/* The count sits with the name, so large text still leaves the line beneath it room. */}
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-body font-medium text-text-primary">{entry.title}</Text>
          {entry.unread ? (
            <View className="rounded-pill bg-accent px-2 py-0.5">
              <Text className="text-caption font-medium text-accent-on">{entry.unread}</Text>
            </View>
          ) : null}
        </View>
        <Text className="text-caption text-text-muted">{entry.detail}</Text>
      </View>
      <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} aria-hidden />
    </Pressable>
  );
}
