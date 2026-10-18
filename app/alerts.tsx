import { useReadVersion } from "@/hooks/useReadVersion";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { router, useFocusEffect, useNavigation } from "expo-router";

import { AlertCard } from "@/components/AlertCard";
import { AppUpdateNotices } from "@/components/AppUpdateNotices";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { PushEnableCard } from "@/components/PushEnableCard";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SectionHeader } from "@/components/SectionHeader";
import { SkeletonList } from "@/components/Skeleton";
import { spacing, touchTarget, typography } from "@/constants/theme";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { localOnlyCaveat } from "@/lib/alertsApi";
import { CHAT_LIST_ROUTE, chatThreadRoute, isChatThreadId } from "@/lib/chatThreads";
import { listingAlertHref } from "@/lib/listingReview";
import { PICKUP_ISSUE_ALERT, presentAlertTitle, stageForAlert } from "@/lib/alertStages";
import { PICKUP_CHAT_NOTICE, pickupChatHref } from "@/lib/pickupChat";
import { CLIENT_CHAT_NOTICE, clientChatHref } from "@/lib/clientChat";
import { jobScreenHref } from "@/lib/productionNudge";
import { isLapseAlert } from "@/lib/productionLapse";
import { SUPPORT_MESSAGE_PUSH_TYPE } from "@/lib/push";
import { installChannel } from "@/lib/buildDistribution";
import { openRelease, releaseNoticeOpen } from "@/lib/releasePush";
import { isRefundAlert } from "@/lib/refund";
import { SHOP_HOURS_NOTICE, SHOP_HOURS_ROUTE } from "@/lib/shopHours";
import { isAlertUnread, useAlertsStore, visibleAlerts } from "@/store/alerts";
import { askConfirm } from "@/store/sheets";
import { useViewing } from "@/store/toasts";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * Assignment offers, production notices and payout news.
 *
 * Pushed from the bell in every masthead rather than standing in the tab bar.
 * An inbox is something a shop glances at while it works — it is not one of the
 * five places it lives — so it opens over whatever the shop was doing and the
 * back chevron puts it straight back there. The platform's header owns the
 * title; nothing here draws a second one, and there is no bell on this screen
 * because the shop is already standing in it.
 *
 * Each alert carries the stage of the job it is about, read off the live job
 * rather than the alert — an alert is a snapshot and the work has usually moved
 * on.
 *
 * Clearing and deleting both go to GRIDGO first; see `lib/alertsApi` for what
 * happens when a route is not deployed yet, and for the cleanup that is owed
 * once they all are. "Clear notifications" is the same delete, for every
 * alert on screen — the client's bulk action lives after the list; this
 * screen also puts it in the header because the title row is free.
 *
 * The screen is pushed, so every visit mounts it afresh. It opens on the inbox
 * the store last read (`inbox`) and refreshes underneath; the skeleton is only
 * for a shop whose inbox has never been read. The list is a `FlatList` because
 * each card carries its own swipe handler: drawing a hundred of them in one go
 * held the screen for seconds on a phone, so only the first screenful is drawn
 * on arrival.
 */
