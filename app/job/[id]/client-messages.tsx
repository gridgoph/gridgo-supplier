import { ChevronLeft } from "lucide-react-native";
import { Pressable, Text } from "react-native";
import { useCallback } from "react";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { ClientChatConversation } from "@/components/ClientChatConversation";
import { useThemeColors } from "@/hooks/useTheme";
import { useViewing } from "@/store/toasts";

/**
 * Messages with the client about one job, through GRIDGO (gridgo-client#246).
 * Opened from the job or a `client_shop_chat_message` notice;
 * `lib/clientChat.ts` holds the rules and the words.
 */
export default function ClientChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useThemeColors();

  // A message about this job is already on screen; it must not toast over it.
  useFocusEffect(
    useCallback(() => {
      useViewing.getState().setOrder(id ?? null);
      return () => useViewing.getState().setOrder(null);
    }, [id]),
  );

  const openJob = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: "/job/[id]", params: { id } });
  };

  // Reached from a notification with nothing behind it to go back to.
  const headerEscape = !router.canGoBack() ? (
    <Stack.Screen
      options={{
        headerLeft: () => (
          <Pressable
            onPress={openJob}
            accessibilityRole="button"
            accessibilityLabel="Back to the job"
            hitSlop={12}
            className="flex-row items-center gap-1 pr-3"
          >
            <ChevronLeft size={24} color={colors.textPrimary} strokeWidth={2} />
            <Text className="text-body-lg text-text-primary">Job</Text>
          </Pressable>
        ),
      }}
    />
  ) : null;

  return (
    <>
      {headerEscape}
      <ClientChatConversation orderId={id} onOpenJob={openJob} />
    </>
  );
}
