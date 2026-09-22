import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Plus } from "lucide-react-native";

import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { chatThreadRoute } from "@/lib/chatThreads";
import { formatTimelineAt } from "@/lib/dates";
import { openSupportChatStream } from "@/lib/supportChatStream";
import { useSupportChatStore } from "@/store/supportChat";

/**
 * History of this shop's conversations with Operations, plus New chat.
 * The composer lives on the thread — this screen is how you find one.
 */
export default function ChatHistoryScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const setUnreadCount = useSupportChatStore((s) => s.setUnreadCount);
  const [threads, setThreads] = useState<api.SupportChatThread[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const me = await api.getSupportChatMe();
      const rows = me.threads ?? (me.thread ? [me.thread] : []);
      setThreads(rows);
      setUnreadCount(
        me.unreadCount ?? rows.reduce((sum, row) => sum + (row.unreadCount || 0), 0),
      );
    } catch (err) {
      setThreads(null);
      setError(humanizeApiError(err, offlineMessage("open Operations")));
    } finally {
      setLoading(false);
    }
  }, [setUnreadCount]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const stream = openSupportChatStream({
        onEvent: () => {
          void load();
        },
      });
      return () => stream.close();
    }, [load]),
  );

  const openNew = useCallback(async () => {
    if (opening) return;
    setOpening(true);
    try {
      const opened = await api.openSupportChatThread();
      router.push(chatThreadRoute(opened.thread.id));
    } catch (err) {
      setError(humanizeApiError(err, offlineMessage("start a new chat")));
    } finally {
      setOpening(false);
    }
  }, [opening, router]);

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="gg-page gap-4 pb-6 pt-4">
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-h2 text-text-primary">Operations</Text>
              <Text className="text-body text-text-secondary">Your conversations</Text>
            </View>
            <Pressable
              onPress={() => void openNew()}
              disabled={opening}
              accessibilityRole="button"
              accessibilityLabel="New chat"
              accessibilityState={{ disabled: opening }}
              className="gg-touch flex-row items-center gap-1.5 rounded-field border border-outline bg-surface px-3"
              style={{ opacity: opening ? 0.38 : 1 }}
            >
              <Plus size={16} color={colors.textPrimary} strokeWidth={2} />
              <Text className="text-button text-text-primary">New chat</Text>
            </Pressable>
          </View>

          {error && !threads ? (
            <ErrorNotice
              message={error}
              onRetry={() => {
                setLoading(true);
                void load();
              }}
            />
          ) : loading && !threads ? (
            <Text className="text-body text-text-muted">Loading conversations…</Text>
          ) : !threads?.length ? (
            <EmptyState
              title="No conversations yet"
              body="Start a chat with Operations. It stays here so you can come back to it."
              secondaryLabel="New chat"
              onSecondary={() => void openNew()}
            />
          ) : (
            <View className="gap-2">
              {threads.map((thread) => {
                const preview = thread.lastMessagePreview?.trim() || "No messages yet";
                const when = thread.lastMessageAt ? formatTimelineAt(thread.lastMessageAt) : "";
                return (
                  <Pressable
                    key={thread.id}
                    onPress={() => router.push(chatThreadRoute(thread.id))}
                    accessibilityRole="button"
                    accessibilityLabel={`Operations, ${preview}`}
                    className="gg-panel gap-1 px-4 py-3"
                  >
                    <View className="flex-row items-center justify-between gap-3">
                      <Text className="text-body-lg font-medium text-text-primary" numberOfLines={1}>
                        Operations
                      </Text>
                      {when ? (
                        <Text className="text-caption text-text-muted">{when}</Text>
                      ) : null}
                    </View>
                    <View className="flex-row items-center justify-between gap-3">
                      <Text className="min-w-0 flex-1 text-body text-text-secondary" numberOfLines={2}>
                        {preview}
                      </Text>
                      {thread.unreadCount > 0 ? (
                        <Text className="text-caption text-text-primary">{thread.unreadCount}</Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
              {error ? <SecondaryButton label="Try again" onPress={() => void load()} /> : null}
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
