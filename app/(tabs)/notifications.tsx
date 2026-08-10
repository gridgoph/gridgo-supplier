import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { AlertCard } from "@/components/AlertCard";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionHeader } from "@/components/SectionHeader";
import { SkeletonList } from "@/components/Skeleton";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { stageForAlert } from "@/lib/alertStages";
import { isAlertUnread, useAlertsStore } from "@/store/alerts";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * Assignment offers, production notices and payout news.
 *
 * Each alert carries the stage of the job it is about, read off the live job
 * rather than the alert — an alert is a snapshot and the work has usually moved
 * on. Unread ones lead; a swipe or a tap clears one.
 */
export default function NotificationsScreen() {
  const colors = useThemeColors();
  const dismissed = useAlertsStore((s) => s.dismissed);
  const markRead = useAlertsStore((s) => s.markRead);
  const syncFrom = useAlertsStore((s) => s.syncFrom);
  const [items, setItems] = useState<api.Notification[]>([]);
  const [jobs, setJobs] = useState<api.Order[]>([]);
  /**
   * Which alerts were new when this list last loaded.
   *
   * Sections are frozen against this rather than recomputed from the live
   * dismissal set, for two reasons. A card that jumps from New to Earlier the
   * instant your thumb leaves it is disorienting — you lose the thing you were
   * looking at. And moving it between sections changes its parent, which
   * unmounts it mid-swipe: the same class of hang as wrapping only the unread
   * ones in a gesture handler. The card restyles in place and moves on the
   * next load, which is when a person expects a list to reorganise.
   */
  const [newAtLoad, setNewAtLoad] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      // The jobs are what place each alert on a stage. A failure there costs
      // the track, not the list, so the alerts still arrive without it.
      const [list, jobList] = await Promise.all([
        api.listNotifications(),
        api.listJobs().catch(() => [] as api.Order[]),
      ]);
      const seen = useAlertsStore.getState().dismissed;
      setItems(list);
      setJobs(jobList);
      setNewAtLoad(list.filter((a) => isAlertUnread(a, seen)).map((a) => a.id));
      syncFrom(list);
      setError(null);
      setLoaded(true);
    } catch (e) {
      setError(humanizeApiError(e, offlineMessage("load your alerts")));
    } finally {
      setLoading(false);
    }
  }, [syncFrom]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const { unread, read } = useMemo(
    () => ({
      unread: items.filter((alert) => newAtLoad.includes(alert.id)),
      read: items.filter((alert) => !newAtLoad.includes(alert.id)),
    }),
    [items, newAtLoad],
  );

  const { refreshing, onRefresh } = usePullToRefresh(reload);
  const firstLoad = loading && !loaded;

  // Appearance follows the live dismissal set even though position does not,
  // so clearing one is visibly acknowledged where it sits.
  const renderAlert = (alert: api.Notification) => {
    const job = alert.orderId ? jobs.find((candidate) => candidate.id === alert.orderId) : null;
    return (
      <AlertCard
        key={alert.id}
        alert={alert}
        unread={isAlertUnread(alert, dismissed)}
        stageIndex={stageForAlert(alert, jobs)}
        onMarkRead={() => markRead(alert.id)}
        onOpen={
          job
            ? () => router.push({ pathname: "/job/[id]", params: { id: job.id } })
            : undefined
        }
      />
    );
  };

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
          subtitle="New work, production news, and what your jobs have paid"
        />

        {firstLoad ? (
          <SkeletonList label="Loading your alerts" count={3} sectioned />
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
            body="New work, production news and payout notices land here. Your jobs are the place to act on them."
            actionLabel="Open jobs"
            onAction={() => router.push("/(tabs)/jobs")}
          />
        ) : null}

        {unread.length ? (
          <View className="gap-3">
            <SectionHeader title="NEW" count={unread.length} hint="Swipe one aside to clear it." />
            {unread.map(renderAlert)}
          </View>
        ) : null}

        {read.length ? (
          <View className={unread.length ? "mt-8 gap-3" : "gap-3"}>
            <SectionHeader title="EARLIER" count={read.length} />
            {read.map(renderAlert)}
          </View>
        ) : null}

        {loaded && items.length > 0 && !unread.length ? (
          <Text className="mt-6 text-caption text-text-muted">
            Cleared alerts are cleared on this phone. GRIDGO does not carry that across your
            other devices yet.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
