import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { ChevronRight, Headset, MessagesSquare } from "lucide-react-native";

import { AlertsBell } from "@/components/AlertsBell";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SkeletonList } from "@/components/Skeleton";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useReadVersion } from "@/hooks/useReadVersion";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { CLIENT_CHAT_NOTICE, clientChatHref, clientChatOf, showsClientChat } from "@/lib/clientChat";
import { orderReference } from "@/lib/orderReference";
import { useAlertsStore } from "@/store/alerts";
import { isShopStaff, useSession } from "@/store/session";
import { useSupportChatStore } from "@/store/supportChat";

/**
 * Messages: every conversation in one place (gridgo-supplier#269).
 *
 * The GRIDGO team first — the shop's own line to Operations, the Owner's only
 * — then one row per job whose client chat has opened, open ones first. The
 * conversations themselves are the screens they always were.
 */
export default function MessagesScreen() {
  const colors = useThemeColors();
  const staff = useSession((s) => isShopStaff(s.user));
  const teamUnread = useSupportChatStore((s) => s.unreadCount);
  const inbox = useAlertsStore((state) => state.inbox);
  const unreadIds = useAlertsStore((state) => state.unreadIds);
  const unreadOrders = useMemo(() => {
    const ids = new Set(unreadIds);
    return (inbox ?? [])
      .filter((row) => row.type === CLIENT_CHAT_NOTICE && ids.has(row.id) && row.orderId)
      .map((row) => row.orderId as string);
  }, [inbox, unreadIds]);
  const [jobs, setJobs] = useState<api.Order[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const beginRead = useReadVersion();
  const reload = useCallback(async () => {
    const current = beginRead();
    setLoading(true);
    try {
      const list = await api.listJobs();
      if (!current()) return;
      setJobs(list);
      setError(null);
      setLoaded(true);
    } catch (e) {
      if (!current()) return;
      setError(humanizeApiError(e, offlineMessage("load your messages")));
    } finally {
      if (current()) setLoading(false);
    }
  }, [beginRead]);

  useLiveRefresh(["jobs", "orders"], reload);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  const { refreshing, onRefresh } = usePullToRefresh(reload);

  const chats = useMemo(
    () =>
      jobs
        .map((job) => ({ job, chat: clientChatOf(job) }))
        .filter((row) => showsClientChat(row.chat))
        .sort(
          (a, b) =>
            Number(unreadOrders.includes(b.job.id)) - Number(unreadOrders.includes(a.job.id)) ||
            Number(b.chat?.status === "open") - Number(a.chat?.status === "open"),
        ),
    [jobs, unreadOrders],
  );

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-10"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
      >
        <ScreenHeader title="Messages" right={<AlertsBell />} />

        {staff ? null : (
          <Pressable
            onPress={() => router.push("/chat")}
            accessibilityRole="button"
            accessibilityLabel={teamUnread > 0 ? `GRIDGO team, ${teamUnread} unread` : "GRIDGO team"}
            className="gg-card gg-touch mb-6 flex-row items-center gap-3"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            testID="messages-gridgo-team"
          >
            <View className="h-11 w-11 items-center justify-center rounded-pill bg-surface-variant">
              <Headset size={20} color={colors.textPrimary} strokeWidth={2} aria-hidden />
            </View>
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="text-body font-medium text-text-primary">GRIDGO team</Text>
              <Text className="text-caption text-text-muted">Questions about your shop, payouts or a job</Text>
            </View>
            {teamUnread > 0 ? <UnreadDot count={teamUnread} /> : null}
            <ChevronRight size={18} color={colors.textMuted} aria-hidden />
          </Pressable>
        )}

        <Text className="mb-2 text-body font-medium text-text-secondary">Clients</Text>

        {loading && !loaded ? <SkeletonList label="Loading your messages" count={3} /> : null}
        {error && !loaded ? (
          <EmptyState title="Messages are not reachable" body={error} actionLabel="Try again" onAction={() => void reload()} />
        ) : error ? (
          <View className="mb-4">
            <ErrorNotice message={error} onRetry={() => void reload()} />
          </View>
        ) : null}

        {loaded && !chats.length ? (
          <EmptyState
            title="No client messages yet"
            body="Once you accept a job, its client can message you here."
          />
        ) : null}

        <View className="gap-2">
          {chats.map(({ job, chat }) => {
            const unread = unreadOrders.includes(job.id);
            const ref = orderReference(job.id);
            const open = chat?.status === "open";
            return (
              <Pressable
                key={job.id}
                onPress={() => router.push(clientChatHref(job.id))}
                accessibilityRole="button"
                accessibilityLabel={`Messages about ${job.title}${unread ? ", new messages" : ""}`}
                className="gg-touch flex-row items-center gap-3 rounded-card border border-outline bg-surface px-3 py-3"
                style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
                testID="messages-client-row"
              >
                <View
                  className={
                    open
                      ? "h-11 w-11 items-center justify-center rounded-pill bg-accent"
                      : "h-11 w-11 items-center justify-center rounded-pill bg-surface-variant"
                  }
                >
                  <MessagesSquare size={18} color={open ? colors.accentOn : colors.textSecondary} strokeWidth={2} aria-hidden />
                </View>
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text className="text-body font-medium text-text-primary" numberOfLines={1}>
                    {job.title}
                  </Text>
                  <Text className="text-caption text-text-muted" numberOfLines={1}>
                    {[ref ? `#${ref}` : null, open ? "Open" : "Closed"].filter(Boolean).join("  ")}
                  </Text>
                </View>
                {unread ? <UnreadDot label="New" /> : null}
                <ChevronRight size={18} color={colors.textMuted} aria-hidden />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function UnreadDot({ count, label }: { count?: number; label?: string }) {
  return (
    <View className="rounded-pill bg-accent px-2 py-0.5">
      <Text className="text-caption font-medium text-accent-on">{label ?? (count && count > 9 ? "9+" : String(count))}</Text>
    </View>
  );
}
