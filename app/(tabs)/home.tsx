import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { router, useFocusEffect } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { GridgoLogo } from "@/components/GridgoLogo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
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
            refreshing={loading}
            onRefresh={() => void reload()}
            tintColor={colors.textMuted}
          />
        }
      >
        <ScreenHeader
          title={user?.supplierName || "Supplier"}
          subtitle="Your floor right now"
          right={<GridgoLogo size={28} role="supplier" />}
        />

        {loading && !jobs.length ? (
          <View className="items-center py-12">
            <ActivityIndicator color={colors.textMuted} />
            <Text className="mt-3 text-body text-text-muted">Loading your floor…</Text>
          </View>
        ) : null}

        {error ? (
          <EmptyState
            title="Jobs unavailable"
            body={error}
            actionLabel="Try again"
            onAction={() => void reload()}
          />
        ) : null}

        {!error && urgent && urgentAction && urgentStatus ? (
          <View className="gg-card gap-4">
            <View className="gap-3">
              <Text className="text-overline text-text-muted">NEEDS YOU NEXT</Text>
              <Text className="text-h2 text-text-primary">{urgent.title}</Text>
              <View className="flex-row">
                <StatusChip
                  tone={urgentStatus.tone}
                  label={urgentStatus.label}
                  icon={urgentStatus.icon}
                />
              </View>
              <Text
                className={
                  urgency?.level === "overdue"
                    ? "text-body font-medium text-error"
                    : "text-body text-text-secondary"
                }
              >
                {formatDeadlineFull(urgent.promisedDate || urgent.deadline)}
                {urgency && urgency.level !== "undated" ? ` · ${urgency.label}` : ""}
              </Text>
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
        ) : !loading && !error ? (
          <EmptyState
            title="Floor is clear"
            body="Nothing needs a decision right now. Check Schedule for what is coming, or Jobs when GRIDGO matches new work."
            actionLabel="Open schedule"
            onAction={() => router.push("/(tabs)/schedule")}
          />
        ) : null}

        <View className="mt-6 flex-row gap-3">
          <StatTile label="Awaiting accept" value={pending} />
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
            <Text className="text-body-lg font-medium text-text-primary">
              {payout.heldCount === 0
                ? "Nothing held right now"
                : `${api.formatPhp(payout.heldGrossMinor)} held`}
            </Text>
            <Text className="text-caption text-text-muted">
              {payout.heldCount === 0
                ? "Money appears here once a client pays for a job you accepted."
                : `Across ${payout.heldCount} job${payout.heldCount === 1 ? "" : "s"}. Commission and net are not on the demo ledger.`}
            </Text>
          </View>
          <ChevronRight size={20} color={colors.textMuted} accessibilityElementsHidden />
        </Pressable>
      </ScrollView>
    </View>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <View className="gg-card flex-1 gap-1">
      <Text className="text-caption text-text-muted">{label}</Text>
      <Text className="text-h1 text-text-primary">{value}</Text>
    </View>
  );
}
