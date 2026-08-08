import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { GridgoLogo } from "@/components/GridgoLogo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { StatusChip } from "@/components/StatusChip";
import { formatDeadlineFull, nextPromisedDeadline } from "@/lib/dates";
import * as api from "@/lib/api";
import {
  isAwaitingDecision,
  isInProductionPipeline,
  mostUrgentJob,
  presentOrderState,
  primaryAction,
} from "@/lib/jobState";
import { summarizePayouts } from "@/lib/payout";
import { useAlertsStore } from "@/store/alerts";
import { useSession } from "@/store/session";
import { useThemeColors } from "@/hooks/useTheme";

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
      setError(
        e instanceof Error
          ? e.message
          : `Cannot load jobs from ${api.getApiBase()}. Check that gridgo-api is running.`,
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

  const pending = jobs.filter(isAwaitingDecision).length;
  const inProduction = jobs.filter(isInProductionPipeline).length;
  const nextDeadline = nextPromisedDeadline(jobs);
  const payout = summarizePayouts(jobs);
  const urgent = mostUrgentJob(jobs);
  const urgentAction = urgent ? primaryAction(urgent.state) : null;

  return (
    <View className="gg-screen">
      <ScrollView className="flex-1" contentContainerClassName="gg-page pb-10" showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title={user?.supplierName || "Supplier"}
          subtitle="Time-sensitive production actions"
          right={<GridgoLogo size={28} role="supplier" />}
        />

        {loading && !jobs.length ? (
          <View className="items-center py-12">
            <ActivityIndicator color={colors.textMuted} />
            <Text className="mt-3 text-body text-text-muted">Loading your floor…</Text>
          </View>
        ) : null}

        {error ? (
          <View className="mb-4">
            <EmptyState
              title="Jobs unavailable"
              body={error}
              actionLabel="Try again"
              onAction={() => void reload()}
            />
          </View>
        ) : null}

        <View className="flex-row gap-3">
          <View className="gg-card flex-1 gap-1">
            <Text className="text-caption text-text-muted">Awaiting accept</Text>
            <Text className="text-display text-text-primary">{pending}</Text>
          </View>
          <View className="gg-card flex-1 gap-1">
            <Text className="text-caption text-text-muted">In production</Text>
            <Text className="text-display text-text-primary">{inProduction}</Text>
          </View>
        </View>

        <View className="gg-card mt-3 gap-2">
          <Text className="text-caption text-text-muted">Next promised deadline</Text>
          <Text className="text-body-lg font-medium text-text-primary">
            {nextDeadline ? formatDeadlineFull(nextDeadline) : "No dated jobs yet"}
          </Text>
        </View>

        <Pressable
          onPress={() => router.push("/payout")}
          accessibilityRole="button"
          accessibilityLabel="Open protected payment"
          className="gg-card mt-3 gap-2"
        >
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-caption text-text-muted">Protected payment</Text>
            <Text className="text-caption text-brand">View all</Text>
          </View>
          <Text className="text-body-lg font-medium text-text-primary">
            {payout.heldCount === 0
              ? "Nothing held right now"
              : `${payout.heldCount} job${payout.heldCount === 1 ? "" : "s"} held · ${api.formatPhp(payout.heldGrossMinor)} gross`}
          </Text>
          <Text className="text-caption text-text-muted">
            Commission and net are not on the demo ledger yet.
          </Text>
        </Pressable>

        {urgent && urgentAction ? (
          <View className="gg-card mt-6 gap-3">
            <Text className="text-overline text-text-muted">NEEDS YOU</Text>
            <Text className="text-h3 text-text-primary">{urgent.title}</Text>
            <StatusChip
              tone={presentOrderState(urgent.state).tone}
              label={presentOrderState(urgent.state).label}
              icon={presentOrderState(urgent.state).icon}
            />
            <Text className="text-body text-text-secondary">
              Due {formatDeadlineFull(urgent.deadline || urgent.promisedDate)}
            </Text>
            <PrimaryButton
              label={urgentAction.label}
              onPress={() => router.push(`/job/${urgent.id}`)}
            />
          </View>
        ) : !loading && !error ? (
          <View className="mt-6">
            <EmptyState
              title="Floor is clear"
              body="No jobs need a decision right now. Open Jobs when Operations matches new work."
              actionLabel="Open jobs"
              onAction={() => router.push("/(tabs)/jobs")}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
