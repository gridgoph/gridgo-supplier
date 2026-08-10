import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionHeader } from "@/components/SectionHeader";
import { SkeletonList } from "@/components/Skeleton";
import { formatTimelineAt } from "@/lib/dates";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { useAlertsStore } from "@/store/alerts";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * Assignment offers, SLA warnings and payout notices.
 *
 * Unread ones lead and sit on a lifted surface; everything read stays quiet
 * underneath, so a shop can see what is new without reading the whole list.
 */
export default function NotificationsScreen() {
  const colors = useThemeColors();
  const setUnreadCount = useAlertsStore((s) => s.setUnreadCount);
  const [items, setItems] = useState<api.Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listNotifications();
      setItems(list);
      setUnreadCount(list.filter((n) => !n.read).length);
      setError(null);
      setLoaded(true);
    } catch (e) {
      setError(humanizeApiError(e, offlineMessage("load your alerts")));
    } finally {
      setLoading(false);
    }
  }, [setUnreadCount]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const unread = items.filter((n) => !n.read);
  const read = items.filter((n) => n.read);
  const { refreshing, onRefresh } = usePullToRefresh(reload);
  const firstLoad = loading && !loaded;

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-10"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textMuted}
          />
        }
      >
        <ScreenHeader
          title="Alerts"
          subtitle="Assignments, SLA risk, and payout notices"
        />

        {firstLoad ? (
          <SkeletonList label="Loading your alerts" count={3} compact sectioned />
        ) : null}

        {error && !loaded ? (
          <EmptyState
            title="Alerts are not reachable"
            body={error}
            actionLabel="Try again"
            onAction={() => void reload()}
          />
        ) : error ? (
          <View className="mb-6">
            <ErrorNotice message={error} onRetry={() => void reload()} />
          </View>
        ) : null}

        {loaded && !error && !items.length ? (
          <EmptyState
            title="Nothing to catch up on"
            body="New assignment offers, SLA warnings and payout notices land here. Your jobs are the place to act on them."
            actionLabel="Open jobs"
            onAction={() => router.push("/(tabs)/jobs")}
          />
        ) : null}

        {unread.length ? (
          <View className="gap-3">
            <SectionHeader title="NEW" count={unread.length} />
            {unread.map((item) => (
              <AlertCard key={item.id} item={item} unread />
            ))}
          </View>
        ) : null}

        {read.length ? (
          <View className={unread.length ? "mt-8 gap-3" : "gap-3"}>
            <SectionHeader title="EARLIER" count={read.length} />
            {read.map((item) => (
              <AlertCard key={item.id} item={item} />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function AlertCard({ item, unread }: { item: api.Notification; unread?: boolean }) {
  return (
    <View
      className={
        unread
          ? "gap-1 rounded-card border border-outline bg-surface-high p-4"
          : "gg-card gap-1"
      }
      accessibilityLabel={`${unread ? "Unread. " : ""}${item.title}. ${item.body}`}
    >
      <View className="flex-row items-start justify-between gap-3">
        <Text
          className={
            unread
              ? "min-w-0 flex-1 text-body-lg font-medium text-text-primary"
              : "min-w-0 flex-1 text-body font-medium text-text-secondary"
          }
        >
          {item.title}
        </Text>
        {unread ? (
          <View
            className="mt-1.5 h-2 w-2 rounded-pill bg-brand"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        ) : null}
      </View>
      <Text className={unread ? "text-body text-text-secondary" : "text-body text-text-muted"}>
        {item.body}
      </Text>
      <Text className="mt-1 text-caption text-text-muted">{formatTimelineAt(item.at)}</Text>
    </View>
  );
}
