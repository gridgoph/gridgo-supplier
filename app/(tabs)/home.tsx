import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { router, useFocusEffect } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { GridgoLogo } from "@/components/GridgoLogo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SkeletonBlock } from "@/components/Skeleton";
import { StatTile } from "@/components/StatTile";
import { StatusChip } from "@/components/StatusChip";
import { formatDeadlineFull } from "@/lib/dates";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import {
  isAwaitingDecision,
  isInProductionPipeline,
  mostUrgentJob,
  presentOrderState,
  primaryAction,
  routeForAction,
} from "@/lib/jobState";
import { summarizePayouts } from "@/lib/payout";
import { deadlineUrgency } from "@/lib/urgency";
import { useAlertsStore } from "@/store/alerts";
import { useSession } from "@/store/session";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * The floor at a glance.
 *
 * The one job that needs the shop comes first and carries the screen's only
 * yellow action; counts and money sit underneath it, quiet.
 */
export default function HomeScreen() {
  const { user } = useSession();
  const colors = useThemeColors();
  const setUnreadCount = useAlertsStore((s) => s.setUnreadCount);
  const [jobs, setJobs] = useState<api.Order[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [list, notifications] = await Promise.all([
        api.listJobs(),
        api.listNotifications().catch(() => [] as api.Notification[]),
      ]);
      setJobs(list);
      setUnreadCount(notifications.filter((n) => !n.read).length);
      setError(null);
      setLoaded(true);
    } catch (e) {
      setError(humanizeApiError(e, offlineMessage("load your floor")));
    } finally {
      setLoading(false);
    }
  }, [setUnreadCount]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(reload);
  const firstLoad = loading && !loaded;
  const pending = jobs.filter(isAwaitingDecision).length;
  const inProduction = jobs.filter(isInProductionPipeline).length;
  const payout = summarizePayouts(jobs);
  const urgent = mostUrgentJob(jobs);
  const urgentAction = urgent ? primaryAction(urgent.state) : null;
  const urgentStatus = urgent ? presentOrderState(urgent.state) : null;
  const urgency = urgent
    ? deadlineUrgency(urgent.promisedDate || urgent.deadline)
    : null;

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
          title={user?.supplierName || "Supplier"}
          subtitle="Your floor right now"
          right={<GridgoLogo size={40} role="supplier" />}
        />

        {/*
          Shaped to the screen that replaces it — the job card with its action,
          the two tiles, the payment row — so the floor does not grow under the
          shop's thumb the moment it lands.
        */}
        {firstLoad ? (
          <View accessibilityRole="progressbar" accessibilityLabel="Loading your floor">
            <View className="gg-card gap-5">
              <View className="gap-3">
                <View className="flex-row items-center justify-between gap-3">
                  <SkeletonBlock className="h-4 w-28" />
                  <SkeletonBlock className="h-6 w-24 rounded-pill" />
                </View>
                <SkeletonBlock className="h-7 w-3/4" />
                <View className="gap-1">
                  <SkeletonBlock className="h-5 w-2/3" />
                  <SkeletonBlock className="h-5 w-2/5" />
                </View>
              </View>
              <SkeletonBlock className="h-11 w-full" />
            </View>

            <View className="mt-6 flex-row gap-3">
              <View className="flex-1 gap-2 rounded-card border border-outline bg-surface px-4 py-3">
                <SkeletonBlock className="h-7 w-12" />
                <SkeletonBlock className="h-3 w-4/5" />
              </View>
              <View className="flex-1 gap-2 rounded-card border border-outline bg-surface px-4 py-3">
                <SkeletonBlock className="h-7 w-12" />
                <SkeletonBlock className="h-3 w-4/5" />
              </View>
            </View>

            <View className="gg-card mt-3 gap-2">
              <SkeletonBlock className="h-4 w-32" />
              <SkeletonBlock className="h-6 w-2/5" />
              <SkeletonBlock className="h-4 w-4/5" />
            </View>
          </View>
        ) : null}

        {error && !loaded ? (
          <EmptyState
            title="Your floor is not reachable"
            body={error}
            actionLabel="Try again"
            onAction={() => void reload()}
          />
        ) : null}

        {!firstLoad && !(error && !loaded) ? (
          <>
            {urgent && urgentAction && urgentStatus ? (
              <View className="gg-card gap-5">
                <View className="gap-3">
                  <View className="flex-row items-center justify-between gap-3">
                    <Text className="text-overline text-text-muted">NEEDS YOU NEXT</Text>
                    <StatusChip
                      tone={urgentStatus.tone}
                      label={urgentStatus.label}
                      icon={urgentStatus.icon}
                    />
                  </View>
                  <Text className="text-h2 text-text-primary">{urgent.title}</Text>
                  <View className="gap-0.5">
                    <Text className="text-body text-text-secondary">
                      {formatDeadlineFull(urgent.promisedDate || urgent.deadline)}
                    </Text>
                    {urgency && urgency.level !== "undated" ? (
                      <Text
                        className={
                          urgency.level === "overdue"
                            ? "text-body font-medium text-error"
                            : urgency.level === "urgent"
                              ? "text-body font-medium text-warning"
                              : "text-body text-text-muted"
                        }
                      >
                        {urgency.label}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <PrimaryButton
                  label={urgentAction.label}
                  onPress={() =>
                    router.push({
                      pathname: routeForAction(urgentAction.kind),
                      params: { id: urgent.id, action: urgentAction.kind },
                    })
                  }
                />
              </View>
            ) : (
              <EmptyState
                title="Floor is clear"
                body="Nothing needs a decision right now. Check Schedule for what is coming, or Jobs when GRIDGO matches new work."
                actionLabel="Open schedule"
                onAction={() => router.push("/(tabs)/schedule")}
              />
            )}

            <View className="mt-6 flex-row gap-3">
              <StatTile label="Awaiting your decision" value={pending} />
              <StatTile label="In production" value={inProduction} />
            </View>

            <Pressable
              onPress={() => router.push("/payout")}
              accessibilityRole="button"
              accessibilityLabel="Open protected payment"
              className="gg-touch mt-3 flex-row items-center gap-3 rounded-card border border-outline bg-surface p-4"
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            >
              <View className="min-w-0 flex-1 gap-1">
                <Text className="text-caption text-text-muted">Protected payment</Text>
                <Text className="text-h3 text-text-primary">
                  {payout.heldCount === 0
                    ? "Nothing held"
                    : api.formatPhp(payout.heldGrossMinor)}
                </Text>
                <Text className="text-caption text-text-muted">
                  {payout.heldCount === 0
                    ? "Money appears here once a client pays for a job you accepted."
                    : `Held across ${payout.heldCount} job${payout.heldCount === 1 ? "" : "s"} until each one settles.`}
                </Text>
              </View>
              <ChevronRight size={20} color={colors.textMuted} accessibilityElementsHidden />
            </Pressable>

            {error ? (
              <Text className="mt-4 text-caption text-text-muted">
                Last refresh did not reach GRIDGO, so these figures may be behind. Pull down to
                try again.
              </Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
