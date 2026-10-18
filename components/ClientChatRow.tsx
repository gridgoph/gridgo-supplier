import { ChevronRight, MessagesSquare } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { CLIENT_CHAT_NOTICE, clientChatEntry, type ClientChatSummary } from "@/lib/clientChat";
import { useAlertsStore } from "@/store/alerts";

/**
 * The way into the conversation with the client. Charcoal, never yellow: the
 * job's own next step keeps the screen's one yellow button. "New" comes from
 * the shop's unread notices about it, because the job carries no count.
 */
export function ClientChatRow({
  orderId,
  chat,
  onPress,
}: {
  orderId: string;
  chat: ClientChatSummary;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const unread = useAlertsStore((state) =>
    (state.inbox ?? []).some(
      (row) => row.type === CLIENT_CHAT_NOTICE && row.orderId === orderId && state.unreadIds.includes(row.id),
    ),
  );
  const entry = clientChatEntry(chat, unread);
  const open = chat.status === "open";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={entry.accessibilityLabel}
      accessibilityHint={entry.detail}
      testID="client-chat-row"
      className="gg-touch flex-row items-center gap-3 py-2"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-pill"
        style={{ backgroundColor: open ? colors.accent : colors.surfaceVariant }}
      >
        <MessagesSquare size={18} color={open ? colors.accentOn : colors.textSecondary} strokeWidth={2} aria-hidden />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
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
