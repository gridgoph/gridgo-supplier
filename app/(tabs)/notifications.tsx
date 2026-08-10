import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { AlertCard } from "@/components/AlertCard";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionHeader } from "@/components/SectionHeader";
import { SkeletonList } from "@/components/Skeleton";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { localOnlyCaveat } from "@/lib/alertsApi";
import { stageForAlert } from "@/lib/alertStages";
import { isAlertUnread, useAlertsStore, visibleAlerts } from "@/store/alerts";
import { askConfirm } from "@/store/sheets";
import { useViewing } from "@/store/toasts";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * Assignment offers, production notices and payout news.
 *
 * Each alert carries the stage of the job it is about, read off the live job
 * rather than the alert — an alert is a snapshot and the work has usually moved
 * on.
 *
 * Clearing and deleting both go to GRIDGO first; see `lib/alertsApi` for what
 * happens when a route is not deployed yet, and for the cleanup that is owed
 * once they all are.
 */
export default function NotificationsScreen() {
  const colors = useThemeColors();
  const dismissed = useAlertsStore((s) => s.dismissed);
  const deleted = useAlertsStore((s) => s.deleted);
  const localOnly = useAlertsStore((s) => s.localOnly);
  const markRead = useAlertsStore((s) => s.markRead);
  const markManyRead = useAlertsStore((s) => s.markManyRead);
  const removeAlert = useAlertsStore((s) => s.remove);
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
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      // The jobs are what place each alert on a stage. A failure there costs
      // the track, not the list, so the alerts still arrive without it.
      const [list, jobList] = await Promise.all([
        api.listNotifications(),
        api.listJobs().catch(() => [] as api.Order[]),
      ]);
      const state = useAlertsStore.getState();
      const live = visibleAlerts(list, state.deleted);
      setItems(list);
      setJobs(jobList);
      setNewAtLoad(live.filter((a) => isAlertUnread(a, state.dismissed)).map((a) => a.id));
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

  /*
    Every alert is already on this screen, so nothing arriving needs a toast
    over the top of it. The list picks new ones up on its next load.
  */
  useFocusEffect(
    useCallback(() => {
      useViewing.getState().setOnAlerts(true);
      return () => useViewing.getState().setOnAlerts(false);
    }, []),
  );

  const shown = useMemo(() => visibleAlerts(items, deleted), [items, deleted]);

  const { unread, read } = useMemo(
    () => ({
      unread: shown.filter((alert) => newAtLoad.includes(alert.id)),
      read: shown.filter((alert) => !newAtLoad.includes(alert.id)),
    }),
    [shown, newAtLoad],
  );

  /**
   * The ids "Mark all read" is allowed to touch.
   *
   * Exactly what is on screen and still unread — never everything the platform
   * holds. An alert that arrives between the tap and the request is one the
   * shop has never been shown, and marking it read would hide it for good.
   */
  const markableIds = useMemo(
    () => unread.filter((alert) => isAlertUnread(alert, dismissed)).map((alert) => alert.id),
    [unread, dismissed],
  );

  const { refreshing, onRefresh } = usePullToRefresh(reload);
  const firstLoad = loading && !loaded;

  async function markAll() {
    setActionError(null);
    const outcome = await markManyRead(markableIds);
    if (outcome.status === "failed") setActionError(outcome.message);
  }

  /**
   * Deleting asks first.
   *
   * There is no undo to offer: once the platform's delete route is live the
   * record is gone, and an "Undo" that could not restore it would be a lie. So
   * the mis-swipe is caught before anything happens, which is what the sheet is
   * for everywhere else in this app.
   */
  async function confirmDelete(alert: api.Notification) {
    const confirmed = await askConfirm({
      question: `Delete “${alert.title}”?`,
      consequence:
        "It goes for good, and GRIDGO will not send it again. The job it is about is not affected — you can still open it from Jobs.",
      confirmLabel: "Delete alert",
      cancelLabel: "Keep it",
      destructive: true,
    });
    if (!confirmed) return;
    setActionError(null);
    const outcome = await removeAlert(alert.id);
    if (outcome.status === "failed") setActionError(outcome.message);
  }

  async function clearOne(alert: api.Notification) {
    setActionError(null);
    const outcome = await markRead(alert.id);
    if (outcome.status === "failed") setActionError(outcome.message);
  }

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
        onMarkRead={() => void clearOne(alert)}
        onDelete={() => void confirmDelete(alert)}
        onOpen={
          job
            ? () => router.push({ pathname: "/job/[id]", params: { id: job.id } })
            : undefined
        }
      />
    );
  };

  const caveat = localOnlyCaveat(localOnly || dismissed.length > 0 || deleted.length > 0);

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

        {actionError ? (
          <View className="mb-6">
            <ErrorNotice message={actionError} />
          </View>
        ) : null}

        {loaded && !error && !shown.length ? (
          <EmptyState
            title="Nothing to catch up on"
            body="New work, production news and payout notices land here. Your jobs are the place to act on them."
            actionLabel="Open jobs"
            onAction={() => router.push("/(tabs)/jobs")}
          />
        ) : null}

        {unread.length ? (
          <View className="gap-3">
            <SectionHeader
              title="NEW"
              count={unread.length}
              hint="Swipe a card for Read and Delete, or tap it to open the job."
              right={
                markableIds.length > 1 ? (
                  <Pressable
                    onPress={() => void markAll()}
                    accessibilityRole="button"
                    accessibilityLabel={`Mark these ${markableIds.length} alerts read`}
                    className="gg-touch justify-center"
                    style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
                  >
                    <Text className="text-button text-text-primary">Mark all read</Text>
                  </Pressable>
                ) : null
              }
            />
            {unread.map(renderAlert)}
          </View>
        ) : null}

        {read.length ? (
          <View className={unread.length ? "mt-8 gap-3" : "gap-3"}>
            <SectionHeader title="EARLIER" count={read.length} />
            {read.map(renderAlert)}
          </View>
        ) : null}

        {loaded && shown.length > 0 && caveat ? (
          <Text className="mt-6 text-caption text-text-muted">{caveat}</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
