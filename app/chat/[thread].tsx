import { ChevronLeft } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";
import { SupportChatConversation } from "@/components/SupportChatConversation";
import { useThemeColors } from "@/hooks/useTheme";
import { CHAT_LIST_ROUTE, isChatThreadId } from "@/lib/chatThreads";

/**
 * One Operations conversation from history.
 */
export default function ChatThreadScreen() {
  const { thread: peer } = useLocalSearchParams<{ thread?: string }>();
  const router = useRouter();
  const colors = useThemeColors();

  const exitToChat = () => router.replace(CHAT_LIST_ROUTE);
  const headerEscape = !router.canGoBack() ? (
    <Stack.Screen
      options={{
        headerLeft: () => (
          <Pressable
            onPress={exitToChat}
            accessibilityRole="button"
            accessibilityLabel="Back to chat"
            hitSlop={12}
            className="flex-row items-center gap-1 pr-3"
          >
            <ChevronLeft size={24} color={colors.textPrimary} strokeWidth={2} />
            <Text className="text-body-lg text-text-primary">Chat</Text>
          </Pressable>
        ),
      }}
    />
  ) : null;

  if (!isChatThreadId(peer)) {
    return (
      <Screen edges={["bottom"]}>
        {headerEscape}
        <View className="gg-page pt-6">
          <EmptyState
            title="No such conversation"
            body="Open your chat history to pick one, or start a new chat."
            secondaryLabel="Open chat history"
            onSecondary={exitToChat}
          />
        </View>
      </Screen>
    );
  }

  return (
    <>
      {headerEscape}
      <SupportChatConversation threadId={peer} />
    </>
  );
}
