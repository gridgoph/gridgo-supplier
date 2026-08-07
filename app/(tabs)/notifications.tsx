import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { ScreenHeader } from "@/components/ScreenHeader";
import { formatTimelineAt } from "@/lib/dates";
import * as api from "@/lib/api";
import { useAlertsStore } from "@/store/alerts";
import { useThemeColors } from "@/hooks/useTheme";

export default function NotificationsScreen() {
  const colors = useThemeColors();
  const setUnreadCount = useAlertsStore((s) => s.setUnreadCount);
  const [items, setItems] = useState<api.Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listNotifications();
      setItems(list);
      setUnreadCount(list.filter((n) => !n.read).length);
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : `Cannot load alerts from ${api.getApiBase()}.`,
      );
    } finally {
      setLoading(false);
    }
  }, [setUnreadCount]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return (
    <View className="gg-screen">
      <ScrollView className="flex-1" contentContainerClassName="gg-page pb-10" showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title="Alerts"
          subtitle="Assignments, SLA risk, and payout notices"
        />

        {loading && !items.length ? (
          <View className="items-center py-12">
            <ActivityIndicator color={colors.textMuted} />
            <Text className="mt-3 text-body text-text-muted">Loading alerts…</Text>
          </View>
        ) : null}

        {error ? (
          <EmptyState
            title="Alerts unavailable"
            body={error}
            actionLabel="Try again"
            onAction={() => void reload()}
          />
        ) : null}

        {!loading && !error && !items.length ? (
          <EmptyState
            title="No alerts"
            body="New assignment offers, SLA warnings, and payout notices will show up here."
            actionLabel="Refresh"
            onAction={() => void reload()}
          />
        ) : null}

        <View className="gap-3">
          {items.map((n) => (
            <View
              key={n.id}
              className={
                n.read
                  ? "gg-card gap-1"
                  : "rounded-card border border-outline bg-surface-high p-4 gap-1"
              }
            >
              <View className="flex-row items-start justify-between gap-2">
                <Text
                  className={
                    n.read
                      ? "flex-1 text-body font-medium text-text-primary"
                      : "flex-1 text-body-lg font-medium text-text-primary"
                  }
                >
                  {n.title}
                </Text>
                {!n.read ? (
                  <View className="mt-1 h-2 w-2 rounded-pill bg-brand" accessibilityLabel="Unread" />
                ) : null}
              </View>
              <Text className="text-body text-text-secondary">{n.body}</Text>
              <Text className="text-caption text-text-muted">{formatTimelineAt(n.at)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