export default function NotificationsScreen() {
  const colors = useThemeColors();
  const navigation = useNavigation();
  const dismissed = useAlertsStore((s) => s.dismissed);
  const deleted = useAlertsStore((s) => s.deleted);
  const localOnly = useAlertsStore((s) => s.localOnly);
  const markRead = useAlertsStore((s) => s.markRead);
  const markManyRead = useAlertsStore((s) => s.markManyRead);
  const removeAlert = useAlertsStore((s) => s.remove);
  const removeMany = useAlertsStore((s) => s.removeMany);
  const refreshAlerts = useAlertsStore((s) => s.refresh);
  /**
   * Which alerts were new when this list last loaded.
   *
   * Sections are frozen against this rather than recomputed from the live
   * dismissal set, for two reasons. A card that jumps from New to Earlier the
   * instant your thumb leaves it is disorienting — you lose the thing you were
   * looking at. And moving it between sections changes its parent, which
   * unmounts it mid-swipe: the same class of hang as wrapping only the unread
   * ones in a gesture handler. The card restyles in place and moves on the
   * next focus or pull-to-refresh load. Silent live refreshes preserve existing
   * section membership so they cannot interrupt another swipe.
   */
  const [{ items, newAtLoad }, setInbox] = useState<{ items: api.Notification[]; newAtLoad: string[] }>(() => {
    const { inbox, dismissed: cleared, deleted: gone } = useAlertsStore.getState();
    const cached = inbox ?? [];
    return {
      items: cached,
      newAtLoad: visibleAlerts(cached, gone).filter((alert) => isAlertUnread(alert, cleared)).map((alert) => alert.id),
    };
  });
  const [jobs, setJobs] = useState<api.Order[]>(() => useAlertsStore.getState().inboxJobs ?? []);
  const [loaded, setLoaded] = useState(() => useAlertsStore.getState().inbox !== null);
  const [loading, setLoading] = useState(true);
  // A cached inbox already set the sections, so the read that follows it keeps them.
  const seeded = useRef(loaded);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const nextRead = useReadVersion();
  const reload = useCallback(async (silent = false) => {
    const current = nextRead();
    setLoading(true);
    // The jobs are what place each alert on a stage. They never hold the list
    // back, and a failure there costs the track, not the list.
    void api.listJobs().then((jobList) => {
      if (!current()) return;
      setJobs(jobList);
      useAlertsStore.getState().rememberInboxJobs(jobList);
    }, () => {});
    try {
      const list = await refreshAlerts();
      if (!current()) return;
      const state = useAlertsStore.getState();
      const live = visibleAlerts(list, state.deleted);
      setInbox((previous) => {
        const existing = new Set(previous.items.map((item) => item.id));
        return {
          items: list,
          newAtLoad: live.filter((alert) =>
            silent && existing.has(alert.id)
              ? previous.newAtLoad.includes(alert.id)
              : isAlertUnread(alert, state.dismissed),
          ).map((alert) => alert.id),
        };
      });
      setError(null);
      setLoaded(true);
    } catch (e) {
      if (!current()) return;
      setError(humanizeApiError(e, offlineMessage("load your alerts")));
    } finally {
      if (current())
      setLoading(false);
    }
  }, [nextRead, refreshAlerts]);

  useLiveRefresh(["notifications", "orders", "jobs"], () => reload(true));

  useFocusEffect(
    useCallback(() => {
      const silent = seeded.current;
      seeded.current = false;
      void reload(silent);
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
  const clearableIds = useMemo(() => shown.map((alert) => alert.id), [shown]);

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
      question: `Delete “${presentAlertTitle(alert)}”?`,
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

  /**
   * Empty the inbox that is on screen.
   *
   * Same confirmation as a single swipe-delete, because the platform's delete
   * is permanent and there is no undo. Only the ids already drawn — an alert
   * that arrives while the sheet is open is one the shop has never been shown.
   */
  const confirmClearAll = useCallback(async () => {
    if (!clearableIds.length) return;
    const confirmed = await askConfirm({
      question: "Clear all notifications?",
      consequence:
        "They go for good, and GRIDGO will not send them again. The jobs they are about are not affected — you can still open them from Jobs.",
      confirmLabel: "Clear notifications",
      cancelLabel: "Keep them",
      destructive: true,
    });
    if (!confirmed) return;
    setActionError(null);
    const outcome = await removeMany(clearableIds);
    if (outcome.status === "failed") setActionError(outcome.message);
  }, [clearableIds, removeMany]);

  const canClear = loaded && clearableIds.length > 0;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: canClear
        ? () => <ClearHeaderButton onPress={() => void confirmClearAll()} />
        : () => null,
    });
  }, [canClear, confirmClearAll, navigation]);

  async function clearOne(alert: api.Notification) {
    setActionError(null);
    const outcome = await markRead(alert.id);
    if (outcome.status === "failed") setActionError(outcome.message);
  }

  // Appearance follows the live dismissal set even though position does not,
  // so clearing one is visibly acknowledged where it sits.
  const renderAlert = (alert: api.Notification) => {
    const job = alert.orderId ? jobs.find((candidate) => candidate.id === alert.orderId) : null;
    const listingHref = listingAlertHref(alert);
    // The inbox row names its support thread (the push does not).
    const supportThread = alert.threadId ?? undefined;
    // A Play or TestFlight release notice opens its store. The APK notice
    // keeps its inbox behaviour; the update card above offers the download.
    const release = releaseNoticeOpen(alert, alert.title, installChannel());
    const storeRelease = release && release.target !== "apk_download" ? release : null;
    return (
      <AlertCard
        key={alert.id}
        alert={alert}
        unread={isAlertUnread(alert, dismissed)}
        stageIndex={stageForAlert(alert, jobs)}
        onMarkRead={() => void clearOne(alert)}
        onDelete={() => void confirmDelete(alert)}
        job={job}
        onOpen={
          storeRelease
            ? () => void openRelease(storeRelease)
            : listingHref
            ? () => router.push(listingHref)
            : alert.orderId && alert.type === PICKUP_CHAT_NOTICE
              ? () => router.push(pickupChatHref(alert.orderId as string))
              : alert.orderId && alert.type === CLIENT_CHAT_NOTICE
              ? () => router.push(clientChatHref(alert.orderId as string))
              : alert.type === SHOP_HOURS_NOTICE
              ? () => router.push(SHOP_HOURS_ROUTE)
              : alert.type === SUPPORT_MESSAGE_PUSH_TYPE
              ? () => router.push(isChatThreadId(supportThread) ? chatThreadRoute(supportThread) : CHAT_LIST_ROUTE)
              : // A notice asking the shop to act opens its job even before the list has it.
              alert.orderId &&
                (job ||
                  alert.type === "shop_production_inactive" ||
                  alert.type === PICKUP_ISSUE_ALERT ||
                  isRefundAlert(alert.type) ||
                  isLapseAlert(alert.type))
              ? () => router.push(jobScreenHref(alert.orderId as string))
              : undefined
        }
      />
    );
  };

  const caveat = localOnlyCaveat(localOnly || dismissed.length > 0 || deleted.length > 0);

  // One flat list of section headers and cards, so a card keeps its cell (and
  // its swipe handler) for as long as its key does.
  const rows: AlertRow[] = [
    ...(unread.length ? [{ key: "section:new", kind: "new" as const }] : []),
    ...unread.map((alert) => ({ key: alert.id, kind: "alert" as const, alert })),
    ...(read.length ? [{ key: "section:earlier", kind: "earlier" as const }] : []),
    ...read.map((alert) => ({ key: alert.id, kind: "alert" as const, alert })),
  ];

  const renderRow = ({ item }: { item: AlertRow }) => {
    if (item.kind === "alert") return <View className="mt-3">{renderAlert(item.alert)}</View>;
    if (item.kind === "earlier") {
      return (
        <View className={unread.length ? "mt-8" : undefined}>
          <SectionHeader title="EARLIER" count={read.length} />
        </View>
      );
    }
    return (
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
    );
  };

  return (
    <View className="gg-screen">
      <FlatList
        className="flex-1"
        contentContainerClassName="gg-page pb-10 pt-4"
        showsVerticalScrollIndicator={false}
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={renderRow}
        // About a screenful. The rest follow in batches once the screen is up.
        initialNumToRender={8}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textMuted}
          />
        }
        ListHeaderComponent={
          <>
            <Text className="mb-4 text-body text-text-secondary">
              New work, production news, and what your jobs have paid.
            </Text>

            {/*
              The one place in this app that may raise the permission dialog, and
              the obvious one: a shop reading this screen is reading exactly what
              push would have put on its lock screen. It draws itself only when
              there is something to offer — see `pushOffer`.
            */}
            <PushEnableCard spacing="below" />

            {/*
              This phone's own news: a newer GRIDGO and what it brings, or the
              build that just landed. Local, so it never reaches the unread count.
            */}
            <AppUpdateNotices />

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
          </>
        }
        ListFooterComponent={
          <>
            {canClear ? (
              <View className={shown.length ? "mt-6" : undefined}>
                <SecondaryButton
                  label="Clear notifications"
                  onPress={() => void confirmClearAll()}
                />
              </View>
            ) : null}

            {loaded && shown.length > 0 && caveat ? (
              <Text className="mt-6 text-caption text-text-muted">{caveat}</Text>
            ) : null}
          </>
        }
      />
    </View>
  );
}

type AlertRow =
  | { key: string; kind: "new" | "earlier" }
  | { key: string; kind: "alert"; alert: api.Notification };

/**
 * The inbox action in the stack header.
 *
 * NativeWind does not reach a React Navigation header control, so the type
 * and the 44dp target are tokens in `style` — the same ink as "Mark all read"
 * on the page, just where this screen's title row actually lives.
 */
function ClearHeaderButton({ onPress }: { onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Clear notifications"
      style={{
        minHeight: touchTarget,
        minWidth: touchTarget,
        justifyContent: "center",
        alignItems: "flex-end",
        paddingHorizontal: spacing.xs,
      }}
    >
      {({ pressed }) => (
        <Text
          style={{
            ...typography.button,
            color: colors.textPrimary,
            opacity: pressed ? 0.6 : 1,
          }}
        >
          Clear
        </Text>
      )}
    </Pressable>
  );
}
