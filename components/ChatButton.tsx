import { MessageSquare } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";

import { useThemeColors } from "@/hooks/useTheme";
import { useSupportChatStore } from "@/store/supportChat";

export function ChatButton() {
  const colors = useThemeColors();
  const unread = useSupportChatStore((s) => s.unreadCount);
  const showBadge = unread > 0;

  return (
    <Pressable
      onPress={() => router.push("/chat")}
      accessibilityRole="button"
      accessibilityLabel={showBadge ? `Chat, ${unread} unread` : "Chat"}
      className="gg-touch items-center justify-center"
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
    >
      <View className="relative">
        <MessageSquare size={24} strokeWidth={2} color={colors.textPrimary} />
        {showBadge ? (
          <View className="absolute -right-2.5 -top-1 min-h-4 min-w-4 items-center justify-center rounded-pill bg-accent px-1">
            <Text maxFontSizeMultiplier={1} className="text-nav font-medium text-accent-on">
              {unread > 9 ? "9+" : String(unread)}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
